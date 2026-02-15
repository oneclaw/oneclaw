import { BrowserWindow, app } from "electron";
import * as path from "path";
import * as log from "./logger";
import { shouldHideWindowOnClose } from "./window-close-policy";
import {
  WINDOW_WIDTH,
  WINDOW_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_MIN_HEIGHT,
  resolveChatUiPath,
} from "./constants";

interface ShowOptions {
  port: number;
  token?: string;
  onboarding?: boolean;
}

export class WindowManager {
  private win: BrowserWindow | null = null;
  private allowAppQuit = false;

  // 显示主窗口（加载 Chat UI）
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
    const title = "OneClaw";
    this.win.on("page-title-updated", (event) => {
      event.preventDefault();
      this.win?.setTitle(title);
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

    // 关闭 → 普通场景隐藏到托盘；退出/更新场景放行关闭
    this.win.on("close", (e) => {
      if (!shouldHideWindowOnClose({ allowAppQuit: this.allowAppQuit })) return;
      e.preventDefault();
      this.win?.hide();
    });
    // 窗口真正销毁后重置状态，避免退出标记泄漏到后续窗口生命周期
    this.win.on("closed", () => {
      this.win = null;
      this.allowAppQuit = false;
    });

    // 加载本地 chat-ui/dist/index.html
    // 分两步：先加载页面建立 file:// 源，注入 localStorage，再 reload 让 app 读到正确配置。
    // 窗口此时 show=false，用户看不到中间态。
    const chatUiIndex = resolveChatUiPath();
    try {
      await this.win.loadFile(chatUiIndex);
    } catch (err) {
      log.error(`Chat UI 加载失败: ${err}`);
      await this.loadChatUiErrorPage();
      this.win.show();
      return;
    }

    // 注入 gateway 连接信息到 localStorage，然后 reload 让 app 重新初始化
    if (opts.token) {
      await this.injectGatewaySettings(opts.port, opts.token);
      try {
        await this.win.loadFile(chatUiIndex);
      } catch (err) {
        log.error(`Chat UI reload 失败: ${err}`);
      }
    }

    this.win.show();
  }

  // 标记应用进入退出流程（例如手动退出/更新安装）
  prepareForAppQuit(): void {
    this.allowAppQuit = true;
  }

  // 销毁窗口（应用退出前调用）
  destroy(): void {
    if (!this.win || this.win.isDestroyed()) return;
    this.win.removeAllListeners("close");
    this.win.close();
    this.win = null;
  }

  // 注入 gateway URL 和 token 到 localStorage，Chat UI 的 gateway.ts 会读取
  private async injectGatewaySettings(port: number, token: string): Promise<void> {
    const escaped = token.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const gatewayUrl = `ws://127.0.0.1:${port}`;
    try {
      await this.win!.webContents.executeJavaScript(`
        (() => {
          const key = "openclaw.control.settings.v1";
          const raw = localStorage.getItem(key);
          const s = raw ? JSON.parse(raw) : {};
          s.token = "${escaped}";
          s.gatewayUrl = "${gatewayUrl}";
          localStorage.setItem(key, JSON.stringify(s));
        })();
      `);
    } catch (err) {
      log.error(`gateway settings 注入失败: ${err}`);
    }
  }

  // Chat UI 加载失败时的错误页
  private async loadChatUiErrorPage(): Promise<void> {
    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OneClaw - Error</title>
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
    button {
      border: 0;
      border-radius: 8px;
      padding: 10px 14px;
      font-weight: 600;
      cursor: pointer;
      color: #fff;
      background: #c0392b;
    }
  </style>
</head>
<body>
  <main class="card">
    <h1>Chat UI not available</h1>
    <p>OneClaw Chat UI 未能加载。请尝试重新启动应用。</p>
    <button id="retryBtn" type="button">Retry</button>
  </main>
  <script>
    document.getElementById("retryBtn")?.addEventListener("click", () => {
      window.location.reload();
    });
  </script>
</body>
</html>`;

    await this.win!.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  }
}
