import { app, dialog, ipcMain, shell, Menu, BrowserWindow } from "electron";
import { GatewayProcess } from "./gateway-process";
import { WindowManager } from "./window";
import { TrayManager } from "./tray";
import { SetupManager } from "./setup-manager";
import { registerSetupIpc } from "./setup-ipc";
import { registerSettingsIpc } from "./settings-ipc";
import {
  setupAutoUpdater,
  checkForUpdates,
  startAutoCheckSchedule,
  stopAutoCheckSchedule,
  setBeforeQuitForInstallCallback,
  setProgressCallback,
} from "./auto-updater";
import { isSetupComplete, DEFAULT_PORT, resolveGatewayLogPath } from "./constants";
import { resolveGatewayAuthToken } from "./gateway-auth";
import {
  getConfigRecoveryData,
  inspectUserConfigHealth,
  recordLastKnownGoodConfigSnapshot,
  recordSetupBaselineConfigSnapshot,
  restoreLastKnownGoodConfigSnapshot,
} from "./config-backup";
import * as log from "./logger";
import * as analytics from "./analytics";

function formatConsoleLevel(level: number): string {
  const map = ["LOG", "WARNING", "ERROR", "DEBUG", "INFO", "??"];
  return map[level] ?? `LEVEL_${level}`;
}

// 过滤渲染层高频请求日志，避免 node.list 等轮询刷屏污染主日志。
function isNoisyRendererConsoleMessage(message: string): boolean {
  return message.startsWith("[gateway] request sent ");
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

// ── 单实例锁 ──

if (!app.requestSingleInstanceLock()) {
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

const gateway = new GatewayProcess({
  port: DEFAULT_PORT,
  token: resolveGatewayAuthToken({ persist: false }),
  onStateChange: () => tray.updateMenu(),
});
const windowManager = new WindowManager();
const tray = new TrayManager();
const setupManager = new SetupManager();

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

// 启动 Gateway（最多尝试 3 次，覆盖 Windows 冷启动慢导致的前两次超时）
async function ensureGatewayRunning(source: string): Promise<boolean> {
  // 启动前从配置同步 token，避免 Setup 后仍使用旧内存 token。
  gateway.setToken(resolveGatewayAuthToken());

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

async function startGatewayAndShowMain(source: string, opts: StartMainOptions = {}): Promise<boolean> {
  const openOnFailure = opts.openOnFailure ?? true;
  const reportFailure = opts.reportFailure ?? true;

  log.info(`启动链路开始: ${source}`);
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
  gateway.start().catch((err) => {
    log.error(`Gateway 启动失败(${source}): ${err}`);
  });
}

function requestGatewayRestart(source: string): void {
  gateway.setToken(resolveGatewayAuthToken());
  gateway.restart().catch((err) => {
    log.error(`Gateway 重启失败(${source}): ${err}`);
  });
}

function requestGatewayStop(source: string): void {
  try {
    gateway.stop();
  } catch (err) {
    log.error(`Gateway 停止失败(${source}): ${err}`);
  }
}

// ── IPC 注册 ──

ipcMain.on("gateway:restart", () => requestGatewayRestart("ipc:restart"));
ipcMain.on("gateway:start", () => requestGatewayStart("ipc:start"));
ipcMain.on("gateway:stop", () => requestGatewayStop("ipc:stop"));
ipcMain.handle("gateway:state", () => gateway.getState());
ipcMain.on("app:check-updates", () => checkForUpdates(true));
ipcMain.handle("app:open-external", (_e, url: string) => shell.openExternal(url));

// Chat UI 侧边栏 IPC
ipcMain.on("app:open-settings", () => {
  openSettingsInMainWindow().catch((err) => {
    log.error(`app:open-settings 打开主窗口设置失败: ${err}`);
  });
});
ipcMain.on("app:open-webui", () => {
  const port = gateway.getPort();
  const token = gateway.getToken().trim();
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  shell.openExternal(`http://127.0.0.1:${port}/${query}`);
});
ipcMain.handle("gateway:port", () => gateway.getPort());

registerSetupIpc({ setupManager });
registerSettingsIpc();

// ── 退出 ──

async function quit(): Promise<void> {
  stopAutoCheckSchedule();
  analytics.track("app_closed");
  await analytics.shutdown();
  windowManager.destroy();
  gateway.stop();
  tray.destroy();
  app.quit();
}

// ── Setup 完成后：启动 Gateway → 打开主窗口 ──

setupManager.setOnComplete(async () => {
  const ok = await startGatewayAndShowMain("setup:complete", {
    openOnFailure: false,
    reportFailure: false,
  });
  if (ok) {
    recordSetupBaselineConfigSnapshot();
  }
  return ok;
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

// ── 应用就绪 ──

app.whenReady().then(async () => {
  log.info("app ready");

  // 所有窗口的 show/hide/closed 事件统一驱动 Dock 可见性
  app.on("browser-window-created", (_e, win) => {
    win.on("show", updateDockVisibility);
    win.on("hide", updateDockVisibility);
    win.on("closed", updateDockVisibility);
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

  if (!isSetupComplete()) {
    // 无配置 → 先走 Setup，Gateway 在 Setup 完成回调里启动
    setupManager.showSetup();
  } else {
    await startGatewayAndShowMain("app:startup");
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
  windowManager.destroy();
  gateway.stop();
});
