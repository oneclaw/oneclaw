import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { resolveNodeBin, resolveGatewayEntry, resolveUserStateDir, IS_WIN } from "./constants";
import * as log from "./logger";

// CLI 安装结果
interface CliResult {
  success: boolean;
  message: string;
}

// wrapper 脚本中的标记字符串，用于识别由 OneClaw 生成的文件
const CLI_MARKER = "OneClaw CLI";

// rc 文件中的 PATH 注入标记
const RC_MARKER = "/.openclaw/bin";
const RC_COMMENT = "# OneClaw CLI";
const RC_EXPORT = 'export PATH="$HOME/.openclaw/bin:$PATH"';

// ── macOS: wrapper 脚本和 bin 目录 ──

function getMacBinDir(): string {
  return path.join(resolveUserStateDir(), "bin");
}

function getMacWrapperPath(): string {
  return path.join(getMacBinDir(), "openclaw");
}

// ── Windows: wrapper 脚本和 bin 目录 ──

function getWinBinDir(): string {
  return path.join(process.env.LOCALAPPDATA || "", "OneClaw", "bin");
}

function getWinWrapperPath(): string {
  return path.join(getWinBinDir(), "openclaw.cmd");
}

// ── 生成 macOS wrapper 脚本 ──
function buildMacWrapper(): string {
  const nodeBin = resolveNodeBin();
  const entry = resolveGatewayEntry();
  return [
    "#!/bin/bash",
    `# ${CLI_MARKER} — auto-generated, do not edit`,
    `APP_NODE="${nodeBin}"`,
    `APP_ENTRY="${entry}"`,
    'if [ ! -f "$APP_NODE" ]; then',
    '  echo "Error: OneClaw not found at $APP_NODE" >&2',
    "  exit 127",
    "fi",
    'exec "$APP_NODE" "$APP_ENTRY" "$@"',
    "",
  ].join("\n");
}

// ── 生成 Windows wrapper 脚本 ──
function buildWinWrapper(): string {
  const nodeBin = resolveNodeBin();
  const entry = resolveGatewayEntry();
  return [
    "@echo off",
    `REM ${CLI_MARKER} — auto-generated, do not edit`,
    "setlocal",
    `set "APP_NODE=${nodeBin}"`,
    `set "APP_ENTRY=${entry}"`,
    'if not exist "%APP_NODE%" (',
    "  echo Error: OneClaw not found. 1>&2",
    "  exit /b 127",
    ")",
    '"%APP_NODE%" "%APP_ENTRY%" %*',
    "",
  ].join("\r\n");
}

// ── macOS: 向 shell rc 文件追加 PATH ──
function injectPathToRcFile(rcPath: string): void {
  let content = "";
  try {
    content = fs.readFileSync(rcPath, "utf-8");
  } catch {
    // 文件不存在，后续 appendFileSync 会自动创建
  }

  // 已注入则跳过
  if (content.includes(RC_MARKER)) return;

  const block = `\n${RC_COMMENT}\n${RC_EXPORT}\n`;
  fs.appendFileSync(rcPath, block, "utf-8");
  log.info(`[cli] PATH injected into ${rcPath}`);
}

// ── macOS: 从 shell rc 文件移除 PATH ──
function removePathFromRcFile(rcPath: string): void {
  if (!fs.existsSync(rcPath)) return;

  const content = fs.readFileSync(rcPath, "utf-8");
  if (!content.includes(RC_MARKER)) return;

  // 移除 comment + export 两行
  const cleaned = content
    .split("\n")
    .filter((line) => line !== RC_COMMENT && line !== RC_EXPORT)
    .join("\n");

  fs.writeFileSync(rcPath, cleaned, "utf-8");
  log.info(`[cli] PATH removed from ${rcPath}`);
}

// ── Windows: PowerShell 修改用户级 PATH ──
function winModifyPath(action: "add" | "remove", binDir: string): Promise<void> {
  const script =
    action === "add"
      ? `$d="${binDir}";$c=[Environment]::GetEnvironmentVariable('Path','User');if($c -notlike "*$d*"){[Environment]::SetEnvironmentVariable('Path',"$c;$d",'User')}`
      : `$d="${binDir}";$c=[Environment]::GetEnvironmentVariable('Path','User');$n=($c -split ';'|?{$_ -ne $d}) -join ';';[Environment]::SetEnvironmentVariable('Path',$n,'User')`;

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 10_000 },
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

// ── 安装 CLI ──
export async function installCli(): Promise<CliResult> {
  try {
    if (IS_WIN) {
      const binDir = getWinBinDir();
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(getWinWrapperPath(), buildWinWrapper(), "utf-8");
      await winModifyPath("add", binDir);
      log.info("[cli] Windows CLI installed");
      return { success: true, message: "CLI installed. Please reopen your terminal." };
    }

    // macOS / Linux
    const binDir = getMacBinDir();
    fs.mkdirSync(binDir, { recursive: true });
    const wrapperPath = getMacWrapperPath();
    fs.writeFileSync(wrapperPath, buildMacWrapper(), { mode: 0o755, encoding: "utf-8" });

    // 向 ~/.zshrc 和 ~/.bashrc 注入 PATH
    const home = process.env.HOME || "";
    injectPathToRcFile(path.join(home, ".zshrc"));
    injectPathToRcFile(path.join(home, ".bashrc"));

    log.info("[cli] macOS CLI installed");
    return { success: true, message: "CLI installed." };
  } catch (err: any) {
    log.error(`[cli] install failed: ${err.message}`);
    return { success: false, message: err.message || String(err) };
  }
}

// ── 卸载 CLI ──
export async function uninstallCli(): Promise<CliResult> {
  try {
    if (IS_WIN) {
      const wrapperPath = getWinWrapperPath();
      if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);
      await winModifyPath("remove", getWinBinDir());
      log.info("[cli] Windows CLI uninstalled");
      return { success: true, message: "CLI uninstalled." };
    }

    // macOS / Linux
    const wrapperPath = getMacWrapperPath();
    if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);

    const home = process.env.HOME || "";
    removePathFromRcFile(path.join(home, ".zshrc"));
    removePathFromRcFile(path.join(home, ".bashrc"));

    log.info("[cli] macOS CLI uninstalled");
    return { success: true, message: "CLI uninstalled." };
  } catch (err: any) {
    log.error(`[cli] uninstall failed: ${err.message}`);
    return { success: false, message: err.message || String(err) };
  }
}

// ── 检测 CLI 是否已安装 ──
export function isCliInstalled(): boolean {
  const wrapperPath = IS_WIN ? getWinWrapperPath() : getMacWrapperPath();
  if (!fs.existsSync(wrapperPath)) return false;

  try {
    const content = fs.readFileSync(wrapperPath, "utf-8");
    return content.includes(CLI_MARKER);
  } catch {
    return false;
  }
}
