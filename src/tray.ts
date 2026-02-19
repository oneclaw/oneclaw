import { Tray, Menu, app, nativeImage } from "electron";
import * as path from "path";
import { GatewayProcess, GatewayState } from "./gateway-process";
import { WindowManager } from "./window";

interface TrayOptions {
  windowManager: WindowManager;
  gateway: GatewayProcess;
  onRestartGateway: () => void;
  onStartGateway: () => void;
  onStopGateway: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
  onCheckUpdates: () => void;
}

// 托盘菜单国际化
type TrayStrings = {
  stateRunning: string;
  stateStarting: string;
  stateStopping: string;
  stateStopped: string;
  openDashboard: string;
  restartGateway: string;
  startGateway: string;
  stopGateway: string;
  settings: string;
  checkUpdates: string;
  quit: string;
};

const I18N: Record<string, TrayStrings> = {
  en: {
    stateRunning: "Gateway: Running",
    stateStarting: "Gateway: Starting…",
    stateStopping: "Gateway: Stopping…",
    stateStopped: "Gateway: Stopped",
    openDashboard: "Open Dashboard",
    restartGateway: "Restart Gateway",
    startGateway: "Start Gateway",
    stopGateway: "Stop Gateway",
    settings: "Settings",
    checkUpdates: "Check for Updates",
    quit: "Quit OneClaw",
  },
  zh: {
    stateRunning: "Gateway: 运行中",
    stateStarting: "Gateway: 启动中…",
    stateStopping: "Gateway: 停止中…",
    stateStopped: "Gateway: 已停止",
    openDashboard: "打开 OneClaw",
    restartGateway: "重启 Gateway",
    startGateway: "启动 Gateway",
    stopGateway: "停止 Gateway",
    settings: "设置",
    checkUpdates: "检查更新",
    quit: "退出 OneClaw",
  },
};

// 根据系统语言选择文案
function getTrayStrings(): TrayStrings {
  const locale = app.getLocale();
  return locale.startsWith("zh") ? I18N.zh : I18N.en;
}

// 状态标签映射
function getStateLabel(state: GatewayState): string {
  const s = getTrayStrings();
  const map: Record<GatewayState, string> = {
    running: s.stateRunning,
    starting: s.stateStarting,
    stopping: s.stateStopping,
    stopped: s.stateStopped,
  };
  return map[state];
}

export class TrayManager {
  private tray: Tray | null = null;
  private opts: TrayOptions | null = null;

  // 创建托盘图标
  create(opts: TrayOptions): void {
    this.opts = opts;

    // macOS: Template 图标自动适配暗色模式（由 upstream CritterIconRenderer 生成）
    const iconName =
      process.platform === "darwin" ? "tray-iconTemplate@2x.png" : "tray-icon@2x.png";
    const iconPath = path.join(app.getAppPath(), "assets", iconName);

    let icon: Electron.NativeImage;
    try {
      icon = nativeImage.createFromPath(iconPath);
      if (process.platform === "darwin") icon.setTemplateImage(true);
    } catch {
      icon = nativeImage.createEmpty();
    }

    this.tray = new Tray(icon);
    this.tray.setToolTip("OneClaw");

    // 点击托盘图标 → 打开主窗口
    this.tray.on("click", () => {
      opts.windowManager.show({ port: opts.gateway.getPort(), token: opts.gateway.getToken() });
    });

    this.updateMenu();
  }

  // 刷新托盘菜单（Gateway 状态变化时调用）
  updateMenu(): void {
    if (!this.tray || !this.opts) return;

    const { windowManager, gateway, onRestartGateway, onStartGateway, onStopGateway, onOpenSettings, onQuit, onCheckUpdates } = this.opts;
    const t = getTrayStrings();
    const state = gateway.getState();
    const inTransition = state === "starting" || state === "stopping";
    const showStart = state === "stopped" || state === "stopping";
    const showStop = state === "running" || state === "starting";

    const menu = Menu.buildFromTemplate([
      {
        label: t.openDashboard,
        click: () => windowManager.show({ port: gateway.getPort(), token: gateway.getToken() }),
      },
      { type: "separator" },
      { label: getStateLabel(state), enabled: false },
      { label: t.restartGateway, enabled: !inTransition, click: onRestartGateway },
      ...(showStart ? [{ label: t.startGateway, enabled: state === "stopped", click: onStartGateway }] : []),
      ...(showStop ? [{ label: t.stopGateway, enabled: state === "running", click: onStopGateway }] : []),
      { type: "separator" },
      { label: t.settings, click: onOpenSettings },
      { label: t.checkUpdates, click: onCheckUpdates },
      { type: "separator" },
      { label: t.quit, click: onQuit },
    ]);

    this.tray.setContextMenu(menu);
  }

  // 更新托盘 tooltip（用于显示下载进度等临时状态）
  setTooltip(text: string): void {
    this.tray?.setToolTip(text);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
