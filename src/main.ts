import { app, dialog, ipcMain, shell, Menu } from "electron";
import { GatewayProcess } from "./gateway-process";
import { GatewayUpdater } from "./gateway-updater";
import { WindowManager } from "./window";
import { TrayManager } from "./tray";
import { SetupManager } from "./setup-manager";
import { registerSetupIpc } from "./setup-ipc";
import { setupAutoUpdater, checkForUpdates } from "./auto-updater";
import { isSetupComplete, DEFAULT_PORT, resolveGatewayLogPath } from "./constants";
import { resolveGatewayAuthToken } from "./gateway-auth";
import * as log from "./logger";
import * as analytics from "./analytics";

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

// 内核自动更新器（Gateway 启动成功后初始化）
const gatewayUpdater = new GatewayUpdater({
  gateway,
  onStateChange: () => tray.updateMenu(),
});

// ── 显示主窗口的统一入口 ──

function showMainWindow(): Promise<void> {
  return windowManager.show({
    port: gateway.getPort(),
    token: gateway.getToken(),
  });
}

// ── Gateway 启动失败提示（避免静默失败） ──

function reportGatewayStartFailure(source: string): void {
  const logPath = resolveGatewayLogPath();
  const title = "OneClaw Gateway 启动失败";
  const detail =
    `来源: ${source}\n` +
    `请检查托盘菜单中的 Restart Gateway，或查看日志:\n${logPath}`;
  log.error(`${title} (${source})`);
  log.error(`诊断日志: ${logPath}`);
  dialog.showErrorBox(title, detail);
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
      reportGatewayStartFailure(source);
    } else {
      log.error(`Gateway 启动失败（静默模式）: ${source}`);
    }
    if (!openOnFailure) return false;
  }
  await showMainWindow();
  return running;
}

// ── IPC 注册 ──

ipcMain.on("gateway:restart", () => gateway.restart());
ipcMain.handle("gateway:state", () => gateway.getState());
ipcMain.on("app:check-updates", () => checkForUpdates());
ipcMain.on("gateway:check-update", () => gatewayUpdater.checkAndUpdate());
ipcMain.handle("app:open-external", (_e, url: string) => shell.openExternal(url));
registerSetupIpc({ setupManager });

// ── 退出 ──

async function quit(): Promise<void> {
  analytics.track("app_closed");
  await analytics.shutdown();
  gatewayUpdater.stop();
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
  // Setup 完成且 Gateway 启动成功后，启动内核自动更新调度
  if (ok) {
    gatewayUpdater.start();
  }
  return ok;
});

// ── 应用就绪 ──

app.whenReady().then(async () => {
  log.info("app ready");
  // 全局禁用 Electron 默认菜单（File/Edit/View...）
  Menu.setApplicationMenu(null);
  analytics.init();
  analytics.track("app_launched");
  setupAutoUpdater();

  tray.create({
    windowManager,
    gateway,
    gatewayUpdater,
    onQuit: quit,
    onCheckUpdates: checkForUpdates,
  });

  if (!isSetupComplete()) {
    // 无配置 → 先走 Setup，Gateway 在 Setup 完成回调里启动
    setupManager.showSetup();
  } else {
    const running = await startGatewayAndShowMain("app:startup");
    // Gateway 启动成功后启动内核自动更新调度
    if (running) {
      gatewayUpdater.start();
    }
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

// ── 托盘应用：所有窗口关闭不退出 ──

app.on("window-all-closed", () => {
  // 不退出 — 后台保持运行
});

// ── 退出前清理 ──

app.on("before-quit", () => {
  gatewayUpdater.stop();
  windowManager.destroy();
  gateway.stop();
});
