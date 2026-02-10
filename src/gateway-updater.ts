import { ChildProcess, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Notification } from "electron";
import {
  UPDATE_CHECK_INTERVAL_MS,
  UPDATE_INITIAL_DELAY_MS,
  resolveGatewayDir,
  resolveGatewayLogPath,
  resolveNodeBin,
  resolveNpmCliJs,
  resolveResourcesPath,
  IS_WIN,
} from "./constants";
import { GatewayProcess } from "./gateway-process";
import * as log from "./logger";

// 诊断日志（复用 gateway.log，便于统一排查）
const LOG_PATH = resolveGatewayLogPath();

function diagLog(msg: string): void {
  const line = `[${new Date().toISOString()}] [updater] ${msg}\n`;
  process.stderr.write(line);
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch {}
}

/** 更新状态 */
export type UpdateState =
  | "idle"        // 空闲
  | "checking"    // 正在检查
  | "updating"    // 正在更新
  | "error";      // 上次操作出错

/**
 * GatewayUpdater —— OpenClaw 内核自动更新器
 *
 * 职责：
 *  1. 定时（24h）+ 启动延迟（30s）检查 openclaw 是否有新版本
 *  2. 若有新版本，先停止 Gateway → npm update → 重启 Gateway
 *  3. 通知用户更新结果
 */
export class GatewayUpdater {
  private gateway: GatewayProcess;
  private state: UpdateState = "idle";
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private onStateChange?: () => void;

  constructor(opts: {
    gateway: GatewayProcess;
    onStateChange?: () => void;
  }) {
    this.gateway = opts.gateway;
    this.onStateChange = opts.onStateChange;
  }

  /** 获取当前更新状态 */
  getState(): UpdateState {
    return this.state;
  }

  /**
   * 启动自动更新调度：
   *  - 延迟 30s 执行首次检查
   *  - 之后每 24h 检查一次
   */
  start(): void {
    diagLog("updater started");

    // 首次延迟检查
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.checkAndUpdate();
    }, UPDATE_INITIAL_DELAY_MS);

    // 定时检查
    this.intervalTimer = setInterval(() => {
      void this.checkAndUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  /** 停止所有定时器 */
  stop(): void {
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    diagLog("updater stopped");
  }

  /**
   * 手动触发一次检查更新（也被定时器调用）。
   * 如果已经在检查/更新中，直接跳过。
   */
  async checkAndUpdate(): Promise<void> {
    if (this.state === "checking" || this.state === "updating") {
      diagLog("skip: already in progress");
      return;
    }

    try {
      this.setState("checking");
      diagLog("checking for updates...");

      const currentVersion = this.getCurrentVersion();
      if (!currentVersion) {
        diagLog("cannot read current version, skip");
        this.setState("idle");
        return;
      }
      diagLog(`current version: ${currentVersion}`);

      const latestVersion = await this.fetchLatestVersion();
      if (!latestVersion) {
        diagLog("cannot fetch latest version, skip");
        this.setState("idle");
        return;
      }
      diagLog(`latest version: ${latestVersion}`);

      if (latestVersion === currentVersion) {
        diagLog("already up to date");
        this.setState("idle");
        return;
      }

      // 有新版本，执行更新
      diagLog(`update available: ${currentVersion} → ${latestVersion}`);
      this.setState("updating");
      this.notify("OpenClaw 内核更新", `正在更新 ${currentVersion} → ${latestVersion}...`);

      // 停止 Gateway
      diagLog("stopping gateway for update...");
      this.gateway.stop();
      await sleep(2000); // 等待 Gateway 完全停止

      // 执行 npm update
      const updateOk = await this.runNpmUpdate();
      if (!updateOk) {
        diagLog("npm update failed");
        this.setState("error");
        this.notify("OpenClaw 内核更新失败", "npm update 执行失败，请查看日志。");
        // 无论更新是否成功，都重新启动 Gateway
        diagLog("restarting gateway after failed update...");
        await this.gateway.start();
        return;
      }

      // 验证更新后的版本
      const updatedVersion = this.getCurrentVersion();
      diagLog(`version after update: ${updatedVersion ?? "unknown"}`);

      // 重新启动 Gateway
      diagLog("restarting gateway after update...");
      await this.gateway.start();

      this.setState("idle");
      this.notify(
        "OpenClaw 内核更新完成",
        `已从 ${currentVersion} 更新到 ${updatedVersion ?? latestVersion}`
      );
      diagLog("update completed successfully");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diagLog(`update error: ${msg}`);
      log.error(`[updater] ${msg}`);
      this.setState("error");

      // 确保 Gateway 恢复运行
      if (this.gateway.getState() !== "running") {
        diagLog("restarting gateway after error...");
        try {
          await this.gateway.start();
        } catch (startErr) {
          diagLog(`gateway restart after error failed: ${startErr}`);
        }
      }
    }
  }

  // ── 内部方法 ──

  /** 读取当前安装的 openclaw 版本（从 package.json） */
  private getCurrentVersion(): string | null {
    try {
      const pkgPath = path.join(
        resolveGatewayDir(),
        "node_modules",
        "openclaw",
        "package.json"
      );
      if (!fs.existsSync(pkgPath)) {
        diagLog(`package.json not found: ${pkgPath}`);
        return null;
      }
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      return typeof pkg.version === "string" ? pkg.version : null;
    } catch (err) {
      diagLog(`read current version error: ${err}`);
      return null;
    }
  }

  /** 通过 npm view 获取 registry 上最新版本 */
  private fetchLatestVersion(): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const nodeBin = resolveNodeBin();
        const npmCliJs = resolveNpmCliJs();

        if (!fs.existsSync(nodeBin)) {
          diagLog(`node binary not found: ${nodeBin}`);
          resolve(null);
          return;
        }
        if (!fs.existsSync(npmCliJs)) {
          diagLog(`npm-cli.js not found: ${npmCliJs}`);
          resolve(null);
          return;
        }

        const args = [npmCliJs, "view", "openclaw", "version"];
        diagLog(`spawn: ${nodeBin} ${args.join(" ")}`);

        const child: ChildProcess = spawn(nodeBin, args, {
          cwd: resolveGatewayDir(),
          env: {
            ...process.env,
            PATH: this.buildEnvPath(),
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          timeout: 30_000,
        });

        let stdout = "";
        let stderr = "";

        child.stdout?.on("data", (d: Buffer) => {
          stdout += d.toString();
        });
        child.stderr?.on("data", (d: Buffer) => {
          stderr += d.toString();
        });

        child.on("error", (err) => {
          diagLog(`npm view spawn error: ${err.message}`);
          resolve(null);
        });

        child.on("exit", (code) => {
          if (code !== 0) {
            diagLog(`npm view exit code=${code} stderr=${stderr.trim()}`);
            resolve(null);
            return;
          }
          const version = stdout.trim();
          // 简单校验版本号格式
          if (/^\d+\.\d+\.\d+/.test(version)) {
            resolve(version);
          } else {
            diagLog(`npm view returned unexpected output: ${version}`);
            resolve(null);
          }
        });
      } catch (err) {
        diagLog(`fetchLatestVersion error: ${err}`);
        resolve(null);
      }
    });
  }

  /** 执行 npm update openclaw */
  private runNpmUpdate(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const nodeBin = resolveNodeBin();
        const npmCliJs = resolveNpmCliJs();
        const gatewayDir = resolveGatewayDir();

        const args = [npmCliJs, "update", "openclaw"];
        diagLog(`spawn: ${nodeBin} ${args.join(" ")} cwd=${gatewayDir}`);

        const child: ChildProcess = spawn(nodeBin, args, {
          cwd: gatewayDir,
          env: {
            ...process.env,
            NODE_ENV: "production",
            PATH: this.buildEnvPath(),
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          // npm update 可能比较慢，给 5 分钟超时
          timeout: 300_000,
        });

        child.stdout?.on("data", (d: Buffer) => {
          const s = d.toString().trimEnd();
          if (s) diagLog(`npm update stdout: ${s}`);
        });
        child.stderr?.on("data", (d: Buffer) => {
          const s = d.toString().trimEnd();
          if (s) diagLog(`npm update stderr: ${s}`);
        });

        child.on("error", (err) => {
          diagLog(`npm update spawn error: ${err.message}`);
          resolve(false);
        });

        child.on("exit", (code) => {
          diagLog(`npm update exit code=${code}`);
          resolve(code === 0);
        });
      } catch (err) {
        diagLog(`runNpmUpdate error: ${err}`);
        resolve(false);
      }
    });
  }

  /** 构建 PATH 环境变量，内嵌 runtime 优先 */
  private buildEnvPath(): string {
    const runtimeDir = path.join(resolveResourcesPath(), "runtime");
    return runtimeDir + path.delimiter + (process.env.PATH ?? "");
  }

  /** 发送桌面通知 */
  private notify(title: string, body: string): void {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show();
      }
    } catch (err) {
      diagLog(`notification error: ${err}`);
    }
    log.info(`[updater] ${title}: ${body}`);
  }

  /** 更新内部状态并触发回调 */
  private setState(s: UpdateState): void {
    this.state = s;
    this.onStateChange?.();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
