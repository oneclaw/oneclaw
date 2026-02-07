import { BrowserWindow } from "electron";
import * as path from "path";
import {
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  WINDOW_LOAD_MAX_RETRIES,
  WINDOW_LOAD_RETRY_INTERVAL_MS,
} from "./constants";

interface ShowOptions {
  port: number;
  token?: string;
  onboarding?: boolean;
}

export class WindowManager {
  private win: BrowserWindow | null = null;

  // 显示主窗口（加载 Gateway Control UI）
  async show(opts: ShowOptions): Promise<void> {
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      this.win.focus();
      return;
    }

    this.win = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      minWidth: WINDOW_MIN_WIDTH,
      minHeight: WINDOW_MIN_HEIGHT,
      show: false,
      title: "OneClaw",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });

    // 关闭 → 隐藏到托盘（不退出）
    this.win.on("close", (e) => {
      e.preventDefault();
      this.win?.hide();
    });

    const url = `http://127.0.0.1:${opts.port}/`;

    await this.loadWithRetry(url);

    // 注入 gateway token 到 localStorage（原版 openclaw 从这里读认证信息）
    if (opts.token) {
      await this.injectToken(opts.token);
    }

    this.win.show();
  }

  // 销毁窗口（应用退出前调用）
  destroy(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.removeAllListeners("close");
    this.win.close();
    this.win = null;
  }

  // 注入 token 到 localStorage 并 reload（让 Control UI 的 WebSocket 客户端拿到认证信息）
  private async injectToken(token: string): Promise<void> {
    const escaped = token.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `
      try {
        const key = "openclaw.control.settings.v1";
        const raw = localStorage.getItem(key);
        const settings = raw ? JSON.parse(raw) : {};
        settings.token = "${escaped}";
        localStorage.setItem(key, JSON.stringify(settings));
      } catch(e) { console.error("[oneclaw] token inject failed:", e); }
    `;
    await this.win!.webContents.executeJavaScript(script);
    await this.win!.loadURL(this.win!.webContents.getURL());
  }

  // 重试加载 URL（Gateway 可能还没就绪）
  private async loadWithRetry(url: string): Promise<void> {
    for (let i = 1; i <= WINDOW_LOAD_MAX_RETRIES; i++) {
      try {
        await this.win!.loadURL(url);
        return;
      } catch {
        console.log(`[window] 加载重试 ${i}/${WINDOW_LOAD_MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, WINDOW_LOAD_RETRY_INTERVAL_MS));
      }
    }
    console.error("[window] 加载失败，已达最大重试次数");
  }
}
