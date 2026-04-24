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
import {
  isBrowserProcessRunning,
  type ProcessExecutor,
} from "./browser-process-detector";

export const EXTERNAL_UPDATE_URL =
  "https://clients2.google.com/service/update2/crx";

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

function readMacJsonIfValid(
  target: BrowserTarget,
  extId: string,
): { external_update_url: string } | null {
  const p = macExternalExtensionsPath(target, extId);
  if (!fs.existsSync(p)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf-8"));
    if (typeof parsed?.external_update_url === "string") return parsed;
    return null;
  } catch {
    return null;
  }
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
  extId: string,
  options: CommonOptions = {},
): Promise<boolean> {
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const exec = options.exec ?? defaultRegExecutor;
    const current = await runRegQuery(
      exec,
      windowsExtKeyPath(target, extId),
      "update_url",
    );
    return current === EXTERNAL_UPDATE_URL;
  }
  const parsed = readMacJsonIfValid(target, extId);
  return parsed?.external_update_url === EXTERNAL_UPDATE_URL;
}

export async function installExtension(
  target: BrowserTarget,
  extId: string,
  options: CommonOptions = {},
): Promise<InstallResult> {
  const platform = options.platform ?? process.platform;
  if (!options.skipUserDataCheck && !isBrowserInstalled(target)) {
    return "browser-not-installed";
  }
  if (platform === "win32") {
    const exec = options.exec ?? defaultRegExecutor;
    const keyPath = windowsExtKeyPath(target, extId);
    const current = await runRegQuery(exec, keyPath, "update_url");
    if (current === EXTERNAL_UPDATE_URL) return "skipped";
    await runRegAdd(exec, keyPath, "update_url", EXTERNAL_UPDATE_URL);
    return current === null ? "installed" : "updated";
  }
  // macOS
  const p = macExternalExtensionsPath(target, extId);
  const existing = readMacJsonIfValid(target, extId);
  if (existing?.external_update_url === EXTERNAL_UPDATE_URL) return "skipped";
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    JSON.stringify({ external_update_url: EXTERNAL_UPDATE_URL }, null, 2),
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
    const current = await runRegQuery(exec, keyPath, "update_url");
    if (current === null) return "not-installed";
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
  running: boolean;
}

export async function installForAllDetectedBrowsers(
  extId: string,
  options: CommonOptions = {},
): Promise<BrowserInstallSummary[]> {
  const out: BrowserInstallSummary[] = [];
  for (const target of BROWSER_TARGETS) {
    try {
      const result = await installExtension(target, extId, options);
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
  extId: string,
  options: CommonOptions = {},
): Promise<BrowserState[]> {
  const out: BrowserState[] = [];
  for (const target of BROWSER_TARGETS) {
    const installed = isBrowserInstalled(target);
    const configured = installed
      ? await isExtensionConfigured(target, extId, options)
      : false;
    // configured 只代表「JSON 在」，不代表 Chrome 真装上了。
    // 真实组合：JSON 在 + blocklist 在 → Chrome 启动时读 JSON 但被 blocklist 跳过 → 啥也没装。
    // 所以 blocklist 检查必须独立于 configured，只要浏览器装了就要查。
    const blocklisted = installed
      ? await isExtensionBlocklisted(target, extId)
      : false;
    const presentInChrome = installed
      ? await isExtensionPresentInChrome(target, extId)
      : false;
    const running =
      installed && options.processExec
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
export async function isExtensionPresentInChrome(
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
