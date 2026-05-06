// webbridge.ts — daemon 下载缓存 / setup 编排 / 状态聚合 / precheck
// 合并自原 webbridge-installer.ts + webbridge-setup-task.ts + webbridge-status.ts
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { execFile } from "child_process";
import { promisify } from "util";
import { URL } from "url";
import {
  readWebbridgeCrxMetadata,
  resolveWebbridgeCrxPath,
} from "./constants";
import type {
  BrowserInstallSummary,
  BrowserMode,
  BrowserState,
  ExtensionSpec,
} from "./browser";

// ═══════════════════════════════════════════════════════════════════
// installer（CDN 下载 / ETag 缓存 / 进度 / 重试）
// ═══════════════════════════════════════════════════════════════════

export const CDN_BASE_URL = "https://kimi-web-img.moonshot.cn/webbridge";

export function buildDownloadUrl(version: string, filename: string): string {
  return `${CDN_BASE_URL}/${version}/releases/${filename}`;
}

export function resolveWebbridgeVersion(override?: string): string {
  if (override) return override;
  const env = process.env.KIMI_WEBBRIDGE_VERSION?.trim();
  if (env) return env;
  return "latest";
}

export interface CacheManifest {
  version: string;
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
}

const CACHE_FILE_NAME = ".download-cache.json";

export function readCacheManifest(dataDir: string): CacheManifest | null {
  try {
    const raw = fs.readFileSync(path.join(dataDir, CACHE_FILE_NAME), "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      version: String(parsed.version ?? ""),
      etag: parsed.etag ?? null,
      lastModified: parsed.lastModified ?? null,
      contentLength:
        typeof parsed.contentLength === "number" ? parsed.contentLength : null,
    };
  } catch {
    return null;
  }
}

export function writeCacheManifest(
  dataDir: string,
  manifest: CacheManifest,
): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, CACHE_FILE_NAME),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

export interface HeadResult {
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
}

const MAX_REDIRECTS = 5;

function chooseTransport(url: string): typeof https | typeof http {
  return new URL(url).protocol === "http:" ? http : https;
}

export function httpHead(initialUrl: string): Promise<HeadResult> {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const request = (url: string) => {
      chooseTransport(url)
        .request(url, { method: "HEAD" }, (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            if (++redirects > MAX_REDIRECTS) {
              reject(new Error(`Too many redirects (>${MAX_REDIRECTS})`));
              return;
            }
            request(new URL(res.headers.location, url).toString());
            res.resume();
            return;
          }
          if (status !== 200) {
            reject(new Error(`HTTP ${status} — ${url}`));
            res.resume();
            return;
          }
          const lenRaw = res.headers["content-length"];
          resolve({
            etag: (res.headers.etag as string | undefined) ?? null,
            lastModified:
              (res.headers["last-modified"] as string | undefined) ?? null,
            contentLength:
              typeof lenRaw === "string"
                ? Number.parseInt(lenRaw, 10) || null
                : null,
          });
          res.resume();
        })
        .on("error", reject)
        .end();
    };
    request(initialUrl);
  });
}

export interface ProgressEvent {
  downloaded: number;
  total: number | null;
  pct: number | null;
}

export type ProgressHandler = (event: ProgressEvent) => void;

const DOWNLOAD_TIMEOUT_MS = 60_000;
const PROGRESS_INTERVAL_MS = 200;
const PROGRESS_BYTES_THRESHOLD = 64 * 1024;

export function downloadToFile(
  initialUrl: string,
  dest: string,
  onProgress?: ProgressHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${dest}.tmp-${process.pid}-${Date.now()}`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    let redirects = 0;
    let settled = false;
    let lastProgressAt = 0;
    let lastProgressBytes = 0;

    const cleanupTmp = () => {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {}
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanupTmp();
      reject(err);
    };

    const request = (url: string) => {
      const req = chooseTransport(url).get(url, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (++redirects > MAX_REDIRECTS) {
            fail(new Error(`Too many redirects (>${MAX_REDIRECTS})`));
            res.resume();
            return;
          }
          request(new URL(res.headers.location, url).toString());
          res.resume();
          return;
        }
        if (status !== 200) {
          fail(new Error(`HTTP ${status} — ${url}`));
          res.resume();
          return;
        }

        const lenRaw = res.headers["content-length"];
        const total =
          typeof lenRaw === "string"
            ? Number.parseInt(lenRaw, 10) || null
            : null;

        const file = fs.createWriteStream(tmpPath);
        let downloaded = 0;

        res.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          if (!onProgress) return;
          const now = Date.now();
          if (
            now - lastProgressAt >= PROGRESS_INTERVAL_MS ||
            downloaded - lastProgressBytes >= PROGRESS_BYTES_THRESHOLD
          ) {
            lastProgressAt = now;
            lastProgressBytes = downloaded;
            onProgress({
              downloaded,
              total,
              pct: total ? (downloaded / total) * 100 : null,
            });
          }
        });

        res.on("error", fail);
        file.on("error", fail);

        file.on("finish", () => {
          file.close((closeErr) => {
            if (settled) return;
            if (closeErr) {
              fail(closeErr);
              return;
            }
            try {
              fs.renameSync(tmpPath, dest);
            } catch (err) {
              fail(err as Error);
              return;
            }
            onProgress?.({
              downloaded,
              total,
              pct: total ? 100 : null,
            });
            settled = true;
            resolve();
          });
        });

        res.pipe(file);
      });

      req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
        req.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
      });
      req.on("error", fail);
    };

    request(initialUrl);
  });
}

export function resolvePlatformBinaryName(
  platform: NodeJS.Platform | string,
  arch: string,
): string {
  const key = `${platform}-${arch}`;
  switch (key) {
    case "darwin-arm64":
      return "kimi-webbridge-darwin-arm64";
    case "darwin-x64":
      return "kimi-webbridge-darwin-amd64";
    case "win32-x64":
    case "win32-arm64":
      return "kimi-webbridge-windows-amd64.exe";
    default:
      throw new Error(`Unsupported platform: ${key}`);
  }
}

export interface CheckForUpdateOptions {
  dataDir: string;
  version?: string;
  platform?: NodeJS.Platform | string;
  arch?: string;
  cdnBaseUrl?: string;
}

export interface CheckForUpdateResult {
  upToDate: boolean;
  remoteEtag: string | null;
}

export async function checkForUpdate(
  options: CheckForUpdateOptions,
): Promise<CheckForUpdateResult> {
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const version = resolveWebbridgeVersion(options.version);
  const filename = resolvePlatformBinaryName(platform, arch);
  const base = options.cdnBaseUrl ?? CDN_BASE_URL;
  const url = `${base}/${version}/releases/${filename}`;

  const head = await httpHead(url);
  const cache = readCacheManifest(options.dataDir);
  const upToDate = Boolean(
    cache && head.etag && cache.etag === head.etag,
  );
  return { upToDate, remoteEtag: head.etag };
}

export interface InstallOptions {
  dataDir?: string;
  binaryPath?: string;
  version?: string;
  platform?: NodeJS.Platform | string;
  arch?: string;
  cdnBaseUrl?: string;
  onProgress?: ProgressHandler;
  force?: boolean;
  maxRetries?: number;
}

export interface InstallResult {
  installed: boolean;
  skipped: boolean;
  version: string;
  binaryPath: string;
  etag: string | null;
}

const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|timed out|socket hang up/i.test(
    msg,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 解析默认路径——延迟到调用时，避免 import 期就触碰 process.env
function resolveDefaultDataDir(): string {
  const home =
    process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
  return path.join(home ?? "", ".kimi-webbridge");
}

function resolveDefaultBinaryPath(dataDir: string): string {
  const exe = process.platform === "win32" ? "kimi-webbridge.exe" : "kimi-webbridge";
  return path.join(dataDir, "bin", exe);
}

export async function installWebbridge(
  options: InstallOptions = {},
): Promise<InstallResult> {
  const dataDir = options.dataDir ?? resolveDefaultDataDir();
  const binaryPath = options.binaryPath ?? resolveDefaultBinaryPath(dataDir);
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const version = resolveWebbridgeVersion(options.version);
  const filename = resolvePlatformBinaryName(platform, arch);
  const base = options.cdnBaseUrl ?? CDN_BASE_URL;
  const url = `${base}/${version}/releases/${filename}`;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  // HEAD 拿 ETag（同时作为版本探测；404/403 会在这里直接抛出）
  const head = await httpHead(url);

  if (!options.force) {
    const cache = readCacheManifest(dataDir);
    if (
      cache &&
      head.etag &&
      cache.etag === head.etag &&
      fs.existsSync(binaryPath)
    ) {
      return {
        installed: false,
        skipped: true,
        version,
        binaryPath,
        etag: head.etag,
      };
    }
  }

  // 下载（重试 transient 错误）
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await downloadToFile(url, binaryPath, options.onProgress);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === maxRetries || !isTransientError(err)) {
        throw err;
      }
      await sleep(RETRY_BASE_DELAY_MS * Math.pow(3, attempt));
    }
  }
  if (lastErr) throw lastErr;

  if (process.platform !== "win32") {
    fs.chmodSync(binaryPath, 0o755);
  }

  writeCacheManifest(dataDir, {
    version,
    etag: head.etag,
    lastModified: head.lastModified,
    contentLength: head.contentLength,
  });

  return {
    installed: true,
    skipped: false,
    version,
    binaryPath,
    etag: head.etag,
  };
}

// ═══════════════════════════════════════════════════════════════════
// setup task（一键启用 webbridge：下载 / skill / 扩展 / 失败降级）
// ═══════════════════════════════════════════════════════════════════

export interface WebbridgeSetupTaskLogger {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

export interface WebbridgeSetupTaskDeps {
  // Phase 1：下载 webbridge 二进制。语义同 installWebbridge()。
  installer: () => Promise<InstallResult>;
  // Phase 3：批量装浏览器扩展。语义同 installForAllDetectedBrowsers(extId)。
  installExtensions: (extId: string) => Promise<BrowserInstallSummary[]>;
  // openclaw.json 读写；DI 供测试替换
  readConfig: () => any;
  writeConfig: (config: any) => void;
  // Phase 2：applyBrowserModeConfig 的直接注入
  applyMode: (config: any, mode: BrowserMode) => any;
  // build-config.json 里的 ext ID；空字符串 → 严格判失败（走降级）
  extensionId: string;
  // 降级到 openclaw 模式重写 config 后，通知调用方（生产：gateway restart）
  onConfigRewritten?: () => void;
  // binary 就绪后安装 skill 到各 AI runtime
  installSkill?: (
    binaryPath: string,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
  logger?: WebbridgeSetupTaskLogger;
  /**
   * true（默认）= 任何步骤失败时自动改写 config 到 openclaw 模式 + onConfigRewritten 通知。
   *               适合 Setup 完成后的 fire-and-forget 路径。
   * false = 失败只返回 outcome=fell-back-to-openclaw + error，不动 config 不通知。
   *         适合 Settings repair-and-enable 路径，由调用方决定是否写 config。
   */
  fallbackOnFailure?: boolean;
  /**
   * 选择性修复：跳过对应步骤（precheck 已确认在位时）。
   * Setup 路径默认全 false（跑完整流程）；Settings repair 路径按 precheck 缺啥跑啥。
   */
  skipBinaryInstall?: boolean;
  skipSkillInstall?: boolean;
  skipExtensionInstall?: boolean;
  /**
   * 当 skipBinaryInstall=true 时，跳过 installer() 调用，
   * 由调用方提供已存在的 binary 路径填入 summary。
   */
  existingBinaryPath?: string;
}

export type SetupTaskOutcome =
  | "webbridge-ready"
  | "fell-back-to-openclaw"
  | "extension-skipped";

export interface SetupTaskSummary {
  outcome: SetupTaskOutcome;
  webbridgeInstalled: boolean;
  binaryPath: string | null;
  extensionSummary: BrowserInstallSummary[] | null;
  error?: string;
}

const NOOP_LOGGER: WebbridgeSetupTaskLogger = {
  info: () => {},
  error: () => {},
};

export async function runWebbridgeSetupTask(
  deps: WebbridgeSetupTaskDeps,
): Promise<SetupTaskSummary> {
  const log = deps.logger ?? NOOP_LOGGER;
  const shouldFallback = deps.fallbackOnFailure !== false;

  const fail = (
    reason: string,
    error: string,
    binaryPath: string | null,
  ): SetupTaskSummary => {
    log.error(`[webbridge-setup] ${reason}: ${error}`);
    if (shouldFallback) {
      try {
        const current = deps.readConfig();
        const next = deps.applyMode(current, "openclaw");
        deps.writeConfig(next);
        deps.onConfigRewritten?.();
      } catch (rewriteErr) {
        const m =
          rewriteErr instanceof Error ? rewriteErr.message : String(rewriteErr);
        log.error(`[webbridge-setup] 降级改写 config 失败: ${m}`);
      }
    }
    return {
      outcome: "fell-back-to-openclaw",
      webbridgeInstalled: false,
      binaryPath,
      extensionSummary: null,
      error,
    };
  };

  // Step 1：下载 webbridge 二进制（precheck 已就绪时跳过）
  let binaryPath: string | null;
  if (deps.skipBinaryInstall) {
    binaryPath = deps.existingBinaryPath ?? null;
    log.info(`[webbridge-setup] 跳过 binary 下载（已就绪）: path=${binaryPath ?? "(unknown)"}`);
  } else {
    try {
      const installResult = await deps.installer();
      binaryPath = installResult.binaryPath;
      log.info(
        `[webbridge-setup] 二进制就绪: version=${installResult.version} skipped=${installResult.skipped} path=${installResult.binaryPath}`,
      );
    } catch (err) {
      return fail(
        "二进制下载失败",
        err instanceof Error ? err.message : String(err),
        null,
      );
    }
  }

  // Step 1.5：安装 skill（严格：失败/抛错都降级；precheck 已就绪时跳过）
  if (!deps.skipSkillInstall && deps.installSkill) {
    try {
      const skillResult = await deps.installSkill(binaryPath ?? "");
      if (!skillResult.success) {
        return fail(
          "skill 安装失败",
          skillResult.error ?? "(unknown)",
          binaryPath,
        );
      }
      log.info(
        `[webbridge-setup] skill 安装完成${
          skillResult.output ? `\n${skillResult.output.trimEnd()}` : ""
        }`,
      );
    } catch (err) {
      return fail(
        "skill 安装异常",
        err instanceof Error ? err.message : String(err),
        binaryPath,
      );
    }
  } else if (deps.skipSkillInstall) {
    log.info("[webbridge-setup] 跳过 skill 安装（已就绪）");
  }

  // Step 2 + 3：浏览器扩展（precheck 已就绪时整段跳过——extId 也不再校验）
  let extensionSummary: BrowserInstallSummary[] | null = null;
  if (!deps.skipExtensionInstall) {
    if (!deps.extensionId) {
      return fail(
        "未读到 WebBridge 扩展 ID（resources/webbridge/kimi-webbridge.json 缺失或损坏，严格判失败）",
        "no extension id",
        binaryPath,
      );
    }
    try {
      extensionSummary = await deps.installExtensions(deps.extensionId);
      log.info(
        `[webbridge-setup] 浏览器扩展安装完成: ${extensionSummary
          .map((r) => `${r.browserId}=${r.result}`)
          .join(" ")}`,
      );
    } catch (err) {
      return fail(
        "浏览器扩展批量安装失败",
        err instanceof Error ? err.message : String(err),
        binaryPath,
      );
    }
  } else {
    log.info("[webbridge-setup] 跳过浏览器扩展安装（已就绪）");
  }

  return {
    outcome: "webbridge-ready",
    webbridgeInstalled: true,
    binaryPath,
    extensionSummary,
  };
}

// ═══════════════════════════════════════════════════════════════════
// status（installState / extensionSpec / skill 安装 / precheck）
// ═══════════════════════════════════════════════════════════════════

// ───────────────────────── 状态聚合 ─────────────────────────

export interface WebbridgeInstallState {
  installed: boolean;
  version: string | null;
  binaryPath: string;
  etag: string | null;
  extensionId: string;
  browsers: BrowserState[];
}

export interface GetStateDeps {
  binaryPath: string;
  dataDir: string;
  fileExists: (p: string) => boolean;
  readManifest: (dataDir: string) => CacheManifest | null;
  readExtensionStates: (extId: string) => Promise<BrowserState[]>;
  extensionId: string;
}

export async function getWebbridgeInstallState(
  deps: GetStateDeps,
): Promise<WebbridgeInstallState> {
  const installed = deps.fileExists(deps.binaryPath);

  let version: string | null = null;
  let etag: string | null = null;
  if (installed) {
    try {
      const manifest = deps.readManifest(deps.dataDir);
      if (manifest) {
        version = manifest.version || null;
        etag = manifest.etag || null;
      }
    } catch {
      // disk IO 异常不传导
    }
  }

  let browsers: BrowserState[] = [];
  try {
    browsers = await deps.readExtensionStates(deps.extensionId);
  } catch {
    // reg/fs 异常不传导
  }

  return {
    installed,
    version,
    binaryPath: deps.binaryPath,
    etag,
    extensionId: deps.extensionId,
    browsers,
  };
}

// ───────────────────── ExtensionSpec 组装（sidecar） ─────────────────────

/**
 * 用 sidecar JSON（resources/webbridge/kimi-webbridge.json）+ CRX 文件组装完整 ExtensionSpec。
 * sidecar 是 extId / version 的唯一来源。
 * 任意一段缺失（CRX 没打包进来 / metadata JSON 损坏）→ 返回 null，
 * 调用方决定是降级 openclaw 还是保留现状。
 */
export function resolveWebbridgeExtensionSpec(): ExtensionSpec | null {
  const meta = readWebbridgeCrxMetadata();
  if (!meta) return null;

  const crxPath = resolveWebbridgeCrxPath();
  if (!fs.existsSync(crxPath)) return null;

  return { extId: meta.extensionId, crxPath, crxVersion: meta.version };
}

// ───────────────────────── Skill 安装 ─────────────────────────

export interface SkillInstallResult {
  success: boolean;
  output: string;
  error?: string;
}

export type ExecFileAsync = (
  cmd: string,
  args: string[],
  opts: { timeout: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export interface SkillInstallerDeps {
  execFileAsync?: ExecFileAsync;
}

const DEFAULT_SKILL_TIMEOUT_MS = 30_000;

const DEFAULT_EXEC_FILE: ExecFileAsync = (() => {
  const p = promisify(execFile);
  return async (cmd, args, opts) => {
    const res = await p(cmd, args, opts);
    return {
      stdout: String(res.stdout ?? ""),
      stderr: String(res.stderr ?? ""),
    };
  };
})();

export async function installWebbridgeSkill(
  binaryPath: string,
  deps: SkillInstallerDeps = {},
): Promise<SkillInstallResult> {
  const execFileAsync = deps.execFileAsync ?? DEFAULT_EXEC_FILE;
  try {
    const { stdout, stderr } = await execFileAsync(
      binaryPath,
      ["install-skill", "-y"],
      { timeout: DEFAULT_SKILL_TIMEOUT_MS, windowsHide: true },
    );
    const output = (stdout || "") + (stderr ? "\n" + stderr : "");
    return { success: true, output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: msg };
  }
}

// ───────────────────────── Precheck ─────────────────────────

function home(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

// OneClaw 只关心自己的 OpenClaw runtime（~/.agents/skills/kimi-webbridge）。
// install-skill -y 会顺手装到检测到的其它 AI runtime（Claude / Codex / Kimi CLI），
// 但那些不属于 OneClaw 必须保证的能力，所以 precheck 只看这一处。
export const KIMI_WEBBRIDGE_SKILL_PATHS: string[] = [
  path.join(home(), ".agents/skills/kimi-webbridge"),
];

export interface WebbridgePrecheckResult {
  ok: boolean;
  missing: {
    binary: boolean;
    skill: boolean;
    extension: boolean;
  };
  defaultBrowser: { id: string; name: string } | null;
  defaultUnsupported: boolean;
}

export interface WebbridgePrecheckDeps {
  binaryPath: string;
  extensionId: string;
  fileExists: (p: string) => boolean;
  readExtensionStates: (extId: string) => Promise<BrowserState[]>;
  getDefaultBrowser: () => { target: { id: string; name: string } } | null;
  /**
   * 读 openclaw.json 里 `skills.entries["kimi-webbridge"].enabled`：
   * - undefined → 视为已启用（缺省即启用）
   * - true → 已启用
   * - false → 配合 currentBrowserMode 一起判断是漂移还是正常状态
   * 不注入 → 默认 true（向后兼容旧调用方）。
   */
  readSkillEnabled?: () => boolean | undefined;
  /**
   * 用户当前实际所处的浏览器模式（来自 detectBrowserMode(config)）。
   * 用来区分 enabled=false 是"漂移"还是"当前模式的预期值"：
   *   - "webbridge" + enabled=false → 漂移（用户从 chat-ui 关掉了），算 missing.skill
   *   - 其他模式 + enabled=false   → 当前模式的预期（applyBrowserModeConfig 写的就是 false），
   *                                  切换到 webbridge 时会被翻回 true，不算 missing
   * 不注入 → 当 webbridge 处理（保留旧行为，向后兼容）。
   */
  currentBrowserMode?: "webbridge" | "openclaw" | "user";
  skillPaths?: string[];
}

export async function getWebbridgePrecheck(
  deps: WebbridgePrecheckDeps,
): Promise<WebbridgePrecheckResult> {
  const skillPaths = deps.skillPaths ?? KIMI_WEBBRIDGE_SKILL_PATHS;

  const binaryMissing = !deps.fileExists(deps.binaryPath);
  const fileMissing = !skillPaths.some((p) => deps.fileExists(p));
  // 文件在但被 disable 才算 missing 的前提：用户当前已处于 webbridge 模式
  // （否则 enabled=false 是 openclaw/chrome 模式的正常配置，模式切换会自动翻回 true）。
  const skillEnabled = deps.readSkillEnabled?.() ?? true;
  const currentMode = deps.currentBrowserMode ?? "webbridge";
  const skillDisabledDrift =
    currentMode === "webbridge" && skillEnabled === false;
  const skillMissing = fileMissing || skillDisabledDrift;

  const def = deps.getDefaultBrowser();
  const defaultUnsupported = !def;
  const defaultBrowser = def
    ? { id: def.target.id, name: def.target.name }
    : null;

  let extMissing: boolean;
  if (!deps.extensionId || defaultUnsupported) {
    extMissing = true;
  } else {
    try {
      const browsers = await deps.readExtensionStates(deps.extensionId);
      const targetState = browsers.find((b) => b.browserId === def!.target.id);
      // settings 高级页面只关心"OneClaw 这套组件是否真的坏了 / 缺了 / 被黑名单挡了"。
      // 不再判 presentInChrome：用户在 Chrome 里有没有点"启用"是用户行为，
      // 不是 OneClaw 能修的状态——左侧栏 pill 单独负责催用户去启用。
      extMissing = !(
        targetState?.installed &&
        targetState.configured &&
        !targetState.blocklisted
      );
    } catch {
      extMissing = true;
    }
  }

  return {
    ok: !binaryMissing && !skillMissing && !extMissing,
    missing: {
      binary: binaryMissing,
      skill: skillMissing,
      extension: extMissing,
    },
    defaultBrowser,
    defaultUnsupported,
  };
}
