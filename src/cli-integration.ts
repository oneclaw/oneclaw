import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execFile } from "child_process";
import { resolveNodeBin, resolveGatewayEntry, resolveUserStateDir, IS_WIN } from "./constants";
import * as log from "./logger";

// CLI 安装结果，供 Setup 流程统一显示与埋点。
interface CliResult {
  success: boolean;
  message: string;
}

// Wrapper 脚本中的标记字符串，用于识别由 OneClaw 生成的文件。
const CLI_MARKER = "OneClaw CLI";

// rc 注入块标记，安装可幂等覆盖，卸载可精确移除。
const RC_BLOCK_START = "# >>> oneclaw-cli >>>";
const RC_BLOCK_END = "# <<< oneclaw-cli <<<";

// 将错误统一格式化成可展示文本，避免在 catch 中到处写类型判断。
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// 解析 POSIX 平台的 CLI 安装目录，与应用状态目录保持一致。
function getPosixBinDir(): string {
  return path.join(resolveUserStateDir(), "bin");
}

// 解析 POSIX 平台 wrapper 路径。
function getPosixWrapperPath(): string {
  return path.join(getPosixBinDir(), "openclaw");
}

// 解析 Windows 用户 LocalAppData 根目录，不依赖单一环境变量。
function getWinLocalAppDataDir(): string {
  if (process.env.LOCALAPPDATA && process.env.LOCALAPPDATA.trim()) {
    return process.env.LOCALAPPDATA;
  }
  return path.join(os.homedir(), "AppData", "Local");
}

// 解析 Windows 平台的 CLI 安装目录。
function getWinBinDir(): string {
  return path.join(getWinLocalAppDataDir(), "OneClaw", "bin");
}

// 解析 Windows 平台 wrapper 路径。
function getWinWrapperPath(): string {
  return path.join(getWinBinDir(), "openclaw.cmd");
}

// POSIX shell 双引号转义，保证路径中包含空格、$、`、" 时仍安全。
function escapeForPosixDoubleQuoted(value: string): string {
  return value.replace(/(["\\$`])/g, "\\$1");
}

// cmd 的 set "KEY=VALUE" 语法只需处理双引号转义。
function escapeForCmdSetValue(value: string): string {
  return value.replace(/"/g, '""');
}

// PowerShell 单引号字符串转义。
function escapeForPowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

// 构建 Windows PATH 修改脚本，避免分号拼接打断 try/catch 语法。
export function buildWinPathEnvScript(action: "add" | "remove", binDir: string): string {
  const safeDir = escapeForPowerShellSingleQuoted(binDir);
  return [
    `$target='${safeDir}'`,
    "function Normalize([string]$p) {",
    "  if ([string]::IsNullOrWhiteSpace($p)) { return '' }",
    "  try { return ([System.IO.Path]::GetFullPath($p)).TrimEnd('\\\\').ToLowerInvariant() } catch { return $p.Trim().TrimEnd('\\\\').ToLowerInvariant() }",
    "}",
    "$current=[Environment]::GetEnvironmentVariable('Path','User')",
    "$parts=@()",
    "if ($current) {",
    "  $parts=$current -split ';' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }",
    "}",
    "$targetNorm=Normalize $target",
    "$unique=@()",
    "$seen=@{}",
    "foreach ($p in $parts) {",
    "  $n=Normalize $p",
    "  if (-not $seen.ContainsKey($n)) {",
    "    $seen[$n]=$true",
    "    $unique += $p",
    "  }",
    "}",
    `if ('${action}' -eq 'add') {`,
    "  if (-not $seen.ContainsKey($targetNorm)) {",
    "    $unique += $target",
    "  }",
    "} else {",
    "  $unique = $unique | Where-Object { (Normalize $_) -ne $targetNorm }",
    "}",
    "[Environment]::SetEnvironmentVariable('Path', ($unique -join ';'), 'User')",
  ].join("\n");
}

// 生成 POSIX wrapper 脚本（可测试纯函数），直接转发到内置 Node + gateway entry。
export function buildPosixWrapperForPaths(nodeBin: string, entry: string): string {
  const safeNodeBin = escapeForPosixDoubleQuoted(nodeBin);
  const safeEntry = escapeForPosixDoubleQuoted(entry);

  return [
    "#!/usr/bin/env bash",
    `# ${CLI_MARKER} - auto-generated, do not edit`,
    `APP_NODE="${safeNodeBin}"`,
    `APP_ENTRY="${safeEntry}"`,
    'if [ ! -f "$APP_NODE" ]; then',
    '  echo "Error: OneClaw not found at $APP_NODE" >&2',
    "  exit 127",
    "fi",
    'if [ ! -f "$APP_ENTRY" ]; then',
    '  echo "Error: OneClaw entry not found at $APP_ENTRY" >&2',
    "  exit 127",
    "fi",
    "export OPENCLAW_NO_RESPAWN=1",
    'exec "$APP_NODE" "$APP_ENTRY" "$@"',
    "",
  ].join("\n");
}

// 读取当前运行时路径并生成 POSIX wrapper，避免调用方重复拼路径。
function buildPosixWrapper(): string {
  return buildPosixWrapperForPaths(resolveNodeBin(), resolveGatewayEntry());
}

// 生成 Windows wrapper 脚本（可测试纯函数），直接转发到内置 Node + gateway entry。
export function buildWinWrapperForPaths(nodeBin: string, entry: string): string {
  const safeNodeBin = escapeForCmdSetValue(nodeBin);
  const safeEntry = escapeForCmdSetValue(entry);

  return [
    "@echo off",
    `REM ${CLI_MARKER} - auto-generated, do not edit`,
    "setlocal",
    `set "APP_NODE=${safeNodeBin}"`,
    `set "APP_ENTRY=${safeEntry}"`,
    'if not exist "%APP_NODE%" (',
    "  echo Error: OneClaw Node runtime not found. 1>&2",
    "  exit /b 127",
    ")",
    'if not exist "%APP_ENTRY%" (',
    "  echo Error: OneClaw entry not found. 1>&2",
    "  exit /b 127",
    ")",
    'set "OPENCLAW_NO_RESPAWN=1"',
    '"%APP_NODE%" "%APP_ENTRY%" %*',
    "exit /b %errorlevel%",
    "",
  ].join("\r\n");
}

// 读取当前运行时路径并生成 Windows wrapper，避免调用方重复拼路径。
function buildWinWrapper(): string {
  return buildWinWrapperForPaths(resolveNodeBin(), resolveGatewayEntry());
}

// 返回用户 home 目录，优先 HOME，回退 os.homedir()，失败时返回 null。
function resolveHomeDir(): string | null {
  if (process.env.HOME && process.env.HOME.trim()) {
    return process.env.HOME;
  }
  const home = os.homedir();
  return home && home.trim() ? home : null;
}

// 返回需要注入 PATH 的 shell profile 文件列表（login shell 层级）。
function resolvePosixRcPaths(): string[] {
  const home = resolveHomeDir();
  if (!home) return [];
  return [path.join(home, ".zprofile"), path.join(home, ".bash_profile")];
}

// 构建 OneClaw 管理的 rc 注入块，使用绝对路径避免与状态目录配置脱节。
function buildRcBlock(binDir: string): string {
  const safeBinDir = escapeForPosixDoubleQuoted(binDir);
  return [
    RC_BLOCK_START,
    'case ":$PATH:" in',
    `  *:"${safeBinDir}":*) ;;`,
    `  *) export PATH="${safeBinDir}:$PATH" ;;`,
    "esac",
    RC_BLOCK_END,
  ].join("\n");
}

// 从 rc 文本移除 OneClaw 管理块，仅删除带完整标记的块，避免误伤用户自定义行。
function stripManagedRcBlock(content: string): { text: string; removed: boolean } {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  const pendingBlock: string[] = [];
  let removed = false;
  let inBlock = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!inBlock && line === RC_BLOCK_START) {
      inBlock = true;
      pendingBlock.push(rawLine);
      continue;
    }
    if (inBlock) {
      pendingBlock.push(rawLine);
      if (line === RC_BLOCK_END) {
        inBlock = false;
        removed = true;
        pendingBlock.length = 0;
      }
      continue;
    }
    output.push(rawLine);
  }

  // 仅删除完整块；如果块损坏（缺少结束标记），保留原文避免截断用户配置。
  if (inBlock && pendingBlock.length > 0) {
    output.push(...pendingBlock);
  }

  return { text: output.join("\n"), removed };
}

// 统一 rc 文件换行风格，避免无意义 diff。
function detectEol(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

// 向 rc 文件幂等写入 OneClaw 管理块，重复安装不会产生重复内容。
function upsertRcBlock(rcPath: string, binDir: string): void {
  const current = fs.existsSync(rcPath) ? fs.readFileSync(rcPath, "utf-8") : "";
  const eol = detectEol(current);

  const { text: stripped } = stripManagedRcBlock(current);
  const block = buildRcBlock(binDir);
  const base = stripped.trimEnd();
  const nextUnix = base ? `${base}\n\n${block}\n` : `${block}\n`;
  const next = eol === "\r\n" ? nextUnix.replace(/\n/g, "\r\n") : nextUnix;

  if (next !== current) {
    fs.writeFileSync(rcPath, next, "utf-8");
    log.info(`[cli] PATH block written to ${rcPath}`);
  }
}

// 从 rc 文件移除 OneClaw 管理块，仅处理本程序写入的标记块。
function removeRcBlock(rcPath: string): void {
  if (!fs.existsSync(rcPath)) return;

  const current = fs.readFileSync(rcPath, "utf-8");
  const eol = detectEol(current);
  const { text: stripped, removed } = stripManagedRcBlock(current);
  if (!removed) return;

  const base = stripped.trimEnd();
  const nextUnix = base ? `${base}\n` : "";
  const next = eol === "\r\n" ? nextUnix.replace(/\n/g, "\r\n") : nextUnix;
  fs.writeFileSync(rcPath, next, "utf-8");
  log.info(`[cli] PATH block removed from ${rcPath}`);
}

// 用 PowerShell 精确修改用户级 PATH，按路径项去重，避免子串误判。
function winModifyPath(action: "add" | "remove", binDir: string): Promise<void> {
  const script = buildWinPathEnvScript(action, binDir);

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      { timeout: 15_000 },
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
}

// 安装 CLI：生成 wrapper 并注入 PATH，失败仅返回结果，不抛出到 Setup 主流程。
export async function installCli(): Promise<CliResult> {
  try {
    // 前置校验：node 和 entry 必须存在，否则生成的 wrapper 必然报错。
    const nodeBin = resolveNodeBin();
    const entry = resolveGatewayEntry();
    if (nodeBin === "node" || !fs.existsSync(nodeBin)) {
      return { success: false, message: `Node runtime not found: ${nodeBin}` };
    }
    if (!fs.existsSync(entry)) {
      return { success: false, message: `CLI entry not found: ${entry}` };
    }

    if (IS_WIN) {
      const binDir = getWinBinDir();
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(getWinWrapperPath(), buildWinWrapper(), "utf-8");
      await winModifyPath("add", binDir);
      log.info("[cli] Windows CLI installed");
      return { success: true, message: "CLI installed. Please reopen your terminal." };
    }

    const binDir = getPosixBinDir();
    fs.mkdirSync(binDir, { recursive: true });
    const wrapperPath = getPosixWrapperPath();
    fs.writeFileSync(wrapperPath, buildPosixWrapper(), "utf-8");
    fs.chmodSync(wrapperPath, 0o755);

    const rcPaths = resolvePosixRcPaths();
    if (rcPaths.length === 0) {
      return { success: false, message: "Failed to resolve home directory for PATH injection." };
    }

    const errors: string[] = [];
    let injected = 0;
    for (const rcPath of rcPaths) {
      try {
        upsertRcBlock(rcPath, binDir);
        injected += 1;
      } catch (err) {
        const msg = errorMessage(err);
        errors.push(`${path.basename(rcPath)}: ${msg}`);
        log.error(`[cli] Failed to update ${rcPath}: ${msg}`);
      }
    }

    if (injected === 0) {
      return {
        success: false,
        message: `CLI wrapper created, but PATH injection failed (${errors.join("; ")})`,
      };
    }

    log.info("[cli] POSIX CLI installed");
    if (errors.length > 0) {
      return {
        success: true,
        message: `CLI installed with partial PATH update (${errors.join("; ")}).`,
      };
    }
    return { success: true, message: "CLI installed." };
  } catch (err) {
    const msg = errorMessage(err);
    log.error(`[cli] install failed: ${msg}`);
    return { success: false, message: msg };
  }
}

// 卸载 CLI：删除 wrapper 和 PATH 注入块，过程尽量容错。
export async function uninstallCli(): Promise<CliResult> {
  try {
    if (IS_WIN) {
      const wrapperPath = getWinWrapperPath();
      if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);
      await winModifyPath("remove", getWinBinDir());
      log.info("[cli] Windows CLI uninstalled");
      return { success: true, message: "CLI uninstalled." };
    }

    const wrapperPath = getPosixWrapperPath();
    if (fs.existsSync(wrapperPath)) fs.unlinkSync(wrapperPath);

    const rcPaths = resolvePosixRcPaths();
    for (const rcPath of rcPaths) {
      try {
        removeRcBlock(rcPath);
      } catch (err) {
        log.error(`[cli] Failed to clean ${rcPath}: ${errorMessage(err)}`);
      }
    }

    log.info("[cli] POSIX CLI uninstalled");
    return { success: true, message: "CLI uninstalled." };
  } catch (err) {
    const msg = errorMessage(err);
    log.error(`[cli] uninstall failed: ${msg}`);
    return { success: false, message: msg };
  }
}

// 判断 CLI 是否安装：只识别由 OneClaw 生成且带标记的 wrapper。
export function isCliInstalled(): boolean {
  const wrapperPath = IS_WIN ? getWinWrapperPath() : getPosixWrapperPath();
  if (!fs.existsSync(wrapperPath)) return false;

  try {
    const content = fs.readFileSync(wrapperPath, "utf-8");
    return content.includes(CLI_MARKER);
  } catch {
    return false;
  }
}
