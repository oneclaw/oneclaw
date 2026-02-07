import { ChildProcess, spawn } from "child_process";
import * as crypto from "crypto";
import * as http from "http";
import * as path from "path";
import * as fs from "fs";
import {
  DEFAULT_PORT,
  HEALTH_TIMEOUT_MS,
  HEALTH_POLL_INTERVAL_MS,
  CRASH_COOLDOWN_MS,
  IS_WIN,
  resolveNodeBin,
  resolveNpmBin,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveResourcesPath,
} from "./constants";

export type GatewayState = "stopped" | "starting" | "running" | "stopping";

interface GatewayOptions {
  port?: number;
  onStateChange?: (state: GatewayState) => void;
}

export class GatewayProcess {
  private proc: ChildProcess | null = null;
  private state: GatewayState = "stopped";
  private port: number;
  private token: string;
  private lastCrashTime = 0;
  private onStateChange?: (state: GatewayState) => void;

  constructor(opts: GatewayOptions = {}) {
    this.port = opts.port ?? DEFAULT_PORT;
    this.token = crypto.randomBytes(16).toString("hex");
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

  // 启动 Gateway 子进程
  async start(): Promise<void> {
    if (this.state === "running" || this.state === "starting") return;

    // 崩溃冷却期
    const elapsed = Date.now() - this.lastCrashTime;
    if (this.lastCrashTime > 0 && elapsed < CRASH_COOLDOWN_MS) {
      await sleep(CRASH_COOLDOWN_MS - elapsed);
    }

    this.setState("starting");
    console.log(`[gateway] token=${this.token}  →  http://127.0.0.1:${this.port}/?token=${this.token}`);

    const nodeBin = resolveNodeBin();
    const entry = resolveGatewayEntry();
    const cwd = resolveGatewayCwd();

    // 检查关键文件
    if (!fs.existsSync(nodeBin)) {
      console.error(`[gateway] node 二进制不存在: ${nodeBin}`);
      this.setState("stopped");
      return;
    }
    if (!fs.existsSync(entry)) {
      console.error(`[gateway] gateway 入口不存在: ${entry}`);
      this.setState("stopped");
      return;
    }

    // 组装 PATH，内嵌 runtime 优先
    const runtimeDir = path.join(resolveResourcesPath(), "runtime");
    const envPath = runtimeDir + path.delimiter + (process.env.PATH ?? "");

    this.proc = spawn(
      nodeBin,
      [entry, "gateway", "run", "--port", String(this.port), "--bind", "loopback"],
      {
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
      }
    );

    // 转发日志
    this.proc.stdout?.on("data", (d: Buffer) => {
      process.stdout.write(`[gateway] ${d}`);
    });
    this.proc.stderr?.on("data", (d: Buffer) => {
      process.stderr.write(`[gateway] ${d}`);
    });

    // 退出处理
    this.proc.on("exit", (code, signal) => {
      console.log(`[gateway] 进程退出 code=${code} signal=${signal}`);
      if (this.state === "stopping") {
        this.setState("stopped");
      } else {
        // 非预期退出 = 崩溃
        this.lastCrashTime = Date.now();
        this.setState("stopped");
      }
      this.proc = null;
    });

    // 轮询健康检查
    const healthy = await this.waitForHealth(HEALTH_TIMEOUT_MS);
    if (healthy) {
      this.setState("running");
    } else {
      console.error("[gateway] 健康检查超时，停止进程");
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
  private async waitForHealth(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.probeHealth()) return true;
      await sleep(HEALTH_POLL_INTERVAL_MS);
    }
    return false;
  }

  private setState(s: GatewayState): void {
    this.state = s;
    this.onStateChange?.(s);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
