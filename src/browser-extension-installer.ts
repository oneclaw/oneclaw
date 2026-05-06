import * as fs from "fs";
import * as path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  BROWSER_TARGETS,
  BrowserTarget,
  isBrowserInstalled,
  resolveUserDataDir,
} from "./browser-detector";
import { getDefaultBrowser } from "./default-browser-detector";
import {
  isBrowserProcessRunning,
  type ProcessExecutor,
} from "./browser-process-detector";

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

const execFileAsync = promisify(execFile);

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
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      { external_crx: spec.crxPath, external_version: spec.crxVersion },
      null,
      2,
    ),
    "utf-8",
  );
  return existing === null ? "installed" : "updated";
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
    getDefault?: () => { target: BrowserTarget } | null;
  } = {},
): Promise<BrowserInstallSummary[]> {
  const getDefault = options.getDefault ?? getDefaultBrowser;
  const def = getDefault();
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
  | "preferences-missing";

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
  fs.writeFileSync(p, JSON.stringify(prefs), "utf-8");
  return "cleaned";
}
