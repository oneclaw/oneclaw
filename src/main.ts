import * as fs from "fs";
import * as path from "path";
import { app, clipboard, dialog, ipcMain, shell, Menu, BrowserWindow } from "electron";
import { GatewayProcess } from "./gateway-process";
import { WindowManager } from "./window";
import { TrayManager } from "./tray";
import { SetupManager } from "./setup-manager";
import { registerSetupIpc } from "./setup-ipc";
import {
  approveFeishuPairingRequest,
  approveWecomPairingRequest,
  closeFeishuFirstPairingWindow,
  consumeFeishuFirstPairingWindow,
  getFeishuPairingModeState,
  getWecomPairingModeState,
  isFeishuFirstPairingWindowActive,
  listFeishuPairingRequests,
  listWecomPairingRequests,
  registerSettingsIpc,
} from "./settings-ipc";
import { registerSkillStoreIpc } from "./skill-store";
import { registerWorkspaceIpc } from "./workspace-ipc";
import { ChannelPairingMonitor } from "./channel-pairing-monitor";
import {
  setupAutoUpdater,
  checkForUpdates,
  downloadAndInstallUpdate,
  getUpdateBannerState,
  startAutoCheckSchedule,
  stopAutoCheckSchedule,
  setBeforeQuitForInstallCallback,
  setProgressCallback,
  setUpdateBannerStateCallback,
} from "./auto-updater";
import { isSetupComplete, resolveGatewayPort, resolveGatewayLogPath } from "./constants";
import { resolveGatewayAuthToken } from "./gateway-auth";
import {
  getConfigRecoveryData,
  inspectUserConfigHealth,
  recordLastKnownGoodConfigSnapshot,
  recordSetupBaselineConfigSnapshot,
  restoreLastKnownGoodConfigSnapshot,
} from "./config-backup";
import { readUserConfig, writeUserConfig } from "./provider-config";
import { resolveKimiSearchApiKey, readKimiApiKey, readKimiSearchDedicatedApiKey, writeKimiApiKey, ensureMemorySearchProxyConfig } from "./kimi-config";
import { reconcileCliOnAppLaunch } from "./cli-integration";
import { detectOwnership, migrateFromLegacy, markSetupComplete, readOneclawConfig, writeOneclawConfig } from "./oneclaw-config";
import { startTokenRefresh, stopTokenRefresh, loadOAuthToken } from "./kimi-oauth";
import { startAuthProxy, stopAuthProxy, setProxyAccessToken, setProxySearchDedicatedKey, getProxyPort } from "./kimi-auth-proxy";
import * as log from "./logger";
import * as analytics from "./analytics";

function formatConsoleLevel(level: number): string {
  const map = ["LOG", "WARNING", "ERROR", "DEBUG", "INFO", "??"];
  return map[level] ?? `LEVEL_${level}`;
}

// 过滤渲染层高频日志，避免 onEvent/request 等每秒数百次的消息阻塞主进程
function isNoisyRendererConsoleMessage(message: string): boolean {
  return message.startsWith("[gateway] request sent ") || message.startsWith("[gateway] onEvent ");
}

function attachRendererDebugHandlers(label: string, webContents: Electron.WebContents): void {
  webContents.on("console-message", (_event, level, message, lineNumber, sourceId) => {
    if (isNoisyRendererConsoleMessage(message)) {
      return;
    }
    const tag = `[renderer:${label}] console.${formatConsoleLevel(level)}`;
    if (level >= 2) {
      log.error(`${tag}: ${message} (${sourceId}:${lineNumber})`);
      return;
    }
    log.info(`${tag}: ${message} (${sourceId}:${lineNumber})`);
  });

  webContents.on("preload-error", (_event, path, error) => {
    log.error(`[renderer:${label}] preload-error: ${path} -> ${error.message || String(error)}`);
  });

  webContents.on("did-fail-load", (_event, code, description, validatedURL, isMainFrame) => {
    if (!isMainFrame) {
      return;
    }
    log.error(
      `[renderer:${label}] did-fail-load: code=${code}, description=${description}, url=${validatedURL}`,
    );
  });

  webContents.on("did-finish-load", () => {
    log.info(`[renderer:${label}] did-finish-load`);
  });

  webContents.on("dom-ready", () => {
    log.info(`[renderer:${label}] dom-ready`);
  });

  webContents.on("render-process-gone", (_event, details) => {
    log.error(
      `[renderer:${label}] render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`,
    );
  });
}

// ── 单实例锁（ONECLAW_MULTI_INSTANCE=1 时跳过，允许多 worktree 并行 dev） ──

if (!process.env.ONECLAW_MULTI_INSTANCE && !app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── 全局错误兜底 ──

process.on("uncaughtException", (err) => {
  log.error(`uncaughtException: ${err.stack || err.message}`);
});
process.on("unhandledRejection", (reason) => {
  log.error(`unhandledRejection: ${reason}`);
});

// ── 核心组件 ──

let pairingMonitor: ChannelPairingMonitor | null = null;
const gateway = new GatewayProcess({
  port: resolveGatewayPort(),
  token: resolveGatewayAuthToken({ persist: false }),
  onStateChange: (state) => {
    tray.updateMenu();
    pairingMonitor?.triggerNow();
    // gateway 就绪后立即通知 Chat UI 重连，避免盲等指数退避
    if (state === "running") {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w.isDestroyed()) w.webContents.send("gateway:ready");
      }
    }
  },
});
const windowManager = new WindowManager();
const tray = new TrayManager();
const setupManager = new SetupManager();

// 应用前台判定：任一窗口拿到系统焦点即视为前台；否则视为后台。
function isAppInForeground(): boolean {
  return BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isFocused(),
  );
}

pairingMonitor = new ChannelPairingMonitor({
  gateway,
  isAppInForeground,
  adapters: [
    {
      channel: "feishu",
      getModeState: () => getFeishuPairingModeState(),
      listRequests: () => listFeishuPairingRequests(),
      approveRequest: (params) => approveFeishuPairingRequest(params),
      autoApproveFirst: {
        isActive: () => isFeishuFirstPairingWindowActive(),
        consume: (userId) => consumeFeishuFirstPairingWindow(userId),
        reset: () => closeFeishuFirstPairingWindow(),
      },
      onInactive: () => closeFeishuFirstPairingWindow(),
    },
    {
      channel: "wecom",
      getModeState: () => getWecomPairingModeState(),
      listRequests: () => listWecomPairingRequests(),
      approveRequest: (params) => approveWecomPairingRequest(params),
    },
  ],
  onStateChange: (state) => {
    windowManager.pushPairingState(state);
  },
});

// ── 显示主窗口的统一入口 ──

function showMainWindow(): Promise<void> {
  return windowManager.show({
    port: gateway.getPort(),
    token: gateway.getToken(),
  });
}

function openSettingsInMainWindow(): Promise<void> {
  if (setupManager.isSetupOpen()) {
    setupManager.focusSetup();
    return Promise.resolve();
  }
  return windowManager.openSettings({
    port: gateway.getPort(),
    token: gateway.getToken(),
  });
}

function openRecoverySettings(notice: string): void {
  openSettingsInMainWindow().catch((err) => {
    log.error(`恢复流程打开设置失败(${notice}): ${err}`);
  });
}

// ── Gateway 启动失败提示（避免静默失败） ──

type RecoveryAction = "open-settings" | "restore-last-known-good" | "dismiss";

// 统一弹出配置恢复提示，避免用户在配置损坏时无从下手。
function promptConfigRecovery(opts: {
  title: string;
  message: string;
  detail: string;
}): RecoveryAction {
  const locale = app.getLocale();
  const isZh = locale.startsWith("zh");
  const { hasLastKnownGood } = getConfigRecoveryData();

  const buttons = hasLastKnownGood
    ? [
        isZh ? "一键回退上次可用配置" : "Restore last known good",
        isZh ? "打开设置恢复" : "Open Settings",
        isZh ? "稍后处理" : "Later",
      ]
    : [isZh ? "打开设置恢复" : "Open Settings", isZh ? "稍后处理" : "Later"];

  const index = dialog.showMessageBoxSync({
    type: "error",
    title: opts.title,
    message: opts.message,
    detail: opts.detail,
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true,
  });

  if (hasLastKnownGood) {
    if (index === 0) return "restore-last-known-good";
    if (index === 1) return "open-settings";
    return "dismiss";
  }
  if (index === 0) return "open-settings";
  return "dismiss";
}

// Gateway 启动失败时提示用户进入备份恢复，避免反复重启无效。
function reportGatewayStartFailure(source: string): RecoveryAction {
  const logPath = resolveGatewayLogPath();
  const title = "OneClaw Gateway 启动失败";
  const detail =
    `来源: ${source}\n` +
    `建议先前往设置 → 备份与恢复，回退到最近可用配置。\n` +
    `诊断日志:\n${logPath}`;
  log.error(`${title} (${source})`);
  log.error(`诊断日志: ${logPath}`);
  return promptConfigRecovery({
    title,
    message: "Gateway 未能成功启动，可能是配置错误导致。",
    detail,
  });
}

// 配置 JSON 结构损坏时，直接给出恢复入口，避免误导用户重新 Setup。
function reportConfigInvalidFailure(parseError?: string): RecoveryAction {
  const recovery = getConfigRecoveryData();
  const detail =
    `配置文件: ${recovery.configPath}\n` +
    `解析错误: ${parseError ?? "unknown"}\n` +
    `建议前往设置 → 备份与恢复，回退到可用版本。`;

  log.error(`配置文件损坏，JSON 解析失败: ${parseError ?? "unknown"}`);
  return promptConfigRecovery({
    title: "OneClaw 配置文件损坏",
    message: "检测到 openclaw.json 不是有效 JSON，Gateway 无法启动。",
    detail,
  });
}

// ── 统一启动链路：启动 Gateway → 打开主窗口 ──

interface StartMainOptions {
  openOnFailure?: boolean;
  reportFailure?: boolean;
}

const MAX_GATEWAY_START_ATTEMPTS = 3;

// 存量用户迁移：首次升级时默认开启 session-memory hook（幂等，只在 hooks.internal 未配置时写入）
function migrateSessionMemoryHook(): void {
  try {
    const config = readUserConfig();
    if (config.hooks?.internal) return;
    config.hooks ??= {};
    config.hooks.internal = {
      enabled: true,
      entries: { "session-memory": { enabled: true } },
    };
    writeUserConfig(config);
    log.info("[migrate] 已为存量用户默认开启 session-memory hook");
  } catch {
    // 迁移失败不阻塞启动
  }
}

// 禁止 openclaw gateway 自行检查 npm 更新（OneClaw 整包打包，用户无法独立更新 gateway）
function migrateDisableGatewayUpdateCheck(): void {
  try {
    const config = readUserConfig();
    if (config.update?.checkOnStart === false) return;
    config.update ??= {};
    config.update.checkOnStart = false;
    writeUserConfig(config);
    log.info("[migrate] 已禁用 gateway 启动更新检查（update.checkOnStart=false）");
  } catch {
    // 迁移失败不阻塞启动
  }
}

// 从配置同步 search API key 到 gateway 环境变量
// 代理模式下实际请求走代理注入 token，但插件初始化仍需 env var 存在
function syncKimiSearchEnv(): void {
  try {
    const config = readUserConfig();
    const key = resolveKimiSearchApiKey(config);
    if (key) {
      gateway.setExtraEnv({ KIMI_PLUGIN_API_KEY: key });
    } else if (getProxyPort() > 0) {
      // 代理模式：插件初始化需要 env var 存在，设占位符让插件通过检查
      // 实际请求走 proxy baseUrl，由代理注入真实 token
      gateway.setExtraEnv({ KIMI_PLUGIN_API_KEY: "proxy-managed" });
    }
  } catch {
    // 配置读取失败不阻塞启动
  }
}

// 启动 Gateway（最多尝试 3 次，覆盖 Windows 冷启动慢导致的前两次超时）
async function ensureGatewayRunning(source: string): Promise<boolean> {
  // 启动前从配置同步 token，避免 Setup 后仍使用旧内存 token。
  gateway.setToken(resolveGatewayAuthToken());
  syncKimiSearchEnv();

  for (let attempt = 1; attempt <= MAX_GATEWAY_START_ATTEMPTS; attempt++) {
    if (attempt === 1) {
      await gateway.start();
    } else {
      log.warn(`Gateway 启动重试 ${attempt}/${MAX_GATEWAY_START_ATTEMPTS}: ${source}`);
      await gateway.restart();
    }

    if (gateway.getState() === "running") {
      // 仅在真正启动成功后刷新“最近可用快照”，保证一键回退目标可启动。
      recordLastKnownGoodConfigSnapshot();
      log.info(`Gateway 启动成功（第 ${attempt} 次尝试）: ${source}`);
      return true;
    }
  }

  return false;
}

// 外部 OpenClaw 接管：进 Setup 向导，Step 0 展示冲突并让用户决定
async function handleExternalOpenclawTakeover(): Promise<void> {
  log.info("[startup] external OpenClaw detected, launching setup with conflict check");
  setupManager.showSetup();
}

async function startGatewayAndShowMain(source: string, opts: StartMainOptions = {}): Promise<boolean> {
  const openOnFailure = opts.openOnFailure ?? true;
  const reportFailure = opts.reportFailure ?? true;

  log.info(`启动链路开始: ${source}`);
  await ensureAuthProxy();

  // OAuth token 后台刷新（仅 OAuth 用户需要）
  if (loadOAuthToken()) {
    ensureOAuthTokenRefresh();
  }

  const running = await ensureGatewayRunning(source);
  if (!running) {
    if (reportFailure) {
      const action = reportGatewayStartFailure(source);
      if (action === "open-settings") {
        openRecoverySettings("gateway-start-failed");
      } else if (action === "restore-last-known-good") {
        try {
          restoreLastKnownGoodConfigSnapshot();
          const recovered = await ensureGatewayRunning("recovery:last-known-good");
          if (recovered) {
            await showMainWindow();
            return true;
          }
          openRecoverySettings("gateway-recovery-failed");
        } catch (err: any) {
          log.error(`回退 last-known-good 失败: ${err?.message ?? err}`);
          openRecoverySettings("gateway-recovery-exception");
        }
      }
    } else {
      log.error(`Gateway 启动失败（静默模式）: ${source}`);
    }
    if (!openOnFailure) return false;
  }
  await showMainWindow();
  return running;
}

// 手动控制 Gateway：统一入口，确保启动前同步最新 token。
function requestGatewayStart(source: string): void {
  gateway.setToken(resolveGatewayAuthToken());
  syncKimiSearchEnv();
  gateway.start().catch((err) => {
    log.error(`Gateway 启动失败(${source}): ${err}`);
  });
}

// 重启 debounce：多次快速调用只执行最后一次，避免连环重启
let restartTimer: ReturnType<typeof setTimeout> | null = null;
function requestGatewayRestart(source: string): void {
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    gateway.setToken(resolveGatewayAuthToken());
    syncKimiSearchEnv();
    gateway.restart().catch((err) => {
      log.error(`Gateway 重启失败(${source}): ${err}`);
    });
  }, 800);
}

// 解析当前最优 token：OAuth > 手动 key
function resolveCurrentToken(): string {
  const oauthToken = loadOAuthToken();
  if (oauthToken?.access_token) return oauthToken.access_token;
  return readKimiApiKey();
}

// 从 config baseUrl 解析历史代理端口（避免不必要的 config 写入）
function parseProxyPortFromConfig(): number {
  try {
    const config = readUserConfig();
    const baseUrl = config?.models?.providers?.["kimi-coding"]?.baseUrl;
    if (typeof baseUrl === "string" && baseUrl.includes("127.0.0.1")) {
      const m = baseUrl.match(/:(\d+)\//);
      if (m) return Number.parseInt(m[1], 10);
    }
  } catch {}
  return 0;
}

// 确保 config 中 kimi-coding 指向代理（仅端口变化时写入）
function ensureProxyConfig(proxyPort: number): void {
  try {
    const config = readUserConfig();
    const provider = config?.models?.providers?.["kimi-coding"];
    if (!provider) return;

    const expectedBase = `http://127.0.0.1:${proxyPort}/coding`;
    // memorySearch embedding 也走同一个代理
    const memorySearchChanged = ensureMemorySearchProxyConfig(config, proxyPort);

    if (provider.baseUrl === expectedBase && provider.apiKey === "proxy-managed" && !memorySearchChanged) return;

    // 首次迁移：真实 apiKey 存入 sidecar（非 OAuth 用户 + 有效 key）
    if (provider.apiKey && provider.apiKey !== "proxy-managed" && !loadOAuthToken()) {
      writeKimiApiKey(provider.apiKey);
    }

    provider.baseUrl = expectedBase;
    provider.apiKey = "proxy-managed";

    // 同步 kimi-search 插件端点到代理（默认端点在 /coding/v1/ 路径下）
    const searchEntry = config?.plugins?.entries?.["kimi-search"];
    if (searchEntry && typeof searchEntry === "object") {
      searchEntry.config ??= {};
      searchEntry.config.search = { baseUrl: `http://127.0.0.1:${proxyPort}/coding/v1/search` };
      searchEntry.config.fetch = { baseUrl: `http://127.0.0.1:${proxyPort}/coding/v1/fetch` };
    }

    writeUserConfig(config);
    log.info(`[auth-proxy] config updated: baseUrl → 127.0.0.1:${proxyPort}`);
  } catch (err: any) {
    log.error(`[auth-proxy] ensureProxyConfig failed: ${err.message}`);
  }
}

// 启动 Auth Proxy 并同步 config（gateway 启动前调用）
async function ensureAuthProxy(): Promise<void> {
  try {
    const config = readUserConfig();
    // 只有配置了 kimi-coding provider 才启动代理
    if (!config?.models?.providers?.["kimi-coding"]) return;

    // 设置 token
    const token = resolveCurrentToken();
    setProxyAccessToken(token);

    // 设置 Kimi Search 专属 key
    const searchKey = readKimiSearchDedicatedApiKey();
    if (searchKey) setProxySearchDedicatedKey(searchKey);

    // 启动代理（优先历史端口）
    const preferredPort = parseProxyPortFromConfig();
    const actualPort = await startAuthProxy(preferredPort > 0 ? preferredPort : undefined);

    // 同步 config（仅端口变化时写入）
    ensureProxyConfig(actualPort);
  } catch (err: any) {
    log.error(`[auth-proxy] ensureAuthProxy failed: ${err.message}`);
  }
}

// 启动 OAuth token 定时刷新（幂等：内部先 stop 再 start）
function ensureOAuthTokenRefresh(): void {
  startTokenRefresh((refreshedToken) => {
    // 直接更新代理内存中的 token，不再写 config
    setProxyAccessToken(refreshedToken.access_token);
  });
}

function requestGatewayStop(source: string): void {
  gateway.stop().catch((err) => {
    log.error(`Gateway 停止失败(${source}): ${err}`);
  });
}

// ── IPC 注册 ──

ipcMain.on("gateway:restart", () => requestGatewayRestart("ipc:restart"));
ipcMain.on("gateway:start", () => requestGatewayStart("ipc:start"));
ipcMain.on("gateway:stop", () => requestGatewayStop("ipc:stop"));
ipcMain.handle("gateway:state", () => gateway.getState());
ipcMain.on("app:check-updates", () => checkForUpdates(true));
ipcMain.handle("app:get-update-state", () => getUpdateBannerState());
ipcMain.handle("app:download-and-install-update", () => downloadAndInstallUpdate());
ipcMain.handle("app:get-pairing-state", () => pairingMonitor?.getState());
ipcMain.on("app:refresh-pairing-state", () => pairingMonitor?.triggerNow());
ipcMain.handle("app:get-feishu-pairing-state", () => pairingMonitor?.getState().channels.feishu);
ipcMain.on("app:refresh-feishu-pairing-state", () => pairingMonitor?.triggerNow());
ipcMain.handle("app:open-external", (_e, url: string) => shell.openExternal(url));
ipcMain.handle("app:open-path", (_e, filePath: string) => shell.openPath(filePath));

// 文件选择对话框 — 返回文件绝对路径数组
ipcMain.handle("dialog:select-files", async (_e, options?: { filters?: Electron.FileFilter[] }) => {
  const win = BrowserWindow.getFocusedWindow();
  const result = await dialog.showOpenDialog(win ?? {
    // fallback: 无聚焦窗口时仍可弹出
  } as any, {
    properties: ["openFile", "multiSelections"],
    filters: options?.filters,
  });
  if (result.canceled) {
    return [];
  }
  return result.filePaths;
});

// 读取剪贴板中的文件路径（macOS: NSFilenamesPboardType, Windows: CF_HDROP）
ipcMain.handle("clipboard:read-file-paths", () => {
  try {
    if (process.platform === "darwin") {
      // macOS 剪贴板文件列表是 XML plist 格式
      const buf = clipboard.readBuffer("NSFilenamesPboardType");
      if (!buf?.length) return [];
      const xml = buf.toString("utf-8");
      const paths: string[] = [];
      // 简单解析 <string>...</string> 标签提取路径
      const re = /<string>(.*?)<\/string>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(xml)) !== null) {
        if (m[1] && !m[1].includes("<")) paths.push(m[1]);
      }
      return paths;
    }
    if (process.platform === "win32") {
      const buf = clipboard.readBuffer("FileNameW");
      if (!buf?.length) return [];
      // Windows FileNameW 是 UTF-16LE 以 null 结尾的路径
      const raw = buf.toString("utf16le").replace(/\0+$/, "");
      return raw ? [raw] : [];
    }
    return [];
  } catch {
    return [];
  }
});

// ── Release Notes：读取打包的 changelog 并按版本过滤 ──

// 版本号数值化比较（YYYY.MMDD.N 格式不适合字符串比较）
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((s) => parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

ipcMain.handle("app:get-release-notes", () => {
  try {
    const notesPath = path.join(app.getAppPath(), "release-notes.json");
    const raw = fs.readFileSync(notesPath, "utf-8");
    const allEntries: Array<{ version: string; notes: { zh?: string; en?: string } }> = JSON.parse(raw);
    if (!Array.isArray(allEntries)) return null;

    const currentVersion = app.getVersion();
    const config = readOneclawConfig();
    const lastShown = config?.lastShownReleaseNotesVersion;

    // 首次安装不弹更新日志，静默标记当前版本
    if (!lastShown) {
      if (config) {
        config.lastShownReleaseNotesVersion = currentVersion;
        writeOneclawConfig(config);
      }
      return { currentVersion, entries: [], locale: app.getLocale() };
    }

    // 过滤出 lastShown < version <= currentVersion 的条目
    const entries = allEntries.filter((entry) => {
      if (!entry?.version) return false;
      if (lastShown && compareVersions(entry.version, lastShown) <= 0) return false;
      if (compareVersions(entry.version, currentVersion) > 0) return false;
      return true;
    });

    // 按版本降序排列（最新在前）
    entries.sort((a, b) => compareVersions(b.version, a.version));

    return {
      currentVersion,
      entries,
      locale: app.getLocale(),
    };
  } catch (err: any) {
    log.error(`读取 release-notes.json 失败: ${err?.message ?? err}`);
    return null;
  }
});

ipcMain.handle("app:dismiss-release-notes", (_e, version: string) => {
  // 参数校验：version 必须是非空字符串
  if (typeof version !== "string" || !version.trim()) return;
  try {
    // 配置不存在时直接跳过，避免用空对象覆盖已有字段
    const config = readOneclawConfig();
    if (!config) return;
    config.lastShownReleaseNotesVersion = version;
    writeOneclawConfig(config);
  } catch (err: any) {
    log.error(`写入 lastShownReleaseNotesVersion 失败: ${err?.message ?? err}`);
  }
});

// Chat UI 侧边栏 IPC
ipcMain.on("app:open-settings", () => {
  openSettingsInMainWindow().catch((err) => {
    log.error(`app:open-settings 打开主窗口设置失败: ${err}`);
  });
});
ipcMain.on("app:open-webui", () => {
  const port = gateway.getPort();
  const token = gateway.getToken().trim();
  // UI 端只从 URL fragment (#token=) 读取 token，不从 query param (?token=) 读取
  const fragment = token ? `#token=${encodeURIComponent(token)}` : "";
  shell.openExternal(`http://127.0.0.1:${port}/${fragment}`);
});
ipcMain.handle("gateway:port", () => gateway.getPort());

registerSetupIpc({ setupManager, gateway, onOAuthLoginSuccess: ensureOAuthTokenRefresh });
registerSettingsIpc({
  requestGatewayRestart: () => requestGatewayRestart("settings:kimi-search"),
});
registerSkillStoreIpc();
registerWorkspaceIpc();

// ── 退出 ──

async function quit(): Promise<void> {
  stopTokenRefresh();
  await stopAuthProxy();
  stopAutoCheckSchedule();
  pairingMonitor?.stop();
  analytics.track("app_closed");
  await analytics.shutdown();
  windowManager.destroy();
  await gateway.stop();
  tray.destroy();
  app.quit();
}

// ── Setup 完成后：启动 Gateway → 打开主窗口 ──

setupManager.setOnComplete(async () => {
  const running = await ensureGatewayRunning("setup:complete");
  if (!running) {
    return false;
  }

  try {
    // gateway schema 兼容：保留 wizard.lastRunAt
    const config = readUserConfig();
    config.wizard ??= {};
    config.wizard.lastRunAt = new Date().toISOString();
    delete config.wizard.pendingAt;
    writeUserConfig(config);

    // 写入 oneclaw.config.json 归属标记
    markSetupComplete();
  } catch (err: any) {
    log.error(`写入 setup 完成标记失败: ${err?.message ?? err}`);
    return false;
  }

  await showMainWindow();
  recordSetupBaselineConfigSnapshot();
  return true;
});

// ── macOS Dock 可见性：窗口全隐藏时切换纯托盘模式 ──

function updateDockVisibility(): void {
  if (process.platform !== "darwin" || !app.dock) return;
  const anyVisible = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isVisible(),
  );
  if (anyVisible) {
    app.dock.show();
  } else {
    app.dock.hide();
  }
}

let hasAppFocus = false;

// 仅在“失焦 -> 聚焦”状态跃迁时上报一次，避免窗口切换导致重复埋点。
function syncAppFocusState(trigger: string): void {
  const focused = BrowserWindow.getAllWindows().some(
    (w) => !w.isDestroyed() && w.isFocused(),
  );
  if (focused === hasAppFocus) {
    return;
  }
  hasAppFocus = focused;
  if (focused) {
    analytics.track("app_focused", { trigger });
  }
}

// ── 应用就绪 ──

app.whenReady().then(async () => {
  log.info("app ready");

  // 所有窗口的 show/hide/closed 事件统一驱动 Dock 可见性
  app.on("browser-window-created", (_e, win) => {
    win.on("show", updateDockVisibility);
    win.on("hide", updateDockVisibility);
    win.on("closed", updateDockVisibility);
  });
  app.on("browser-window-focus", () => {
    syncAppFocusState("browser-window-focus");
  });
  app.on("browser-window-blur", () => {
    // blur 与 focus 可能连续触发，延迟到当前事件循环末尾再判定全局焦点。
    setTimeout(() => syncAppFocusState("browser-window-blur"), 0);
  });
  // macOS: 最小化应用菜单，保留 Cmd+, 打开设置
  // Windows: 隐藏菜单栏，避免标题栏下方出现菜单条
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {
        label: app.name,
        submenu: [
          { role: "about" },
          { type: "separator" },
          {
            label: "Settings…",
            accelerator: "CommandOrControl+,",
            click: () => {
              openSettingsInMainWindow().catch((err) => {
                log.error(`Cmd+, 打开主窗口设置失败: ${err}`);
              });
            },
          },
          { type: "separator" },
          { role: "services" },
          { type: "separator" },
          { role: "hide" },
          { role: "hideOthers" },
          { role: "unhide" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      { role: "fileMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]));
  } else {
    Menu.setApplicationMenu(null);
  }
  analytics.init();
  analytics.track("app_launched");
  setupAutoUpdater();
  // 自动更新状态变化后推送给当前主窗口，驱动侧栏“重启更新”按钮。
  setUpdateBannerStateCallback((state) => {
    windowManager.pushUpdateBannerState(state);
  });
  startAutoCheckSchedule();

  // 更新安装前先放行窗口关闭，避免托盘“隐藏而不退出”拦截 quitAndInstall。
  setBeforeQuitForInstallCallback(() => {
    stopAutoCheckSchedule();
    windowManager.prepareForAppQuit();
  });

  // 下载进度 → 更新托盘 tooltip
  setProgressCallback((pct) => {
    tray.setTooltip(pct != null ? `OneClaw — 下载更新 ${pct.toFixed(0)}%` : "OneClaw");
  });

  tray.create({
    windowManager,
    gateway,
    onRestartGateway: () => requestGatewayRestart("tray:restart"),
    onStartGateway: () => requestGatewayStart("tray:start"),
    onStopGateway: () => requestGatewayStop("tray:stop"),
    onOpenSettings: () => {
      openSettingsInMainWindow().catch((err) => {
        log.error(`托盘设置打开失败: ${err}`);
      });
    },
    onQuit: quit,
    onCheckUpdates: () => checkForUpdates(true),
  });
  pairingMonitor?.start();

  const configHealth = inspectUserConfigHealth();
  if (configHealth.exists && !configHealth.validJson) {
    const action = reportConfigInvalidFailure(configHealth.parseError);
    if (action === "restore-last-known-good") {
      try {
        restoreLastKnownGoodConfigSnapshot();
        await startGatewayAndShowMain("startup:restore-last-known-good");
        return;
      } catch (err: any) {
        log.error(`启动前恢复 last-known-good 失败: ${err?.message ?? err}`);
        openRecoverySettings("gateway-recovery-failed");
        return;
      }
    }
    if (action === "open-settings") {
      openRecoverySettings("config-invalid-json");
      return;
    }
    return;
  }

  // 四态归属判定
  const ownership = detectOwnership();
  log.info(`[startup] config ownership: ${ownership}`);

  switch (ownership) {
    case "oneclaw":
      // 状态 1：正常启动
      migrateSessionMemoryHook();
      migrateDisableGatewayUpdateCheck();
      void reconcileCliOnAppLaunch().catch((err) => {
        log.error(`[migrate] CLI launch reconciliation failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      await startGatewayAndShowMain("app:startup");
      break;

    case "legacy-oneclaw":
      // 状态 2：老 OneClaw 用户升级 → 自动迁移
      log.info("[startup] legacy OneClaw detected, migrating...");
      migrateFromLegacy();
      migrateSessionMemoryHook();
      migrateDisableGatewayUpdateCheck();
      void reconcileCliOnAppLaunch().catch((err) => {
        log.error(`[migrate] CLI launch reconciliation failed: ${err instanceof Error ? err.message : String(err)}`);
      });
      await startGatewayAndShowMain("app:startup:legacy-migrate");
      break;

    case "external-openclaw":
      // 状态 3：外部 OpenClaw → 接管流程
      log.info("[startup] external OpenClaw config detected, starting takeover...");
      await handleExternalOpenclawTakeover();
      break;

    case "fresh":
      // 状态 4：全新安装
      setupManager.showSetup();
      break;
  }
});

// ── 二次启动 → 聚焦已有窗口 ──

app.on("second-instance", () => {
  if (setupManager.isSetupOpen()) {
    setupManager.focusSetup();
  } else {
    showMainWindow().catch((err) => {
      log.error(`second-instance 打开主窗口失败: ${err}`);
    });
  }
});

app.on("web-contents-created", (_event, webContents) => {
  if (webContents.getType() !== "window") {
    return;
  }
  attachRendererDebugHandlers(`id=${webContents.id}`, webContents);
});

// ── macOS: 点击 Dock 图标时恢复窗口 ──

app.on("activate", () => {
  if (setupManager.isSetupOpen()) {
    setupManager.focusSetup();
  } else {
    showMainWindow().catch((err) => {
      log.error(`activate 打开主窗口失败: ${err}`);
    });
  }
});

// ── 托盘应用：所有窗口关闭不退出 ──

app.on("window-all-closed", () => {
  // 不退出 — 后台保持运行
});

// ── 退出前清理 ──

app.on("before-quit", () => {
  // 先放行窗口关闭，避免 close handler 拦截 WM_CLOSE 导致 NSIS 安装器报"无法关闭"
  windowManager.prepareForAppQuit();
  pairingMonitor?.stop();
  windowManager.destroy();
  stopAuthProxy();
  gateway.stop().catch(() => {});
});
