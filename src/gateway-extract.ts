import { app, BrowserWindow } from "electron";
import { execFileSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { resolveResourcesPath, IS_WIN } from "./constants";
import * as log from "./logger";

// Gateway node_modules 首次解压（tar 打包安装，首次启动还原）
export async function extractGatewayModulesIfNeeded(): Promise<void> {
  if (!app.isPackaged) return;

  const gatewayDir = path.join(resolveResourcesPath(), "gateway");
  const tarPath = path.join(gatewayDir, "node_modules.tar");
  const modulesDir = path.join(gatewayDir, "node_modules");

  // 无 tar 文件 → 跳过（dev 模式或已解压后删除了 tar）
  if (!fs.existsSync(tarPath)) return;

  // 已有 node_modules → 删除 tar 残留即可
  if (fs.existsSync(modulesDir)) {
    try { fs.unlinkSync(tarPath); } catch {}
    return;
  }

  log.info(`[extract] 首次启动，解压 gateway node_modules...`);
  const startTime = Date.now();

  // 显示准备界面
  const splash = showSplash();

  try {
    const tarBin = IS_WIN ? "tar.exe" : "tar";
    execFileSync(tarBin, ["xf", tarPath, "-C", gatewayDir], {
      timeout: 300_000, // 5 分钟超时
      windowsHide: true,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    log.info(`[extract] 解压完成，耗时 ${elapsed}s`);

    // 解压成功后删除 tar
    try { fs.unlinkSync(tarPath); } catch {}
  } catch (err: any) {
    log.error(`[extract] 解压失败: ${err?.message ?? err}`);
    throw new Error(`Gateway 资源解压失败: ${err?.message ?? err}`);
  } finally {
    if (splash && !splash.isDestroyed()) {
      splash.close();
    }
  }
}

// 简易启动画面：告知用户正在准备
function showSplash(): BrowserWindow | null {
  try {
    const locale = app.getLocale();
    const isZh = locale.startsWith("zh");
    const title = isZh ? "OneClaw 准备中…" : "Preparing OneClaw…";
    const message = isZh ? "首次启动需要准备运行环境，请稍候…" : "Setting up for first launch, please wait…";

    const win = new BrowserWindow({
      width: 360,
      height: 140,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      frame: false,
      transparent: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { margin:0; font-family:-apple-system,system-ui,sans-serif; display:flex;
    align-items:center; justify-content:center; height:100vh;
    background:#1a1a1a; color:#e0e0e0; user-select:none; }
  .wrap { text-align:center; }
  h2 { font-size:15px; font-weight:600; margin:0 0 8px; }
  p { font-size:12px; color:#888; margin:0; }
</style></head><body><div class="wrap">
  <h2>${title}</h2><p>${message}</p>
</div></body></html>`;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    win.once("ready-to-show", () => win.show());
    return win;
  } catch {
    return null;
  }
}
