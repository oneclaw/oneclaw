import * as net from "net";
import * as fs from "fs";
import { execFile } from "child_process";
import { DEFAULT_PORT, resolveUserStateDir, IS_WIN } from "./constants";
import * as log from "./logger";

// ── 类型定义 ──

export interface DetectionResult {
  portInUse: boolean;
  portProcess: string;
  portPid: number;
  globalInstalled: boolean;
  globalPath: string;
}

// OneClaw 自有 CLI wrapper 的标记字符串，与 cli-integration.ts 保持一致
const CLI_MARKER = "OneClaw CLI";

// execFile 默认超时（防止子进程挂死）
const EXEC_TIMEOUT_MS = 5_000;

// ── 内部工具函数 ──

// 将 execFile 包装为 Promise，统一超时和 windowsHide 配置
function execFileAsync(
  cmd: string,
  args: string[],
  timeoutMs: number = EXEC_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
}

// 通过 net.createServer 探测端口是否被占用（跨平台，无需外部命令）
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

// ── macOS 端口进程检测 ──

// 通过 lsof 获取占用指定端口的进程 PID（仅 LISTEN 状态）
async function getPortPidMac(port: number): Promise<number> {
  try {
    const out = await execFileAsync("lsof", [
      "-i", `:${port}`,
      "-sTCP:LISTEN",
      "-t",
    ]);
    const pid = parseInt(out.split("\n")[0], 10);
    return Number.isFinite(pid) ? pid : 0;
  } catch {
    return 0;
  }
}

// 通过 ps 获取进程名称
async function getProcessNameMac(pid: number): Promise<string> {
  if (pid <= 0) return "";
  try {
    return await execFileAsync("ps", ["-p", String(pid), "-o", "comm="]);
  } catch {
    return "";
  }
}

// ── Windows 端口进程检测 ──

// 通过 netstat 解析占用指定端口的 LISTENING 进程 PID
async function getPortPidWin(port: number): Promise<number> {
  try {
    const out = await execFileAsync("netstat", ["-ano"]);
    const portStr = `:${port}`;
    for (const line of out.split("\n")) {
      // 格式：TCP  127.0.0.1:18789  0.0.0.0:0  LISTENING  12345
      if (!line.includes("LISTENING")) continue;
      const cols = line.trim().split(/\s+/);
      // cols[1] = 本地地址，cols[4] = PID
      if (cols.length >= 5 && cols[1].endsWith(portStr)) {
        const pid = parseInt(cols[cols.length - 1], 10);
        if (Number.isFinite(pid) && pid > 0) return pid;
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

// 通过 tasklist 获取 Windows 进程名称
async function getProcessNameWin(pid: number): Promise<string> {
  if (pid <= 0) return "";
  try {
    const out = await execFileAsync("tasklist", [
      "/fi", `PID eq ${pid}`,
      "/fo", "csv",
      "/nh",
    ]);
    // 输出格式：\"name.exe\",\"12345\",...
    const firstLine = out.split("\n")[0];
    const match = firstLine.match(/^"([^"]+)"/);
    return match ? match[1] : "";
  } catch {
    return "";
  }
}

// ── 端口进程检测统一入口 ──

// 获取占用端口的进程信息（PID + 进程名），自动分派平台实现
async function getPortProcessInfo(port: number): Promise<{ pid: number; name: string }> {
  if (IS_WIN) {
    const pid = await getPortPidWin(port);
    const name = await getProcessNameWin(pid);
    return { pid, name };
  }
  const pid = await getPortPidMac(port);
  const name = await getProcessNameMac(pid);
  return { pid, name };
}

// ── 全局 npm 安装检测 ──

// 需要检测的命令名列表（openclaw 官方包 + openclaw-cn 中国区分支）
const OPENCLAW_COMMANDS = ["openclaw", "openclaw-cn"];

// 检测单个命令的全局安装路径，排除 OneClaw 自有 CLI wrapper
async function detectSingleCommand(name: string): Promise<{ installed: boolean; path: string }> {
  const cmd = IS_WIN ? "where" : "which";
  try {
    const out = await execFileAsync(cmd, [name]);
    const resolvedPath = out.split("\n")[0].trim();
    if (!resolvedPath) return { installed: false, path: "" };

    // 排除 OneClaw 自有 CLI wrapper（内容含标记字符串）
    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      if (content.includes(CLI_MARKER)) {
        return { installed: false, path: "" };
      }
    } catch {
      // 二进制文件或无法读取，视为非 OneClaw wrapper
    }

    return { installed: true, path: resolvedPath };
  } catch {
    // which/where 找不到命令时返回非零退出码
    return { installed: false, path: "" };
  }
}

// 检测全局 openclaw / openclaw-cn 安装，任一命中即视为已安装
async function detectGlobalOpenclaw(): Promise<{ installed: boolean; path: string }> {
  const results = await Promise.all(OPENCLAW_COMMANDS.map(detectSingleCommand));
  for (const r of results) {
    if (r.installed) return r;
  }
  return { installed: false, path: "" };
}

// ── 导出函数 ──

// 执行完整环境检测：端口占用 + 进程信息 + 全局安装
export async function detectExistingInstallation(
  port: number = DEFAULT_PORT,
): Promise<DetectionResult> {
  log.info(`[install-detector] scanning port ${port} and global openclaw`);

  // 并行执行端口检测和全局安装检测
  const [portBusy, portInfo, global] = await Promise.all([
    isPortInUse(port),
    getPortProcessInfo(port),
    detectGlobalOpenclaw(),
  ]);

  const result: DetectionResult = {
    portInUse: portBusy,
    portProcess: portInfo.name,
    portPid: portInfo.pid,
    globalInstalled: global.installed,
    globalPath: global.path,
  };

  log.info(`[install-detector] result: ${JSON.stringify(result)}`);
  return result;
}

// 按 PID 强制终止进程（macOS: kill -9, Windows: taskkill /pid /f）
export async function killPortProcess(pid: number): Promise<boolean> {
  if (pid <= 0) return false;
  log.info(`[install-detector] killing PID ${pid}`);
  try {
    if (IS_WIN) {
      await execFileAsync("taskkill", ["/pid", String(pid), "/f"]);
    } else {
      await execFileAsync("kill", ["-9", String(pid)]);
    }
    return true;
  } catch (err) {
    log.error(`[install-detector] kill PID ${pid} failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// 需要卸载的 npm 包列表（openclaw 官方包 + openclaw-cn 中国区分支）
const OPENCLAW_PACKAGES = ["openclaw", "openclaw-cn"];

// 全局卸载所有 openclaw 相关 npm 包
export async function uninstallGlobalOpenclaw(): Promise<boolean> {
  log.info("[install-detector] uninstalling global openclaw packages");
  const npm = IS_WIN ? "npm.cmd" : "npm";
  let allOk = true;
  for (const pkg of OPENCLAW_PACKAGES) {
    try {
      await execFileAsync(npm, ["uninstall", "-g", pkg], 30_000);
    } catch (err) {
      // 未安装的包卸载报错是正常的，只记录日志
      log.info(`[install-detector] npm uninstall -g ${pkg}: ${err instanceof Error ? err.message : String(err)}`);
      allOk = false;
    }
  }
  return allOk;
}

// 递归删除用户状态目录（~/.openclaw/）
export function removeUserStateDir(): boolean {
  const dir = resolveUserStateDir();
  log.info(`[install-detector] removing user state dir: ${dir}`);
  try {
    if (!fs.existsSync(dir)) return true;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch (err) {
    log.error(`[install-detector] remove ${dir} failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

// 从指定端口开始，逐个探测直到找到可用端口
export async function findAvailablePort(startPort: number = DEFAULT_PORT): Promise<number> {
  // 限制搜索范围，避免无限循环
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (port > 65535) break;
    const inUse = await isPortInUse(port);
    if (!inUse) return port;
  }
  // 所有端口都被占用的极端情况，让系统分配
  return 0;
}
