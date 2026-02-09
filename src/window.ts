import { BrowserWindow } from "electron";
import * as path from "path";
import * as log from "./logger";
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
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: path.join(__dirname, "preload.js"),
      },
    });
    // 主窗口隐藏菜单栏（File/Edit/View...）
    this.win.setMenuBarVisibility(false);
    this.win.removeMenu();

    // 渲染进程崩溃 / 无响应监控
    this.win.webContents.on("render-process-gone", (_e, details) => {
      log.error(`render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`);
    });
    this.win.on("unresponsive", () => {
      log.warn("窗口无响应");
    });

    // 关闭 → 隐藏到托盘（不退出）
    this.win.on("close", (e) => {
      e.preventDefault();
      this.win?.hide();
    });

    const url = `http://127.0.0.1:${opts.port}/`;

    // 第一次加载：建立同源上下文
    const loaded = await this.loadWithRetry(url);
    if (!loaded) {
      await this.loadGatewayErrorPage(url);
      this.win.show();
      return;
    }

    // 注入 gateway token 到 localStorage，仅 token 变化时才 reload
    if (opts.token) {
      try {
        const needsReload = await this.ensureToken(opts.token);
        if (needsReload) {
          try {
            await this.win.loadURL(url);
          } catch {
            log.error("token 注入后 reload 失败，切换错误页");
            await this.loadGatewayErrorPage(url);
          }
        }
      } catch {
        log.error("token 注入失败，切换错误页");
        await this.loadGatewayErrorPage(url);
      }
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

  // 写入 token 到 localStorage，返回是否需要 reload（token 变化时）
  private async ensureToken(token: string): Promise<boolean> {
    const escaped = token.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return await this.win!.webContents.executeJavaScript(`
      (() => {
        const key = "openclaw.control.settings.v1";
        const raw = localStorage.getItem(key);
        const s = raw ? JSON.parse(raw) : {};
        if (s.token === "${escaped}") return false;
        s.token = "${escaped}";
        localStorage.setItem(key, JSON.stringify(s));
        return true;
      })();
    `);
  }

  // 重试加载 URL（Gateway 可能还没就绪）
  private async loadWithRetry(url: string): Promise<boolean> {
    for (let i = 1; i <= WINDOW_LOAD_MAX_RETRIES; i++) {
      try {
        await this.win!.loadURL(url);
        return true;
      } catch {
        log.info(`加载重试 ${i}/${WINDOW_LOAD_MAX_RETRIES}`);
        await new Promise((r) => setTimeout(r, WINDOW_LOAD_RETRY_INTERVAL_MS));
      }
    }
    log.error("加载失败，已达最大重试次数");
    return false;
  }

  // Gateway 无法访问时，显示可见错误页，避免白屏
  private async loadGatewayErrorPage(url: string): Promise<void> {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gateway Not Available</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0b1020;
      color: #e6ebff;
    }
    .card {
      width: min(680px, calc(100vw - 40px));
      border-radius: 14px;
      background: #111938;
      border: 1px solid #2a366f;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
      padding: 22px 20px;
    }
    h1 { margin: 0 0 10px; font-size: 20px; }
    p { margin: 0 0 10px; line-height: 1.5; color: #c8d2ff; }
    code {
      display: block;
      margin: 8px 0 16px;
      padding: 10px 12px;
      border-radius: 8px;
      background: #0a1026;
      border: 1px solid #2a366f;
      color: #9cb0ff;
      overflow-wrap: anywhere;
    }
    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 600;
      cursor: pointer;
      color: #071033;
      background: #8ea7ff;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Gateway not available</h1>
    <p>OneClaw 无法连接本地 Gateway，主界面未加载。</p>
    <p>请在托盘菜单中尝试 <strong>Restart Gateway</strong>，然后点击下方按钮重试。</p>
    <code>${url}</code>
    <button id="retryBtn" type="button">Retry</button>
  </main>
  <script>
    document.getElementById("retryBtn")?.addEventListener("click", () => {
      window.location.href = ${JSON.stringify(url)};
    });
  </script>
</body>
</html>`;

    await this.win!.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }
}
