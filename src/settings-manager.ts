import { BrowserWindow, app } from "electron";
import * as path from "path";

// Settings 窗口生命周期管理
export class SettingsManager {
  private win: BrowserWindow | null = null;

  // 显示 Settings 窗口（已存在则聚焦）
  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
      return;
    }

    // 标题本地化
    const lang = app.getLocale().startsWith("zh") ? "zh" : "en";
    const title = lang === "zh" ? "设置" : "Settings";

    this.win = new BrowserWindow({
      width: 700,
      height: 550,
      minWidth: 600,
      minHeight: 450,
      title,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });
    this.win.on("page-title-updated", (event) => {
      event.preventDefault();
      this.win?.setTitle(title);
    });
    // 隐藏默认菜单栏
    this.win.setMenuBarVisibility(false);
    this.win.removeMenu();

    // 关闭窗口不退出应用（区别于 Setup）
    this.win.on("closed", () => {
      this.win = null;
    });

    this.win.loadFile(path.join(__dirname, "..", "settings", "index.html"), {
      query: { lang, platform: process.platform },
    });
    this.win.show();
  }

  // 获取 webContents（用于 doctor 流式推送）
  getWebContents(): Electron.WebContents | null {
    if (!this.win || this.win.isDestroyed()) return null;
    return this.win.webContents;
  }

  isOpen(): boolean {
    return this.win != null && !this.win.isDestroyed();
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.destroy();
    }
    this.win = null;
  }
}
