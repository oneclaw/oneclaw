import { BrowserWindow, app } from "electron";
import * as path from "path";

// Setup 窗口生命周期管理
export class SetupManager {
  private setupWin: BrowserWindow | null = null;
  private onComplete?: () => boolean | Promise<boolean>;
  private completing = false;

  // 注册完成回调（支持 async）
  setOnComplete(cb: () => boolean | Promise<boolean>): void {
    this.onComplete = cb;
  }

  // 显示 Setup 窗口
  showSetup(): void {
    this.setupWin = new BrowserWindow({
      width: 580,
      height: 680,
      resizable: false,
      title: "OneClaw Setup",
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });
    // Windows/Linux 隐藏窗口菜单栏（File/Edit/View...）
    this.setupWin.setMenuBarVisibility(false);
    this.setupWin.removeMenu();

    // Setup 窗口关闭 → 直接退出应用
    this.setupWin.on("close", () => {
      app.quit();
    });

    // 根据系统语言传递 lang 参数，zh 开头用中文，其余 fallback 英文
    const lang = app.getLocale().startsWith("zh") ? "zh" : "en";
    this.setupWin.loadFile(path.join(__dirname, "..", "setup", "index.html"), {
      query: { lang },
    });
    this.setupWin.show();
  }

  // Setup 完成：先执行启动回调，成功后再关闭 Setup（避免用户看到空白等待）
  async complete(): Promise<boolean> {
    if (this.completing) return false;
    this.completing = true;

    try {
      const ok = this.onComplete ? await this.onComplete() : true;
      if (!ok) return false;

      if (this.setupWin && !this.setupWin.isDestroyed()) {
        this.setupWin.removeAllListeners("close");
        this.setupWin.close();
      }
      this.setupWin = null;
      return true;
    } catch (err) {
      console.error("[setup] onComplete 回调错误:", err);
      return false;
    } finally {
      this.completing = false;
    }
  }

  // 是否正在显示 Setup
  isSetupOpen(): boolean {
    return this.setupWin != null && !this.setupWin.isDestroyed();
  }

  // 聚焦 Setup 窗口（二次启动时）
  focusSetup(): void {
    if (this.isSetupOpen()) {
      this.setupWin!.show();
      this.setupWin!.focus();
    }
  }
}
