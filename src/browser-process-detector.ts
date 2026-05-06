import { execFile } from "child_process";
import { promisify } from "util";
import type { BrowserTarget } from "./browser-detector";

export type ProcessExecutor = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; code: number }>;

export interface ProcessDetectorDeps {
  exec?: ProcessExecutor;
  platform?: NodeJS.Platform | string;
}

const execFileAsync = promisify(execFile);

export const DEFAULT_PROCESS_EXEC: ProcessExecutor = async (cmd, args) => {
  try {
    const { stdout } = await execFileAsync(cmd, args);
    return { stdout: String(stdout ?? ""), code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ? String(err.stdout) : "",
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
};

/**
 * 浏览器运行状态三态：
 * - "not-running":      没有任何进程
 * - "foreground":       至少一个进程有可见主窗口（用户感知"打开着"）
 * - "background-only":  进程存在但全部无可见主窗口（典型场景：Win Edge 关窗后的后台扩展残留）
 *
 * macOS 不区分 background-only——退出 app 即真退；只返 not-running / foreground。
 */
export type BrowserRunningState =
  | "not-running"
  | "foreground"
  | "background-only";

function stripExe(name: string): string {
  return name.replace(/\.exe$/i, "");
}

/**
 * Win：用 PowerShell `Get-Process` + `MainWindowHandle` 判定可见主窗口。
 *
 * 为什么不用 `tasklist /v`：tasklist 的窗口标题字段是**本地化**的——
 * 中文 Windows 显示 "暂缺"、日文 "なし"、英文 "N/A"。任何字符串过滤都会因
 * 用户系统语言而失效。`MainWindowHandle` 是 Win32 API 直接返回的 HWND，
 * 0 = 无可见主窗口，与系统 locale 无关。
 *
 * 输出协议：脚本 stdout 严格只输出三个字符串之一，便于直接 string compare。
 */
async function getWinRunningState(
  target: BrowserTarget,
  exec: ProcessExecutor,
): Promise<BrowserRunningState> {
  const procName = stripExe(target.processNameWin);
  const ps =
    `$p = Get-Process -Name '${procName}' -EA SilentlyContinue; ` +
    `if (-not $p) { 'not-running' } ` +
    `elseif (@($p | ? { $_.MainWindowHandle -ne 0 }).Count) { 'foreground' } ` +
    `else { 'background-only' }`;
  const r = await exec("powershell", ["-NoProfile", "-Command", ps]);
  if (r.code !== 0) return "not-running";
  const out = r.stdout.trim();
  if (out === "foreground" || out === "background-only" || out === "not-running") {
    return out;
  }
  return "not-running";
}

export async function getBrowserRunningState(
  target: BrowserTarget,
  deps: ProcessDetectorDeps = {},
): Promise<BrowserRunningState> {
  const exec = deps.exec ?? DEFAULT_PROCESS_EXEC;
  const platform = deps.platform ?? process.platform;
  try {
    if (platform === "win32") {
      return await getWinRunningState(target, exec);
    }
    const r = await exec("pgrep", ["-f", target.processNameMac]);
    if (r.code === 0 && r.stdout.trim().length > 0) return "foreground";
    return "not-running";
  } catch {
    return "not-running";
  }
}

/**
 * 简单"任一进程存在"检测——保留独立 tasklist/pgrep 实现：
 * - 比 PowerShell 启动稍快，被 getExtensionStates 频繁调用
 * - 语义不需要前台/后台区分（"进程在跑 → 内存 Preferences 会覆盖磁盘改动"）
 * - tasklist 的 IMAGENAME 过滤是 locale-independent（不依赖窗口标题）
 */
export async function isBrowserProcessRunning(
  target: BrowserTarget,
  deps: ProcessDetectorDeps = {},
): Promise<boolean> {
  const exec = deps.exec ?? DEFAULT_PROCESS_EXEC;
  const platform = deps.platform ?? process.platform;
  try {
    if (platform === "win32") {
      const r = await exec("tasklist", [
        "/FI",
        `IMAGENAME eq ${target.processNameWin}`,
        "/FO",
        "CSV",
        "/NH",
      ]);
      return (
        r.code === 0 &&
        r.stdout.toLowerCase().includes(target.processNameWin.toLowerCase())
      );
    }
    const r = await exec("pgrep", ["-f", target.processNameMac]);
    return r.code === 0 && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Win taskkill /F /T /IM <name>：强杀指定 image 的所有进程及子进程树。
 * 用途：用户已关 Edge 窗口但后台扩展进程残留时，主动清理以让 External Extensions JSON
 * 在下次冷启动被读取。Mac 上 no-op（macOS 没"background apps 保活"机制）。
 */
export async function killBackgroundProcesses(
  target: BrowserTarget,
  deps: ProcessDetectorDeps = {},
): Promise<{ killed: boolean; error?: string }> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "win32") return { killed: false };
  const exec = deps.exec ?? DEFAULT_PROCESS_EXEC;
  try {
    const r = await exec("taskkill", ["/F", "/T", "/IM", target.processNameWin]);
    if (r.code === 0) return { killed: true };
    return { killed: false, error: r.stdout || `taskkill exit code ${r.code}` };
  } catch (err: any) {
    return { killed: false, error: err?.message ?? String(err) };
  }
}
