import { Tray, Menu, app, nativeImage } from "electron";
import * as path from "path";
import { GatewayProcess, GatewayState } from "./gateway-process";
import { WindowManager } from "./window";

interface TrayOptions {
  windowManager: WindowManager;
  gateway: GatewayProcess;
  onQuit: () => void;
  onCheckUpdates: () => void;
}

// 状态标签映射
const STATE_LABELS: Record<GatewayState, string> = {
  running: "Gateway: Running",
  starting: "Gateway: Starting...",
  stopping: "Gateway: Stopping...",
  stopped: "Gateway: Stopped",
};

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

    const { windowManager, gateway, onQuit, onCheckUpdates } = this.opts;
    const statusLabel = STATE_LABELS[gateway.getState()];

    const menu = Menu.buildFromTemplate([
      {
        label: "Open Dashboard",
        click: () => windowManager.show({ port: gateway.getPort(), token: gateway.getToken() }),
      },
      { type: "separator" },
      { label: statusLabel, enabled: false },
      { label: "Restart Gateway", click: () => gateway.restart() },
      { type: "separator" },
      { label: "Check for Updates…", click: onCheckUpdates },
      { type: "separator" },
      { label: "Quit OneClaw", click: onQuit },
    ]);

    this.tray.setContextMenu(menu);
  }

  destroy(): void {
    this.tray?.destroy();
    this.tray = null;
  }
}
