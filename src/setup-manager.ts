import { BrowserWindow, app } from "electron";
import * as path from "path";

// Setup 窗口生命周期管理
export class SetupManager {
  private setupWin: BrowserWindow | null = null;
  private onComplete?: () => void | Promise<void>;

  // 注册完成回调（支持 async）
  setOnComplete(cb: () => void | Promise<void>): void {
    this.onComplete = cb;
  }

  // 显示 Setup 窗口
  showSetup(): void {
    this.setupWin = new BrowserWindow({
      width: 580,
      height: 680,
      resizable: false,
      title: "OneClaw Setup",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    // Setup 窗口关闭 → 直接退出应用
    this.setupWin.on("close", () => {
      app.quit();
    });

    this.setupWin.loadFile(path.join(__dirname, "..", "setup", "index.html"));
    this.setupWin.show();
  }

  // Setup 完成 → 关闭窗口，触发回调
  complete(): void {
    if (this.setupWin && !this.setupWin.isDestroyed()) {
      this.setupWin.removeAllListeners("close");
      this.setupWin.close();
    }
    this.setupWin = null;

    // onComplete 可能是 async，捕获错误防止静默丢失
    const result = this.onComplete?.();
    if (result && typeof (result as Promise<void>).catch === "function") {
      (result as Promise<void>).catch((err) => {
        console.error("[setup] onComplete 回调错误:", err);
      });
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
