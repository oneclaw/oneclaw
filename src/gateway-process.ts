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
  resolveGatewayLogPath,
  resolveNodeBin,
  resolveNpmBin,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveResourcesPath,
} from "./constants";

// 诊断日志（固定写入 ~/.openclaw/gateway.log，便于用户定位）
const LOG_PATH = resolveGatewayLogPath();

function diagLog(msg: string): void {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stderr.write(line);
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
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
  private lastCrashTime = 0;
  private onStateChange?: (state: GatewayState) => void;

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

  getToken(): string {
    return this.token;
  }

  // 更新 Gateway 鉴权 token（在 start 前调用）
  setToken(token: string): void {
    const trimmed = token.trim();
    if (!trimmed) return;
    this.token = trimmed;
  }

  // 启动 Gateway 子进程
  async start(): Promise<void> {
    if (this.state === "running" || this.state === "starting") return;

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

    // 启动前探测端口，若有旧 gateway 则自动停止
    const portBusy = await this.probeHealth();
    if (portBusy) {
      diagLog(`WARN: 端口 ${this.port} 已有服务响应，尝试自动停止旧 gateway`);
      await this.stopExistingGateway(nodeBin, entry, cwd);
    }

    // 组装 PATH，内嵌 runtime 优先
    const runtimeDir = path.join(resolveResourcesPath(), "runtime");
    const envPath = runtimeDir + path.delimiter + (process.env.PATH ?? "");

    const args = [entry, "gateway", "run", "--port", String(this.port), "--bind", "loopback"];
    diagLog(`spawn: ${nodeBin} ${args.join(" ")}`);

    this.proc = spawn(nodeBin, args, {
      cwd,
      env: {
        ...process.env,
        NODE_ENV: "production",
        OPENCLAW_LENIENT_CONFIG: "1",
        OPENCLAW_GATEWAY_TOKEN: this.token,
        OPENCLAW_NPM_BIN: resolveNpmBin(),
        PATH: envPath,
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
      process.stdout.write(`[gateway] ${s}`);
      diagLog(`stdout: ${s.trimEnd()}`);
    });
    this.proc.stderr?.on("data", (d: Buffer) => {
      const s = d.toString();
      process.stderr.write(`[gateway] ${s}`);
      diagLog(`stderr: ${s.trimEnd()}`);
    });

    // 退出处理
    this.proc.on("exit", (code, signal) => {
      diagLog(`child exit: code=${code} signal=${signal} prevState=${this.state}`);
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
      this.stop();
    }
  }

  // 停止 Gateway
  stop(): void {
    if (!this.proc || this.state === "stopped" || this.state === "stopping") return;

    this.setState("stopping");
    this.proc.kill("SIGTERM");

    // 5s 强制终止兜底
    const p = this.proc;
    setTimeout(() => {
      if (p && !p.killed) {
        p.kill("SIGKILL");
        this.setState("stopped");
      }
    }, 5000);
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
        env: { ...process.env, OPENCLAW_LENIENT_CONFIG: "1" },
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
    diagLog("WARN: 等待端口释放超时，继续尝试启动");
  }

  // 重启
  async restart(): Promise<void> {
    this.stop();
    await sleep(1000);
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

  private setState(s: GatewayState): void {
    const prev = this.state;
    this.state = s;
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
