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

// CLI 状态：区分“用户想要开启”与“当前是否真正可用”。
export interface CliStatus {
  enabled: boolean;
  installed: boolean;
  command: string;
}

type CliPreferenceState = {
  version: 1;
  enabled: boolean;
};

type WinCliBinDirs = {
  currentBinDir: string;
  legacyBinDirs: string[];
};

// Wrapper 脚本中的标记字符串，用于识别由 OneClaw 生成的文件。
const CLI_MARKER = "OneClaw CLI";
const CLI_PREFERENCE_FILE = "cli-preferences.json";

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

// 解析 Windows 当前路径与旧版迁移路径，避免老用户 PATH 残留。
export function resolveWinCliBinDirsForPaths(localAppDataDir: string, userStateDir: string): WinCliBinDirs {
  return {
    currentBinDir: path.win32.join(localAppDataDir, "OneClaw", "bin"),
    legacyBinDirs: [path.win32.join(userStateDir, "bin")],
  };
}

// 读取当前平台上的 Windows CLI 目录配置。
function resolveWinCliBinDirs(): WinCliBinDirs {
  return resolveWinCliBinDirsForPaths(getWinLocalAppDataDir(), resolveUserStateDir());
}

// 解析 Windows 平台的 CLI 安装目录。
function getWinBinDir(): string {
  return resolveWinCliBinDirs().currentBinDir;
}

// 解析 Windows 旧版 CLI 目录列表。
function getLegacyWinBinDirs(): string[] {
  return resolveWinCliBinDirs().legacyBinDirs;
}

// 解析 Windows 平台 wrapper 路径。
function getWinWrapperPathForBinDir(binDir: string): string {
  return path.join(binDir, "openclaw.cmd");
}

// 解析当前 Windows wrapper 路径。
function getWinWrapperPath(): string {
  return getWinWrapperPathForBinDir(getWinBinDir());
}

// 解析旧版 Windows wrapper 路径。
function getLegacyWinWrapperPaths(): string[] {
  return getLegacyWinBinDirs().map(getWinWrapperPathForBinDir);
}

// 返回 CLI 偏好文件路径，与 gateway 配置解耦，避免污染上游 schema。
function resolveCliPreferencePath(): string {
  return path.join(resolveUserStateDir(), CLI_PREFERENCE_FILE);
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

// 读取 OneClaw 维护的 CLI 偏好，仅接受最小合法结构。
function readCliPreferenceState(): CliPreferenceState | null {
  const preferencePath = resolveCliPreferencePath();
  if (!fs.existsSync(preferencePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(preferencePath, "utf-8"));
    if (raw && typeof raw === "object" && raw.version === 1 && typeof raw.enabled === "boolean") {
      return { version: 1, enabled: raw.enabled };
    }
  } catch {
    // 非法文件不阻塞启动，后续按无偏好处理。
  }
  return null;
}

// 持久化 CLI 偏好，供设置页和开机迁移复用。
export function setCliEnabledPreference(enabled: boolean): void {
  const preferencePath = resolveCliPreferencePath();
  fs.mkdirSync(path.dirname(preferencePath), { recursive: true });
  fs.writeFileSync(
    preferencePath,
    JSON.stringify({ version: 1, enabled }, null, 2),
    "utf-8",
  );
}

// 读取用户显式选择的 CLI 偏好；旧用户没有 sidecar 时返回 undefined。
export function getCliEnabledPreference(): boolean | undefined {
  return readCliPreferenceState()?.enabled;
}

// 兼容老用户：没有偏好文件时，根据现有 wrapper 足迹推断是否曾开启 CLI。
export function inferCliEnabledPreference(
  savedEnabled: boolean | undefined,
  hasCurrentWrapper: boolean,
  hasLegacyWrapper: boolean,
): boolean | undefined {
  if (typeof savedEnabled === "boolean") return savedEnabled;
  if (hasCurrentWrapper || hasLegacyWrapper) return true;
  return undefined;
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
    "export ELECTRON_RUN_AS_NODE=1",
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
    'set "ELECTRON_RUN_AS_NODE=1"',
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

// 判断指定 wrapper 是否由 OneClaw 管理，避免误删用户自定义脚本。
function hasManagedWrapper(wrapperPath: string): boolean {
  if (!fs.existsSync(wrapperPath)) return false;
  try {
    return fs.readFileSync(wrapperPath, "utf-8").includes(CLI_MARKER);
  } catch {
    return false;
  }
}

// 最小化删除策略：只移除带标记的 wrapper。
function removeManagedWrapper(wrapperPath: string): void {
  if (!hasManagedWrapper(wrapperPath)) return;
  fs.unlinkSync(wrapperPath);
}

// 采集 CLI 足迹，用于状态展示和老用户迁移推断。
function readCliInstallFootprint(): { currentInstalled: boolean; legacyInstalled: boolean } {
  if (IS_WIN) {
    return {
      currentInstalled: hasManagedWrapper(getWinWrapperPath()),
      legacyInstalled: getLegacyWinWrapperPaths().some(hasManagedWrapper),
    };
  }
  return {
    currentInstalled: hasManagedWrapper(getPosixWrapperPath()),
    legacyInstalled: false,
  };
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
      { timeout: 15_000, windowsHide: true },
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

// 校验 CLI 运行时依赖，避免生成必然损坏的 wrapper。
function validateCliRuntime(): CliResult | null {
  const nodeBin = resolveNodeBin();
  const entry = resolveGatewayEntry();
  if (nodeBin === "node" || !fs.existsSync(nodeBin)) {
    return { success: false, message: `Node runtime not found: ${nodeBin}` };
  }
  if (!fs.existsSync(entry)) {
    return { success: false, message: `CLI entry not found: ${entry}` };
  }
  return null;
}

// Windows CLI 安装：写入新 wrapper，并迁移掉旧版 PATH 与旧目录中的 wrapper。
async function installCliWindows(): Promise<CliResult> {
  const invalidRuntime = validateCliRuntime();
  if (invalidRuntime) return invalidRuntime;

  const binDir = getWinBinDir();
  const errors: string[] = [];
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(getWinWrapperPath(), buildWinWrapper(), "utf-8");

  await winModifyPath("add", binDir);

  for (const legacyWrapperPath of getLegacyWinWrapperPaths()) {
    try {
      removeManagedWrapper(legacyWrapperPath);
    } catch (err) {
      errors.push(`${path.basename(path.dirname(legacyWrapperPath))}: ${errorMessage(err)}`);
    }
  }

  for (const legacyBinDir of getLegacyWinBinDirs()) {
    try {
      await winModifyPath("remove", legacyBinDir);
    } catch (err) {
      errors.push(`${path.basename(legacyBinDir)} PATH: ${errorMessage(err)}`);
    }
  }

  log.info("[cli] Windows CLI installed");
  if (errors.length > 0) {
    return {
      success: true,
      message: `CLI installed. Legacy PATH migration partially failed (${errors.join("; ")}).`,
    };
  }
  return { success: true, message: "CLI installed. Please reopen your terminal." };
}

// POSIX CLI 安装：生成 wrapper 并注入 shell profile。
async function installCliPosix(): Promise<CliResult> {
  const invalidRuntime = validateCliRuntime();
  if (invalidRuntime) return invalidRuntime;

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
}

// Windows CLI 卸载：清理当前与旧版目录，避免 PATH 残留。
async function uninstallCliWindows(): Promise<CliResult> {
  const errors: string[] = [];
  const wrapperPaths = [getWinWrapperPath(), ...getLegacyWinWrapperPaths()];
  const binDirs = [getWinBinDir(), ...getLegacyWinBinDirs()];

  for (const wrapperPath of wrapperPaths) {
    try {
      removeManagedWrapper(wrapperPath);
    } catch (err) {
      errors.push(`${path.basename(wrapperPath)}: ${errorMessage(err)}`);
    }
  }

  for (const binDir of binDirs) {
    try {
      await winModifyPath("remove", binDir);
    } catch (err) {
      errors.push(`${path.basename(binDir)} PATH: ${errorMessage(err)}`);
    }
  }

  log.info("[cli] Windows CLI uninstalled");
  if (errors.length > 0) {
    return {
      success: false,
      message: `CLI uninstall cleanup failed (${errors.join("; ")})`,
    };
  }
  return { success: true, message: "CLI uninstalled." };
}

// POSIX CLI 卸载：删除 wrapper 和 profile 注入块，过程尽量容错。
async function uninstallCliPosix(): Promise<CliResult> {
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
}

// 安装 CLI：持久化用户意图，并把旧版 Windows PATH 迁移到新目录。
export async function installCli(): Promise<CliResult> {
  try {
    setCliEnabledPreference(true);
    return IS_WIN ? await installCliWindows() : await installCliPosix();
  } catch (err) {
    const msg = errorMessage(err);
    log.error(`[cli] install failed: ${msg}`);
    return { success: false, message: msg };
  }
}

// 卸载 CLI：记录显式关闭偏好，并清理当前与旧版安装痕迹。
export async function uninstallCli(): Promise<CliResult> {
  try {
    setCliEnabledPreference(false);
    return IS_WIN ? await uninstallCliWindows() : await uninstallCliPosix();
  } catch (err) {
    const msg = errorMessage(err);
    log.error(`[cli] uninstall failed: ${msg}`);
    return { success: false, message: msg };
  }
}

// 对外暴露 CLI 状态：enabled 代表用户偏好，installed 代表当前或旧版 wrapper 足迹。
export function getCliStatus(): CliStatus {
  const footprint = readCliInstallFootprint();
  const enabled =
    inferCliEnabledPreference(
      getCliEnabledPreference(),
      footprint.currentInstalled,
      footprint.legacyInstalled,
    ) === true;

  return {
    enabled,
    installed: footprint.currentInstalled || footprint.legacyInstalled,
    command: "openclaw",
  };
}

// 判断 CLI 是否安装：兼容旧版 Windows wrapper 路径。
export function isCliInstalled(): boolean {
  return getCliStatus().installed;
}

// Windows 启动自愈：为已开启 CLI 的用户补回当前 PATH，并迁移旧版目录。
export async function reconcileCliOnAppLaunch(): Promise<void> {
  if (!IS_WIN) return;

  const footprint = readCliInstallFootprint();
  const savedEnabled = getCliEnabledPreference();
  const inferredEnabled = inferCliEnabledPreference(
    savedEnabled,
    footprint.currentInstalled,
    footprint.legacyInstalled,
  );
  if (inferredEnabled === undefined) return;

  if (savedEnabled !== inferredEnabled) {
    setCliEnabledPreference(inferredEnabled);
    log.info(`[cli] Migrated CLI enabled preference on launch: ${inferredEnabled}`);
  }

  const result = inferredEnabled ? await installCliWindows() : await uninstallCliWindows();
  if (!result.success) {
    throw new Error(result.message);
  }
}
