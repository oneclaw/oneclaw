import { BrowserWindow, app, screen } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as log from "./logger";
import { resolveUserStateDir } from "./constants";

// ── Live2D 配置持久化 ──

interface Live2DConfig {
  enabled: boolean;
  modelPath: string;
  windowBounds?: { x: number; y: number; width: number; height: number };
  alwaysOnTop: boolean;
  scale: number;
}

function defaultLive2DConfig(): Live2DConfig {
  return {
    enabled: true,
    modelPath: "aidang_2",
    alwaysOnTop: true,
    scale: 1.0,
  };
}

function resolveLive2DConfigPath(): string {
  return path.join(resolveUserStateDir(), "live2d-config.json");
}

function readLive2DConfig(): Live2DConfig {
  try {
    const raw = fs.readFileSync(resolveLive2DConfigPath(), "utf-8");
    return { ...defaultLive2DConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultLive2DConfig();
  }
}

function writeLive2DConfig(config: Partial<Live2DConfig>): void {
  const current = readLive2DConfig();
  const merged = { ...current, ...config };
  try {
    const dir = path.dirname(resolveLive2DConfigPath());
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(resolveLive2DConfigPath(), JSON.stringify(merged, null, 2));
  } catch (err) {
    log.error(`Live2D 配置写入失败: ${err}`);
  }
}

// ── Live2D 模型路径解析 ──

function resolveLive2DModelsDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources", "models", "live2d");
  }
  return path.join(app.getAppPath(), "resources", "models", "live2d");
}

function resolveLive2DHtmlPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "live2d", "index.html");
  }
  return path.join(app.getAppPath(), "live2d", "index.html");
}

function resolveLive2DPreloadPath(): string {
  return path.join(__dirname, "live2d-preload.js");
}

// ── 获取模型列表 ──

export function getModelList(): { name: string; path: string; thumbnail?: string }[] {
  const modelsDir = resolveLive2DModelsDir();
  if (!fs.existsSync(modelsDir)) return [];

  return fs.readdirSync(modelsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const modelDir = path.join(modelsDir, d.name);
      // 查找 .model3.json
      const files = fs.readdirSync(modelDir);
      const model3 = files.find((f) => f.endsWith(".model3.json"));
      // 查找缩略图
      const thumb = files.find((f) => /^(preview|thumbnail|icon)\.(png|jpg|jpeg|webp)$/i.test(f));
      return {
        name: d.name,
        path: d.name,
        thumbnail: thumb ? path.join(modelDir, thumb) : undefined,
      };
    })
    .filter((m) => m.path);
}

// ── Live2D 窗口管理 ──

export class Live2DWindowManager {
  private win: BrowserWindow | null = null;
  private config: Live2DConfig;

  constructor() {
    this.config = readLive2DConfig();
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    writeLive2DConfig({ enabled });
  }

  getWindow(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win;
    return null;
  }

  getConfig(): Live2DConfig {
    return { ...this.config };
  }

  getModelsDir(): string {
    return resolveLive2DModelsDir();
  }

  show(): void {
    if (!this.config.enabled) return;

    // 复用已有窗口
    if (this.win && !this.win.isDestroyed()) {
      this.win.show();
      return;
    }

    log.info("创建 Live2D 窗口");

    const bounds = this.config.windowBounds ?? this.getDefaultBounds();

    this.win = new BrowserWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      transparent: true,
      frame: false,
      alwaysOnTop: this.config.alwaysOnTop,
      skipTaskbar: true,
      hasShadow: false,
      resizable: true,
      focusable: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: resolveLive2DPreloadPath(),
      },
    });

    // 让窗口鼠标穿透透明区域
    this.win.setIgnoreMouseEvents(false);

    // 加载 Live2D 前端
    const htmlPath = resolveLive2DHtmlPath();
    log.info(`加载 Live2D 页面: ${htmlPath}`);
    this.win.loadFile(htmlPath).catch((err) => {
      log.error(`Live2D 页面加载失败: ${err}`);
    });

    // 保存窗口位置
    this.win.on("moved", () => this.savePosition());
    this.win.on("resized", () => this.savePosition());

    // 窗口关闭时重置
    this.win.on("closed", () => {
      this.win = null;
    });

    // DevTools
    if (process.env.ONECLAW_DEBUG || process.env.OPENCLAW_DEBUG) {
      this.win.webContents.openDevTools({ mode: "detach" });
    }
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.hide();
    }
  }

  destroy(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.savePosition();
      this.win.removeAllListeners("close");
      this.win.close();
      this.win = null;
    }
  }

  changeModel(modelName: string): void {
    this.config.modelPath = modelName;
    writeLive2DConfig({ modelPath: modelName });

    // 通知渲染进程切换模型
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send("live2d:change-model", modelName);
    }
  }

  private getDefaultBounds(): { x: number; y: number; width: number; height: number } {
    const display = screen.getPrimaryDisplay();
    const { width: screenW, height: screenH } = display.workAreaSize;
    return {
      width: 350,
      height: 400,
      x: screenW - 400,
      y: screenH - 450,
    };
  }

  private savePosition(): void {
    if (!this.win || this.win.isDestroyed()) return;
    const bounds = this.win.getBounds();
    this.config.windowBounds = bounds;
    writeLive2DConfig({ windowBounds: bounds });
  }
}
