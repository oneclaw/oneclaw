// browser.ts — 浏览器检测 / 扩展安装 / 三模式配置
// 合并自原 browser-detector.ts + browser-extension-installer.ts + browser-mode-config.ts
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import {
  CURRENT_CHROME_BROWSER_PROFILE,
  LEGACY_CHROME_BROWSER_PROFILES,
  migrateBrowserProfileForCurrentGateway,
  normalizeRequestedBrowserProfileForSave,
} from "./browser-profile-config";

// ═══════════════════════════════════════════════════════════════════
// 浏览器检测（targets / 默认浏览器 / 进程态）
// ═══════════════════════════════════════════════════════════════════


export interface BrowserTarget {
  id: string;
  name: string;
  userDataDirMac: string;
  userDataDirWin: string;
  winRegistryKey: string;
  // Preferences 所在子目录（相对 userDataDir）。Chromium 标准是 "Default"。
  profileSubdir: string;
  // 进程检测用：可执行文件名（macOS pgrep -f / Windows tasklist /FI）
  processNameMac: string;
  processNameWin: string;
  // 真"装了"判定用：macOS app bundle 名（"Google Chrome.app"）
  appNameMac: string;
  // 默认浏览器识别用：Win stable 安装路径的稳定片段。
  // 必须用完整路径片段而不是 processNameWin —— Chrome Beta / Dev / Canary 的 exe 名也是
  // chrome.exe，但路径里 vendor/channel 段不一样（"Chrome Beta" / "Chrome Dev" / "Chrome SxS"）。
  // 老 reg 实现通过 ProgId 区分（ChromeHTML vs ChromeBetaHTML），新实现通过路径片段对齐。
  winInstallPathFragment: string;
}

export const BROWSER_TARGETS: readonly BrowserTarget[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    userDataDirMac: "Library/Application Support/Google/Chrome",
    userDataDirWin: "AppData/Local/Google/Chrome/User Data",
    winRegistryKey: "HKCU\\Software\\Google\\Chrome\\Extensions",
    profileSubdir: "Default",
    processNameMac: "Google Chrome.app/Contents/MacOS/Google Chrome",
    processNameWin: "chrome.exe",
    appNameMac: "Google Chrome.app",
    // Beta/Dev/Canary 路径分别为 \Chrome Beta\、\Chrome Dev\、\Chrome SxS\，仅 stable 命中
    winInstallPathFragment: "\\Google\\Chrome\\Application\\chrome.exe",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    userDataDirMac: "Library/Application Support/Microsoft Edge",
    userDataDirWin: "AppData/Local/Microsoft/Edge/User Data",
    winRegistryKey: "HKCU\\Software\\Microsoft\\Edge\\Extensions",
    profileSubdir: "Default",
    processNameMac: "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    processNameWin: "msedge.exe",
    appNameMac: "Microsoft Edge.app",
    // Beta/Dev 路径分别为 \Edge Beta\、\Edge Dev\，仅 stable 命中
    winInstallPathFragment: "\\Microsoft\\Edge\\Application\\msedge.exe",
  },
];

function resolveHome(): string {
  const home =
    process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
  return home ?? "";
}

export function resolveUserDataDir(target: BrowserTarget): string {
  const rel =
    process.platform === "win32" ? target.userDataDirWin : target.userDataDirMac;
  return path.join(resolveHome(), rel);
}

// 真"装了"判定。
// macOS：先看 /Applications/<App>.app 或 ~/Applications/<App>.app（覆盖系统装/用户装）；
// 退而求其次：<userDataDir>/Local State 存在（Chromium 启动时创建，OneClaw 不会写）。
// Windows：只用 <userDataDir>/Local State（Chromium 至少启动过一次）。
// 注意：不能用「user data dir 是否存在」判定——OneClaw 写 External Extensions JSON 时
// 会自己创建 user data dir 子目录，造成"幽灵安装"假象。
//
// 测试钩子：env ONECLAW_BROWSER_APPS_DIRS=":分隔" 可覆盖 macOS app 搜索路径
// （绕开宿主机 /Applications 里真实装的浏览器对单元测试的污染）。
function macAppSearchDirs(): string[] {
  const override = process.env.ONECLAW_BROWSER_APPS_DIRS;
  if (override) return override.split(":").filter(Boolean);
  return ["/Applications", path.join(resolveHome(), "Applications")];
}

export function isBrowserInstalled(target: BrowserTarget): boolean {
  if (process.platform === "darwin") {
    for (const dir of macAppSearchDirs()) {
      if (fs.existsSync(path.join(dir, target.appNameMac))) return true;
    }
  }
  return fs.existsSync(path.join(resolveUserDataDir(target), "Local State"));
}

export function listInstalledBrowsers(): BrowserTarget[] {
  return BROWSER_TARGETS.filter((t) => isBrowserInstalled(t));
}

// ───────────────────────────── 默认浏览器 ─────────────────────────────
// 老实现走 `plutil` (mac) / `reg query` (win) 子进程 + 解析 stdout，spawnSync
// 同步阻塞 + 文本格式脆弱（mac 系统语言 / Win locale 都可能影响 reg 输出）。
// 现在直接调 Electron 自带的 app.getApplicationInfoForProtocol，它内部就是
// LSCopyDefaultApplicationURLForURL（mac）/ IApplicationAssociationRegistration
// （win）的官方包装，返回 .app bundle / .exe 的稳定路径。
//
// 测试通过 deps.getInfo 注入 mock，生产路径 lazy require electron 避免
// import-time 触碰（tsx --test 跑 browser.test.ts 不在 Electron 上下文）。

export interface DefaultBrowserResult {
  target: BrowserTarget;
}

export interface ProtocolAppInfo {
  name: string;
  path: string;
  icon: unknown;
}

export interface DefaultBrowserDeps {
  platform?: NodeJS.Platform;
  getInfo?: () => Promise<ProtocolAppInfo>;
}

function defaultGetInfo(): Promise<ProtocolAppInfo> {
  // lazy require：browser.ts 顶层避免 import electron，否则 tsx 测试爆炸
  const { app } = require("electron") as typeof import("electron");
  // 带 host 的 URL：裸 "https://" 在部分 Electron 版本底层 URL 解析会失败
  return app.getApplicationInfoForProtocol("https://example.com/");
}

export async function getDefaultBrowser(
  deps: DefaultBrowserDeps = {},
): Promise<DefaultBrowserResult | null> {
  const platform = deps.platform ?? process.platform;
  const getInfo = deps.getInfo ?? defaultGetInfo;
  let info: ProtocolAppInfo;
  try {
    info = await getInfo();
  } catch {
    return null;
  }
  if (!info?.path || typeof info.path !== "string") return null;
  // 直接用 BROWSER_TARGETS 已有的字段做 path 匹配，不再维护单独的 ProgId / BundleId 表。
  const target = BROWSER_TARGETS.find((t) => {
    if (platform === "darwin") {
      // mac path 形如 /Applications/Google Chrome.app
      // endsWith("Google Chrome.app") 不会命中 "Google Chrome Beta.app"，已天然区分 channel
      return (
        info.path.endsWith(t.appNameMac) ||
        info.path.includes(`/${t.appNameMac}/`)
      );
    }
    if (platform === "win32") {
      // win path 形如 C:\Program Files\Google\Chrome\Application\chrome.exe
      // 必须用完整路径片段匹配。Chrome Beta / Dev / Canary 的 exe 名也是 chrome.exe，
      // 但路径里 channel 段不一样（"Chrome Beta" / "Chrome Dev" / "Chrome SxS"），
      // 仅匹配 exe 名后缀会让 Beta 被误认为 stable。
      // 大小写 + 反斜杠 normalize（虽然 Win API 通常返回反斜杠）
      const normalized = info.path.toLowerCase().replace(/\//g, "\\");
      return normalized.includes(t.winInstallPathFragment.toLowerCase());
    }
    return false;
  });
  return target ? { target } : null;
}

// ───────────────────────────── 浏览器进程探测 ─────────────────────────────

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

// ═══════════════════════════════════════════════════════════════════
// 扩展安装（External Extensions JSON / Win 注册表 / blocklist）
// ═══════════════════════════════════════════════════════════════════


export type InstallResult =
  | "installed"
  | "updated"
  | "skipped"
  | "browser-not-installed";

export type UninstallResult =
  | "removed"
  | "not-installed"
  | "browser-not-installed";

export interface RegExecutor {
  (args: readonly string[]): Promise<{
    stdout: string;
    stderr: string;
    code: number;
  }>;
}

export interface CommonOptions {
  exec?: RegExecutor;
  platform?: NodeJS.Platform | string;
  skipUserDataCheck?: boolean;
  // 进程探测器（pgrep / tasklist 抽象）。未提供时 getExtensionStates 默认 running=false，
  // 避免测试在开发机上意外命中宿主机的真实 Chrome 进程。生产路径需要显式传入真实 exec。
  processExec?: ProcessExecutor;
}

/**
 * OneClaw 用 Chrome External Extensions 协议宣告本地 CRX 安装包：
 *   - 替代 external_update_url（指向被墙的 clients2.google.com）
 *   - external_crx 给绝对路径、external_version 必须等于 CRX 内 manifest.json 的 version
 *   - extId 必须等于 CRX 内嵌公钥的 fingerprint，否则 Chrome 会拒绝
 */
export interface ExtensionSpec {
  extId: string;
  crxPath: string;
  crxVersion: string;
}


const defaultRegExecutor: RegExecutor = async (args) => {
  try {
    const { stdout, stderr } = await execFileAsync("reg.exe", args as string[]);
    return { stdout, stderr, code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message ?? "",
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
};

// ---------- macOS ----------

function macExternalExtensionsPath(
  target: BrowserTarget,
  extId: string,
): string {
  return path.join(
    resolveUserDataDir(target),
    "External Extensions",
    `${extId}.json`,
  );
}

interface MacExternalExtensionJson {
  external_crx?: string;
  external_version?: string;
}

function readMacJsonIfValid(
  target: BrowserTarget,
  extId: string,
): MacExternalExtensionJson | null {
  const p = macExternalExtensionsPath(target, extId);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (parsed && typeof parsed === "object") {
      return parsed as MacExternalExtensionJson;
    }
    return null;
  } catch {
    return null;
  }
}

function macJsonMatchesSpec(
  parsed: MacExternalExtensionJson | null,
  spec: ExtensionSpec,
): boolean {
  return (
    !!parsed &&
    parsed.external_crx === spec.crxPath &&
    parsed.external_version === spec.crxVersion
  );
}

// ---------- Windows ----------

function windowsExtKeyPath(target: BrowserTarget, extId: string): string {
  return `${target.winRegistryKey}\\${extId}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runRegQuery(
  exec: RegExecutor,
  keyPath: string,
  valueName: string,
): Promise<string | null> {
  const result = await exec(["query", keyPath, "/v", valueName]);
  if (result.code !== 0) return null;
  // reg query 输出形如 "    update_url    REG_SZ    https://..."
  const match = new RegExp(
    `\\s${escapeRegex(valueName)}\\s+REG_SZ\\s+(.+?)\\s*$`,
    "m",
  ).exec(result.stdout);
  return match ? match[1].trim() : null;
}

async function runRegAdd(
  exec: RegExecutor,
  keyPath: string,
  valueName: string,
  data: string,
): Promise<void> {
  const result = await exec([
    "add",
    keyPath,
    "/v",
    valueName,
    "/t",
    "REG_SZ",
    "/d",
    data,
    "/f",
  ]);
  if (result.code !== 0) {
    throw new Error(
      `reg add ${keyPath} failed (code ${result.code}): ${result.stderr.trim()}`,
    );
  }
}

async function runRegDelete(
  exec: RegExecutor,
  keyPath: string,
): Promise<void> {
  const result = await exec(["delete", keyPath, "/f"]);
  if (result.code !== 0) {
    throw new Error(
      `reg delete ${keyPath} failed (code ${result.code}): ${result.stderr.trim()}`,
    );
  }
}

// ---------- Public API ----------

export async function isExtensionConfigured(
  target: BrowserTarget,
  spec: ExtensionSpec,
  options: CommonOptions = {},
): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const exec = options.exec ?? defaultRegExecutor;
    const keyPath = windowsExtKeyPath(target, spec.extId);
    const [pathVal, versionVal] = await Promise.all([
      runRegQuery(exec, keyPath, "path"),
      runRegQuery(exec, keyPath, "version"),
    ]);
    return pathVal === spec.crxPath && versionVal === spec.crxVersion;
  }
  return macJsonMatchesSpec(readMacJsonIfValid(target, spec.extId), spec);
}

export async function installExtension(
  target: BrowserTarget,
  spec: ExtensionSpec,
  options: CommonOptions = {},
): Promise<InstallResult> {
  const platform = options.platform ?? process.platform;
  if (!options.skipUserDataCheck && !isBrowserInstalled(target)) {
    return "browser-not-installed";
  }
  if (platform === "win32") {
    const exec = options.exec ?? defaultRegExecutor;
    const keyPath = windowsExtKeyPath(target, spec.extId);
    const [pathVal, versionVal, oldUpdateUrl] = await Promise.all([
      runRegQuery(exec, keyPath, "path"),
      runRegQuery(exec, keyPath, "version"),
      runRegQuery(exec, keyPath, "update_url"),
    ]);
    if (pathVal === spec.crxPath && versionVal === spec.crxVersion) {
      return "skipped";
    }
    // 任何旧值（path/version 漂了 / 旧版只写过 update_url）→ 先清整个 subkey 再写新值，
    // 避免 Chrome 同时看到 update_url 和 path 两套 source
    const hadAny =
      pathVal !== null || versionVal !== null || oldUpdateUrl !== null;
    if (hadAny) {
      await runRegDelete(exec, keyPath).catch(() => undefined);
    }
    await runRegAdd(exec, keyPath, "path", spec.crxPath);
    await runRegAdd(exec, keyPath, "version", spec.crxVersion);
    return hadAny ? "updated" : "installed";
  }
  // macOS
  const jsonPath = macExternalExtensionsPath(target, spec.extId);
  const existing = readMacJsonIfValid(target, spec.extId);
  if (macJsonMatchesSpec(existing, spec)) return "skipped";
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  atomicWriteFile(
    jsonPath,
    JSON.stringify(
      { external_crx: spec.crxPath, external_version: spec.crxVersion },
      null,
      2,
    ),
  );
  return existing === null ? "installed" : "updated";
}

// 写临时文件 → rename 替换。崩溃 / 断电 / 磁盘满时只会留下 .tmp 残骸，
// 不会让目标文件出现半写状态——尤其重要的是 Chrome `Preferences`，那是
// 用户配置不是 OneClaw 私有数据，损坏代价大。
function atomicWriteFile(targetPath: string, data: string): void {
  const tmpPath = `${targetPath}.oneclaw.tmp-${process.pid}`;
  fs.writeFileSync(tmpPath, data, "utf-8");
  fs.renameSync(tmpPath, targetPath);
}

export async function uninstallExtension(
  target: BrowserTarget,
  extId: string,
  options: CommonOptions = {},
): Promise<UninstallResult> {
  const platform = options.platform ?? process.platform;
  if (!options.skipUserDataCheck && !isBrowserInstalled(target)) {
    return "browser-not-installed";
  }
  if (platform === "win32") {
    const exec = options.exec ?? defaultRegExecutor;
    const keyPath = windowsExtKeyPath(target, extId);
    // 新版用 path/version，老版用 update_url。任何一个存在就算"装着"，整体删 subkey 是幂等的。
    const [pathVal, versionVal, updateUrl] = await Promise.all([
      runRegQuery(exec, keyPath, "path"),
      runRegQuery(exec, keyPath, "version"),
      runRegQuery(exec, keyPath, "update_url"),
    ]);
    if (pathVal === null && versionVal === null && updateUrl === null) {
      return "not-installed";
    }
    await runRegDelete(exec, keyPath);
    return "removed";
  }
  // macOS
  const p = macExternalExtensionsPath(target, extId);
  if (!fs.existsSync(p)) return "not-installed";
  fs.unlinkSync(p);
  return "removed";
}

// ---------- Batch API（给 setup-ipc / settings-ipc 用） ----------

export interface BrowserInstallSummary {
  browserId: string;
  browserName: string;
  result: InstallResult | UninstallResult;
  error?: string;
}

export interface BrowserState {
  browserId: string;
  browserName: string;
  installed: boolean;
  configured: boolean;
  blocklisted: boolean;
  presentInChrome: boolean;
  // Chrome 已经把扩展条目写进 settings 但 state !== 1（用户没在弹窗里点"启用"）。
  // 用于左侧栏 pill 区分两种修复路径：
  //   pendingEnable=true → "请打开浏览器并启用扩展"（用户操作即可，不走自动修复）
  //   pendingEnable=false + presentInChrome=false → 真实组件缺失（走自动修复）
  extensionPendingEnable: boolean;
  running: boolean;
}

export async function installForAllDetectedBrowsers(
  spec: ExtensionSpec,
  options: CommonOptions = {},
): Promise<BrowserInstallSummary[]> {
  const out: BrowserInstallSummary[] = [];
  for (const target of BROWSER_TARGETS) {
    try {
      const result = await installExtension(target, spec, options);
      out.push({ browserId: target.id, browserName: target.name, result });
    } catch (err) {
      out.push({
        browserId: target.id,
        browserName: target.name,
        result: "browser-not-installed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

// 单一默认浏览器策略：OneClaw 只在系统默认浏览器（Chrome/Edge）上装扩展。
// 默认非 Chrome/Edge → 返回空数组，runWebbridgeSetupTask 严格语义会自动降级 openclaw 模式。
export async function installForDefaultBrowser(
  spec: ExtensionSpec,
  options: CommonOptions & {
    getDefault?: () => Promise<{ target: BrowserTarget } | null>;
  } = {},
): Promise<BrowserInstallSummary[]> {
  const getDefault = options.getDefault ?? getDefaultBrowser;
  const def = await getDefault();
  if (!def) return [];
  try {
    const result = await installExtension(def.target, spec, options);
    return [
      { browserId: def.target.id, browserName: def.target.name, result },
    ];
  } catch (err) {
    return [
      {
        browserId: def.target.id,
        browserName: def.target.name,
        result: "browser-not-installed",
        error: err instanceof Error ? err.message : String(err),
      },
    ];
  }
}

export async function uninstallForAllDetectedBrowsers(
  extId: string,
  options: CommonOptions = {},
): Promise<BrowserInstallSummary[]> {
  const out: BrowserInstallSummary[] = [];
  for (const target of BROWSER_TARGETS) {
    try {
      const result = await uninstallExtension(target, extId, options);
      out.push({ browserId: target.id, browserName: target.name, result });
    } catch (err) {
      out.push({
        browserId: target.id,
        browserName: target.name,
        result: "not-installed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export async function getExtensionStates(
  spec: ExtensionSpec,
  options: CommonOptions & { processCheckBrowserId?: string } = {},
): Promise<BrowserState[]> {
  const out: BrowserState[] = [];
  for (const target of BROWSER_TARGETS) {
    const installed = isBrowserInstalled(target);
    const configured = installed
      ? await isExtensionConfigured(target, spec, options)
      : false;
    // configured 只代表「JSON/registry 指向当前 CRX」，不代表 Chrome 真装上了。
    // 真实组合：JSON 在 + blocklist 在 → Chrome 启动时读 JSON 但被 blocklist 跳过 → 啥也没装。
    // 所以 blocklist 检查必须独立于 configured，只要浏览器装了就要查。
    const blocklisted = installed
      ? await isExtensionBlocklisted(target, spec.extId)
      : false;
    const presentInChrome = installed
      ? await isExtensionPresentInChrome(target, spec.extId)
      : false;
    // pendingEnable：Chrome 写了 settings entry 但 state !== 1
    // External Extensions JSON 注入后，Chrome 启动会写一条 state=0 + 弹"是否启用"对话框。
    // 用户没点之前 background 不跑，但 entry 在 → 这里就是 true。
    // presentInChrome 已经严格判 state===1，所以两者互斥：要么 enabled，要么 pending，要么完全不在。
    const extensionPendingEnable =
      installed && !presentInChrome
        ? await isExtensionEntryPresent(target, spec.extId)
        : false;
    // 进程检测在 Win 上 tasklist 慢（~3s/次，被 Defender 扫）。precheck 调用方传 processCheckBrowserId
    // 限定只对默认浏览器查（其它浏览器 running=false），把 N×tasklist 降到 1×。
    const shouldCheckProcess =
      options.processExec &&
      (options.processCheckBrowserId === undefined ||
        options.processCheckBrowserId === target.id);
    const running =
      installed && shouldCheckProcess
        ? await isBrowserProcessRunning(target, {
            exec: options.processExec,
            platform: options.platform,
          })
        : false;
    out.push({
      browserId: target.id,
      browserName: target.name,
      installed,
      configured,
      blocklisted,
      presentInChrome,
      extensionPendingEnable,
      running,
    });
  }
  return out;
}

// ---------- Blocklist 检测 + 清理 ----------

export type BlocklistCleanResult =
  | "cleaned"
  | "not-blocklisted"
  | "preferences-missing"
  // 杀进程→改写完成后再读 Preferences 仍然命中 blocklist。
  // 大概率是用户在我们 kill 完到 rename 之间手动开了浏览器，
  // Chrome 启动会用内存状态覆盖磁盘——此时让用户先关浏览器再重试。
  | "verify-failed";

function preferencesPath(target: BrowserTarget): string {
  return path.join(
    resolveUserDataDir(target),
    target.profileSubdir,
    "Preferences",
  );
}

function securePreferencesPath(target: BrowserTarget): string {
  return path.join(
    resolveUserDataDir(target),
    target.profileSubdir,
    "Secure Preferences",
  );
}

function readPreferencesIfValid(target: BrowserTarget): any | null {
  const p = preferencesPath(target);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function readSecurePreferencesIfValid(target: BrowserTarget): any | null {
  const p = securePreferencesPath(target);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

// Chrome 自己维护的"真实已装扩展"列表。比 External Extensions JSON 更权威——
// 后者只是 OneClaw 写给 Chrome 的"建议"，前者反映 Chrome 是否真的把扩展加载进来了。
// 用户从 chrome://extensions UI 卸载后会被移出 settings；如果没同时进 external_uninstalls
// 黑名单（不同 Chrome 版本/卸载入口行为不一致），blocklist 检查会漏报。
//
// 「真的加载进来 + 启用」判定走 disable_reasons，不能看 state：
//   - 现代 Chromium（~M91+）已不写 state 字段；启用状态默认无 state
//   - disable_reasons 是真正的 source of truth：空/缺失 = 启用；非空 = 用户禁用了
//   - External Extensions JSON 注入后用户未启用前，Chrome 会写带 disable_reasons 的 entry
//     （包含 USER_ACTION_PENDING 之类的 reason）→ 此时 entry 存在但未启用
// disable_reasons 在不同 Chrome 版本两种 schema：
//   - 老版本：number（bitmask，0 = enabled）
//   - 新版本：array（空 = enabled）
function isExtensionEntryEnabled(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const dr = (entry as { disable_reasons?: unknown }).disable_reasons;
  if (dr === undefined || dr === null) return true; // 字段缺失 = 启用
  if (typeof dr === "number") return dr === 0;
  if (Array.isArray(dr)) return dr.length === 0;
  return false; // 未知 shape，保守判未启用
}

export async function isExtensionPresentInChrome(
  target: BrowserTarget,
  extId: string,
): Promise<boolean> {
  const sp = readSecurePreferencesIfValid(target);
  if (!sp) return false;
  const settings = sp?.extensions?.settings;
  if (!settings || typeof settings !== "object") return false;
  const entry = (settings as Record<string, unknown>)[extId];
  if (!entry) return false;
  return isExtensionEntryEnabled(entry);
}

// 比 isExtensionPresentInChrome 弱的判断：只看 settings 里有没有 entry，不要求 enabled。
// 用于区分"扩展条目根本不在"（真缺失）vs"条目在但 disabled"（用户没点弹窗启用 / 主动禁用）。
export async function isExtensionEntryPresent(
  target: BrowserTarget,
  extId: string,
): Promise<boolean> {
  const sp = readSecurePreferencesIfValid(target);
  if (!sp) return false;
  const settings = sp?.extensions?.settings;
  if (!settings || typeof settings !== "object") return false;
  return Object.prototype.hasOwnProperty.call(settings, extId);
}

export async function isExtensionBlocklisted(
  target: BrowserTarget,
  extId: string,
): Promise<boolean> {
  const prefs = readPreferencesIfValid(target);
  if (!prefs) return false;
  const list = prefs?.extensions?.external_uninstalls;
  if (!Array.isArray(list)) return false;
  return list.includes(extId);
}

export async function cleanExtensionBlocklist(
  target: BrowserTarget,
  extId: string,
): Promise<BlocklistCleanResult> {
  const p = preferencesPath(target);
  if (!fs.existsSync(p)) return "preferences-missing";
  const prefs = readPreferencesIfValid(target);
  if (!prefs) return "preferences-missing";
  const list = prefs?.extensions?.external_uninstalls;
  if (!Array.isArray(list) || !list.includes(extId)) return "not-blocklisted";
  prefs.extensions.external_uninstalls = list.filter(
    (x: unknown) => x !== extId,
  );
  atomicWriteFile(p, JSON.stringify(prefs));
  // 二次验证：确认改动落盘且没被并发的 Chrome 进程覆盖。
  // 重新读取(走完整的 readPreferencesIfValid 校验)，extId 仍在则失败。
  const verify = readPreferencesIfValid(target);
  const verifyList = verify?.extensions?.external_uninstalls;
  if (Array.isArray(verifyList) && verifyList.includes(extId)) {
    return "verify-failed";
  }
  return "cleaned";
}

// ═══════════════════════════════════════════════════════════════════
// 三模式配置（openclaw / user / webbridge）
// ═══════════════════════════════════════════════════════════════════

export const BROWSER_MODES = ["openclaw", "user", "webbridge"] as const;

export type BrowserMode = (typeof BROWSER_MODES)[number];

// 老 IPC（feat/webbridge-on-main 早期版本）用的 alias —— 服务端宽容接受，落盘前归一化成 "user"。
const LEGACY_BROWSER_MODE_ALIASES: Record<string, BrowserMode> = {
  chrome: "user",
};

export function isBrowserMode(value: unknown): value is BrowserMode {
  return (
    typeof value === "string" &&
    (BROWSER_MODES as readonly string[]).includes(value)
  );
}

// 把传入字符串规范成现行 BrowserMode（吃下老 alias）
export function coerceBrowserMode(value: unknown): BrowserMode | null {
  if (typeof value !== "string") return null;
  if (isBrowserMode(value)) return value;
  return LEGACY_BROWSER_MODE_ALIASES[value] ?? null;
}

// openclaw.json 的最小形状——只列本模块会碰的字段；其他字段用 Record 兜底
interface OneclawConfigShape {
  browser?: {
    defaultProfile?: string;
    [key: string]: unknown;
  };
  plugins?: {
    entries?: {
      browser?: { enabled?: boolean; [key: string]: unknown };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  skills?: {
    entries?: {
      "kimi-webbridge"?: { enabled?: boolean; [key: string]: unknown };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function applyBrowserModeConfig(
  config: OneclawConfigShape,
  mode: BrowserMode,
): any {
  switch (mode) {
    case "openclaw":
    case "user":
      return applyOpenclawOrUserMode(config, mode);
    case "webbridge":
      return applyWebbridgeMode(config);
  }
}

function applyWebbridgeMode(config: OneclawConfigShape): any {
  return {
    ...config,
    plugins: {
      ...(config.plugins ?? {}),
      entries: {
        ...(config.plugins?.entries ?? {}),
        browser: {
          ...(config.plugins?.entries?.browser ?? {}),
          enabled: false,
        },
      },
    },
    skills: {
      ...(config.skills ?? {}),
      entries: {
        ...(config.skills?.entries ?? {}),
        "kimi-webbridge": {
          ...(config.skills?.entries?.["kimi-webbridge"] ?? {}),
          enabled: true,
        },
      },
    },
  };
}

export function detectBrowserMode(config: OneclawConfigShape): BrowserMode {
  // webbridge 优先：插件被显式关掉 → 用户在 webbridge 模式
  if (config?.plugins?.entries?.browser?.enabled === false) {
    return "webbridge";
  }
  const stored =
    typeof config?.browser?.defaultProfile === "string"
      ? config.browser.defaultProfile.trim()
      : "";
  // 现代 user profile + 老 chrome 名都识别成 user 模式（OpenClaw 当前会话）
  if (
    stored === CURRENT_CHROME_BROWSER_PROFILE ||
    LEGACY_CHROME_BROWSER_PROFILES.has(stored)
  ) {
    return "user";
  }
  return "openclaw";
}

function applyOpenclawOrUserMode(
  config: OneclawConfigShape,
  mode: "openclaw" | "user",
): any {
  // 复用 main 分支的 normalize 逻辑：
  //   "openclaw" → 内置 dedicated profile
  //   "user"     → CURRENT_CHROME_BROWSER_PROFILE，除非用户已显式创建同名自定义 profile
  const stored = normalizeRequestedBrowserProfileForSave(config, mode);
  const next = {
    ...config,
    browser: {
      ...(config.browser ?? {}),
      defaultProfile: stored,
    },
    plugins: {
      ...(config.plugins ?? {}),
      entries: {
        ...(config.plugins?.entries ?? {}),
        browser: {
          ...(config.plugins?.entries?.browser ?? {}),
          enabled: true,
        },
      },
    },
    skills: {
      ...(config.skills ?? {}),
      entries: {
        ...(config.skills?.entries ?? {}),
        "kimi-webbridge": {
          ...(config.skills?.entries?.["kimi-webbridge"] ?? {}),
          enabled: false,
        },
      },
    },
  };
  // 顺手清掉旧 driver:"extension" profile，让 gateway 不会回到旧 relay 路径
  migrateBrowserProfileForCurrentGateway(next);
  return next;
}
