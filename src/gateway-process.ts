import { ChildProcess, spawn } from "child_process";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import { app } from "electron";
import {
  DEFAULT_PORT,
  HEALTH_TIMEOUT_MS,
  HEALTH_POLL_INTERVAL_MS,
  CRASH_COOLDOWN_MS,
  IS_WIN,
  resolveGatewayLogPath,
  resolveNodeBin,
  resolveNodeExtraEnv,
  resolveNpmBin,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveResourcesPath,
  resolveClawhubEntry,
  resolveUserBinDir,
  resolveUserStateDir,
} from "./constants";
import { uninstallGatewayDaemon, getPortPid } from "./install-detector";

// 诊断日志（固定写入 ~/.openclaw/gateway.log，便于用户定位）
const LOG_PATH = resolveGatewayLogPath();
const MAX_DIAG_LOG_SIZE = 5 * 1024 * 1024;
const DIAG_ROTATION_CHECK_INTERVAL = 1000;
let diagWriteCount = 0;

function diagLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { process.stderr.write(line); } catch {}
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
    if (++diagWriteCount >= DIAG_ROTATION_CHECK_INTERVAL) {
      if (fs.statSync(LOG_PATH).size > MAX_DIAG_LOG_SIZE) {
        fs.writeFileSync(LOG_PATH, "[truncated]\n");
      }
      diagWriteCount = 0;
    }
  } catch {}
}

export type GatewayState = "stopped" | "starting" | "running" | "stopping";

interface GatewayOptions {
  port?: number;
  token: string;
  onStateChange?: (state: GatewayState) => void;
}

export class GatewayProcess {
  private proc: ChildProcess | null = null;
  private state: GatewayState = "stopped";
  private port: number;
  private token: string;
  private extraEnv: Record<string, string> = {};
  private lastCrashTime = 0;
  private onStateChange?: (state: GatewayState) => void;
  private startedAt: number | null = null;

  // 世代计数器：每次 spawn 递增，exit handler 只处理同代进程的退出
  private generation = 0;

  constructor(opts: GatewayOptions) {
    this.port = opts.port ?? DEFAULT_PORT;
    this.token = opts.token;
    this.onStateChange = opts.onStateChange;
  }

  getState(): GatewayState {
    return this.state;
  }

  getPort(): number {
    return this.port;
  }

  getStartedAt(): number | null {
    return this.startedAt;
  }

  // 更新端口（在 start 前调用，用于冲突解决场景）
  setPort(port: number): void {
    if (port > 0 && port <= 65535) {
      this.port = port;
    }
  }

  getToken(): string {
    return this.token;
  }

  // 更新 Gateway 鉴权 token（在 start 前调用）
  setToken(token: string): void {
    const trimmed = token.trim();
    if (!trimmed) return;
    this.token = trimmed;
  }

  // 设置额外环境变量（在 start 前调用，spawn 时展开到子进程）
  setExtraEnv(env: Record<string, string>): void {
    this.extraEnv = { ...this.extraEnv, ...env };
  }

  // 启动 Gateway 子进程
  async start(): Promise<void> {
    if (this.state === "running" || this.state === "starting") return;

    // 前一次 stop 还未完成，等待其结束再启动
    if (this.state === "stopping") {
      diagLog("start() 等待前一次 stop 完成");
      const deadline = Date.now() + 6000;
      while (this.state === "stopping" && Date.now() < deadline) {
        await sleep(100);
      }
      if (this.state === "stopping") {
        diagLog("WARN: start() 等待 stop 超时，强制标记 stopped");
        this.proc = null;
        this.setState("stopped");
      }
    }

    // 崩溃冷却期
    const elapsed = Date.now() - this.lastCrashTime;
    if (this.lastCrashTime > 0 && elapsed < CRASH_COOLDOWN_MS) {
      await sleep(CRASH_COOLDOWN_MS - elapsed);
    }

    this.setState("starting");

    const nodeBin = resolveNodeBin();
    const entry = resolveGatewayEntry();
    const cwd = resolveGatewayCwd();

    // 诊断：打印所有关键路径
    diagLog(`--- gateway start ---`);
    diagLog(`platform=${process.platform} arch=${process.arch} packaged=${app.isPackaged}`);
    diagLog(`resourcesPath=${resolveResourcesPath()}`);
    diagLog(`nodeBin=${nodeBin} exists=${fs.existsSync(nodeBin)}`);
    diagLog(`entry=${entry} exists=${fs.existsSync(entry)}`);
    diagLog(`cwd=${cwd} exists=${fs.existsSync(cwd)}`);
    diagLog(`token=${maskToken(this.token)} port=${this.port}`);

    // 检查关键文件
    if (!fs.existsSync(nodeBin)) {
      diagLog(`FATAL: node 二进制不存在`);
      this.setState("stopped");
      return;
    }
    if (!fs.existsSync(entry)) {
      diagLog(`FATAL: gateway 入口不存在`);
      this.setState("stopped");
      return;
    }

    // 清理升级残留的 lockfile（旧 gateway 可能是半死状态：进程活但 HTTP 不响应）
    await this.cleanStaleLockfile();

    // 卸载 OpenClaw 系统守护进程 + 清理 tmpdir 锁文件，防止杀进程后被自动重启
    await uninstallGatewayDaemon();

    // 启动前探测端口，若有旧 gateway 则自动停止
    const portBusy = await this.probeHealth();
    if (portBusy) {
      diagLog(`WARN: 端口 ${this.port} 已有服务响应，尝试自动停止旧 gateway`);
      await this.stopExistingGateway(nodeBin, entry, cwd);
    }

    // 确保 clawhub CLI wrapper 就绪
    ensureClawhubWrapper(nodeBin);

    // 组装 PATH：用户 bin 目录 + 内嵌 runtime 优先
    const userBinDir = resolveUserBinDir();
    const runtimeDir = path.join(resolveResourcesPath(), "runtime");
    const envPath = userBinDir + path.delimiter + runtimeDir + path.delimiter + (process.env.PATH ?? "");

    // 递增世代，标记本次 spawn 的身份
    const gen = ++this.generation;

    // 不传 --port 和 --bind，让 gateway 自行从配置文件/环境变量解析
    const args = [entry, "gateway", "run"];
    diagLog(`spawn: ${nodeBin} ${args.join(" ")} (gen=${gen})`);

    this.proc = spawn(nodeBin, args, {
      cwd,
      env: {
        ...process.env,
        ...resolveNodeExtraEnv(),
        NODE_ENV: "production",
        // 禁止 openclaw 入口在子进程内二次 respawn，避免 Windows 闪烁控制台窗口
        OPENCLAW_NO_RESPAWN: "1",
        OPENCLAW_LENIENT_CONFIG: "1",
        // 统一状态目录：Windows 上 HOME 和 USERPROFILE 可能指向不同路径，
        // OneClaw 用 USERPROFILE 写配置，openclaw 用 HOME 优先读配置，
        // 显式传入 OPENCLAW_STATE_DIR 消除歧义。
        OPENCLAW_STATE_DIR: resolveUserStateDir(),
        // 告诉 openclaw 安装根目录，使 extensions 路径解析不依赖 __dirname（asar 内会失败）
        OPENCLAW_INSTALL_ROOT: resolveResourcesPath(),
        OPENCLAW_GATEWAY_TOKEN: this.token,
        OPENCLAW_NPM_BIN: resolveNpmBin(),
        PATH: envPath,
        ...this.extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const childPid = this.proc.pid ?? -1;

    // 捕获 spawn 错误（如二进制不可执行）
    this.proc.on("error", (err) => {
      diagLog(`spawn error: ${err.message}`);
    });

    // 转发日志（同时写入诊断文件）
    this.proc.stdout?.on("data", (d: Buffer) => {
      const s = d.toString();
      try { process.stdout.write(`[gateway] ${s}`); } catch {}
      diagLog(`stdout: ${s.trimEnd()}`);
    });
    this.proc.stderr?.on("data", (d: Buffer) => {
      const s = d.toString();
      try { process.stderr.write(`[gateway] ${s}`); } catch {}
      diagLog(`stderr: ${s.trimEnd()}`);
    });

    // 退出处理：通过世代号隔离，只有同代进程的退出才影响状态机
    this.proc.on("exit", (code, signal) => {
      diagLog(`child exit: code=${code} signal=${signal} gen=${gen} currentGen=${this.generation} prevState=${this.state}`);
      if (gen !== this.generation) {
        diagLog(`SKIP: 旧世代 exit 事件 (gen=${gen}, current=${this.generation})，不影响状态机`);
        return;
      }
      if (this.state === "stopping") {
        this.setState("stopped");
      } else if (this.state === "running") {
        // 运行中非预期退出 = 崩溃
        diagLog("WARN: gateway 运行中意外退出");
        this.lastCrashTime = Date.now();
        this.setState("stopped");
      } else {
        // starting 阶段退出（如端口冲突）
        this.lastCrashTime = Date.now();
        this.setState("stopped");
      }
      this.proc = null;
    });

    // 轮询健康检查
    const healthy = await this.waitForHealth(HEALTH_TIMEOUT_MS, childPid);
    if (healthy) {
      // 健康探测通过后，等一小段时间确认子进程没有立刻退出（排除旧进程误判）
      await sleep(300);
      if (this.isChildAlive(childPid)) {
        diagLog("health check passed, child alive");
        this.setState("running");
      } else {
        diagLog("WARN: health check passed 但子进程已退出（端口可能被旧 gateway 占用）");
        this.setState("stopped");
      }
    } else {
      diagLog("FATAL: health check timeout");
      await this.stop();
    }
  }

  // 停止 Gateway：async，返回时保证进程已终结
  async stop(): Promise<void> {
    if (!this.proc || this.state === "stopped" || this.state === "stopping") return;

    const pid = this.proc.pid ?? 0;
    this.setState("stopping");

    // 第一步：发送终止信号（Windows 杀整棵进程树，POSIX 先 SIGTERM）
    if (IS_WIN && pid > 0) {
      killProcess(pid);
    } else {
      this.proc.kill("SIGTERM");
    }

    // 第二步：等 exit 事件将状态推到 stopped（exit handler 负责状态转移）
    const deadline = Date.now() + 5000;
    while (this.getState() === "stopping" && Date.now() < deadline) {
      await sleep(100);
    }

    // 第三步：超时兜底 — POSIX 升级 SIGKILL，Windows 已经是 /F 了
    if (this.getState() === "stopping") {
      diagLog("WARN: 停止超时，强制终止");
      if (this.proc && !IS_WIN) {
        this.proc.kill("SIGKILL");
        await sleep(500);
      }
      this.proc = null;
      this.setState("stopped");
    }
  }

  // 停止已存在的旧 gateway（端口冲突时自动调用）
  private async stopExistingGateway(nodeBin: string, entry: string, cwd: string): Promise<void> {
    try {
      const { execFileSync } = require("child_process") as typeof import("child_process");
      diagLog("exec: gateway stop");
      execFileSync(nodeBin, [entry, "gateway", "stop"], {
        cwd,
        timeout: 10_000,
        stdio: "pipe",
        windowsHide: true,
        env: {
          ...process.env,
          ...resolveNodeExtraEnv(),
          OPENCLAW_NO_RESPAWN: "1",
          OPENCLAW_LENIENT_CONFIG: "1",
        },
      });
      diagLog("旧 gateway 已停止");
    } catch (err: any) {
      diagLog(`旧 gateway stop 失败: ${err.message ?? err}`);
    }

    // 等端口释放
    for (let i = 0; i < 10; i++) {
      await sleep(500);
      if (!(await this.probeHealth())) {
        diagLog("端口已释放");
        return;
      }
    }
    // 优雅停止超时，按 PID 强杀占用端口的进程
    diagLog("WARN: 等待端口释放超时，尝试强杀占用进程");
    const pid = await getPortPid(this.port);
    if (pid > 0) {
      killProcess(pid);
      for (let i = 0; i < 10; i++) {
        await sleep(500);
        if (!(await this.probeHealth())) {
          diagLog(`强杀 pid=${pid} 后端口已释放`);
          return;
        }
      }
    }
    diagLog("WARN: 强杀后端口仍被占用，继续尝试启动");
  }

  // 重启：stop() 返回时进程已死，直接 start()
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // HTTP 探测根路径（Control UI）
  private probeHealth(): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${this.port}/`, (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      });
      req.on("error", () => resolve(false));
      req.setTimeout(2000, () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  // 轮询等待健康
  private async waitForHealth(timeoutMs: number, childPid: number): Promise<boolean> {
    if (childPid <= 0) return false;

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.isChildAlive(childPid)) {
        diagLog(`health check aborted: child exited pid=${childPid}`);
        return false;
      }
      if (await this.probeHealth()) return true;
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    return false;
  }

  // 仅当同一子进程仍存活时才认为启动检查有效，避免旧端口进程误判
  private isChildAlive(childPid: number): boolean {
    return !!this.proc && this.proc.pid === childPid && this.proc.exitCode == null;
  }

  // 清理升级残留的 lockfile：旧 gateway 可能是"半死"状态（进程活但 HTTP 不响应）
  // 这种情况下 probeHealth 返回 false，stopExistingGateway 不会被调用，
  // 但新 gateway 会被 lockfile 阻塞并立即 exit(1)。
  private async cleanStaleLockfile(): Promise<void> {
    const lockPath = path.join(resolveUserStateDir(), "gateway.lock");
    let raw: string;
    try {
      raw = fs.readFileSync(lockPath, "utf-8").trim();
    } catch {
      return; // lockfile 不存在，无需清理
    }

    // lockfile 内容通常是 PID 数字
    const stalePid = Number.parseInt(raw, 10);
    if (!Number.isFinite(stalePid) || stalePid <= 0) {
      diagLog(`lockfile 内容非法 (${raw})，直接删除`);
      try { fs.unlinkSync(lockPath); } catch {}
      return;
    }

    // 检查持有 lockfile 的进程是否仍活着
    if (!isProcessAlive(stalePid)) {
      diagLog(`lockfile 指向 pid=${stalePid} 但进程已不存在，删除残留 lockfile`);
      try { fs.unlinkSync(lockPath); } catch {}
      return;
    }

    // 进程活着但不响应 HTTP（半死状态）→ 强杀后删 lockfile
    diagLog(`WARN: lockfile 指向 pid=${stalePid}，进程存活但 HTTP 无响应，强制终止`);
    killProcess(stalePid);
    // 等待进程退出
    for (let i = 0; i < 20; i++) {
      await sleep(250);
      if (!isProcessAlive(stalePid)) {
        diagLog(`pid=${stalePid} 已退出`);
        break;
      }
    }
    try { fs.unlinkSync(lockPath); } catch {}
  }

  private setState(s: GatewayState): void {
    const prev = this.state;
    this.state = s;
    if (s === "running") {
      this.startedAt = Date.now();
    } else if (s === "stopped") {
      this.startedAt = null;
    }
    diagLog(`state: ${prev} → ${s}`);
    this.onStateChange?.(s);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 脱敏显示 token，避免明文泄露到日志
function maskToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

// 检查外部 PID 是否存活（跨平台）
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 仅探测，不发送信号
    return true;
  } catch {
    return false;
  }
}

// 强制终止外部进程（Windows 用 taskkill，POSIX 用 SIGKILL）
function killProcess(pid: number): void {
  try {
    if (IS_WIN) {
      const { execFileSync } = require("child_process") as typeof import("child_process");
      execFileSync("taskkill", ["/PID", String(pid), "/F", "/T"], {
        timeout: 5000,
        stdio: "pipe",
        windowsHide: true,
      });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch (err: any) {
    diagLog(`killProcess(${pid}) 失败: ${err.message ?? err}`);
  }
}

// 生成 clawhub CLI wrapper 脚本（每次 gateway 启动时确保最新）
function ensureClawhubWrapper(nodeBin: string): void {
  const clawhubEntry = resolveClawhubEntry();
  if (!fs.existsSync(clawhubEntry)) {
    diagLog(`clawhub 入口不存在，跳过 wrapper 生成: ${clawhubEntry}`);
    return;
  }

  const binDir = resolveUserBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  // 默认 workdir 指向 ~/.openclaw/workspace
  const workdir = path.join(resolveUserStateDir(), "workspace");

  if (IS_WIN) {
    const wrapper = [
      "@echo off",
      "REM OneClaw clawhub CLI - auto-generated, do not edit",
      "setlocal",
      `set "APP_NODE=${nodeBin.replace(/"/g, '""')}"`,
      `set "APP_ENTRY=${clawhubEntry.replace(/"/g, '""')}"`,
      `set "APP_WORKDIR=${workdir.replace(/"/g, '""')}"`,
      'set "ELECTRON_RUN_AS_NODE=1"',
      '"%APP_NODE%" "%APP_ENTRY%" --workdir "%APP_WORKDIR%" %*',
      "exit /b %errorlevel%",
      "",
    ].join("\r\n");
    fs.writeFileSync(path.join(binDir, "clawhub.cmd"), wrapper, "utf-8");
  } else {
    const safeNode = nodeBin.replace(/(["\\$`])/g, "\\$1");
    const safeEntry = clawhubEntry.replace(/(["\\$`])/g, "\\$1");
    const safeWorkdir = workdir.replace(/(["\\$`])/g, "\\$1");
    const wrapper = [
      "#!/usr/bin/env bash",
      "# OneClaw clawhub CLI - auto-generated, do not edit",
      `APP_NODE="${safeNode}"`,
      `APP_ENTRY="${safeEntry}"`,
      `APP_WORKDIR="${safeWorkdir}"`,
      "export ELECTRON_RUN_AS_NODE=1",
      'exec "$APP_NODE" "$APP_ENTRY" --workdir "$APP_WORKDIR" "$@"',
      "",
    ].join("\n");
    const wrapperPath = path.join(binDir, "clawhub");
    fs.writeFileSync(wrapperPath, wrapper, "utf-8");
    fs.chmodSync(wrapperPath, 0o755);
  }

  diagLog(`clawhub wrapper 已生成: ${binDir}`);
}
