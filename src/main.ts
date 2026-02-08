import { app, dialog, ipcMain, shell } from "electron";
import * as path from "path";
import { GatewayProcess } from "./gateway-process";
import { WindowManager } from "./window";
import { TrayManager } from "./tray";
import { SetupManager } from "./setup-manager";
import { registerSetupIpc } from "./setup-ipc";
import { setupAutoUpdater, checkForUpdates } from "./auto-updater";
import { isSetupComplete, DEFAULT_PORT } from "./constants";

// ── 单实例锁 ──

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ── 核心组件 ──

const gateway = new GatewayProcess({
  port: DEFAULT_PORT,
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

// ── Gateway 启动失败提示（避免静默失败） ──

function reportGatewayStartFailure(source: string): void {
  const logPath = path.join(app.getPath("userData"), "gateway.log");
  const title = "OneClaw Gateway 启动失败";
  const detail =
    `来源: ${source}\n` +
    `请检查托盘菜单中的 Restart Gateway，或查看日志:\n${logPath}`;
  console.error(`[main] ${title} (${source})`);
  console.error(`[main] 诊断日志: ${logPath}`);
  dialog.showErrorBox(title, detail);
}

// ── 统一启动链路：启动 Gateway → 打开主窗口 ──

async function startGatewayAndShowMain(source: string): Promise<void> {
  await gateway.start();
  if (gateway.getState() !== "running") {
    reportGatewayStartFailure(source);
  }
  await showMainWindow();
}

// ── IPC 注册 ──

ipcMain.on("gateway:restart", () => gateway.restart());
ipcMain.handle("gateway:state", () => gateway.getState());
ipcMain.on("app:check-updates", () => checkForUpdates());
ipcMain.handle("app:open-external", (_e, url: string) => shell.openExternal(url));
registerSetupIpc({ setupManager });

// ── 退出 ──

function quit(): void {
  windowManager.destroy();
  gateway.stop();
  tray.destroy();
  app.quit();
}

// ── Setup 完成后：启动 Gateway → 打开主窗口 ──

setupManager.setOnComplete(async () => {
  await startGatewayAndShowMain("setup:complete");
});

// ── 应用就绪 ──

app.whenReady().then(async () => {
  setupAutoUpdater();

  tray.create({
    windowManager,
    gateway,
    onQuit: quit,
    onCheckUpdates: checkForUpdates,
  });

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
      console.error("[main] second-instance 打开主窗口失败:", err);
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
