import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { isSetupCompleteFromConfig } from "./setup-completion";

// ── 网络端口 ──

export const DEFAULT_PORT = 18789;
export const DEFAULT_BIND = "loopback";

// 从用户配置/环境变量解析 Gateway 端口（与 openclaw 内部逻辑一致）
export function resolveGatewayPort(): number {
  const envRaw = process.env.OPENCLAW_GATEWAY_PORT?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  try {
    const raw = fs.readFileSync(resolveUserConfigPath(), "utf-8");
    const cfg = JSON.parse(raw);
    const configPort = cfg?.gateway?.port;
    if (typeof configPort === "number" && Number.isFinite(configPort) && configPort > 0) {
      return configPort;
    }
  } catch {}
  return DEFAULT_PORT;
}

// ── 健康检查 ──

// Windows 冷启动可能受 Defender/磁盘预热影响，30s 容易误判失败。
export const HEALTH_TIMEOUT_MS = 90_000;
export const HEALTH_POLL_INTERVAL_MS = 500;

// ── 崩溃冷却 ──

export const CRASH_COOLDOWN_MS = 5_000;

// ── 窗口加载重试 ──

export const WINDOW_LOAD_MAX_RETRIES = 20;
export const WINDOW_LOAD_RETRY_INTERVAL_MS = 1_500;

// ── 窗口尺寸 ──

export const WINDOW_WIDTH = 1200;
export const WINDOW_HEIGHT = 800;
export const WINDOW_MIN_WIDTH = 800;
export const WINDOW_MIN_HEIGHT = 600;

// ── 平台判断 ──

export const IS_WIN = process.platform === "win32";

let cachedPackagedWindowsNodeBin: string | null = null;

// ── 路径解析（自动适配 dev / packaged 两种环境） ──

/** 资源根目录（dev 模式指向 targets/<platform-arch>，打包后 afterPack 已拍平） */
export function resolveResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  const target = process.env.ONECLAW_TARGET ?? `${process.platform}-${process.arch}`;
  return path.join(app.getAppPath(), "resources", "targets", target);
}

/** dev 模式下的目标产物目录（package:resources 的输出路径） */
function resolveDevTargetPath(): string {
  return path.join(app.getAppPath(), "resources", "targets", `${process.platform}-${process.arch}`);
}

// Windows packaged 模式下优先使用 Helper.exe，避免把主 GUI exe 直接暴露给所有子进程。
function resolvePackagedWindowsHelperPath(): string {
  const exeDir = path.dirname(process.execPath);
  const ext = path.extname(process.execPath) || ".exe";
  const base = path.basename(process.execPath, ext);
  return path.join(exeDir, `${base} Helper${ext}`);
}

// 惰性创建 Windows Helper hard link；失败时安全回退主 exe，不阻断启动。
function resolvePackagedWindowsNodeBin(): string {
  if (cachedPackagedWindowsNodeBin) return cachedPackagedWindowsNodeBin;

  const helperPath = resolvePackagedWindowsHelperPath();
  if (fs.existsSync(helperPath)) {
    cachedPackagedWindowsNodeBin = helperPath;
    return helperPath;
  }

  try {
    fs.linkSync(process.execPath, helperPath);
    cachedPackagedWindowsNodeBin = helperPath;
    return helperPath;
  } catch {
    cachedPackagedWindowsNodeBin = process.execPath;
    return process.execPath;
  }
}

/** Node.js 二进制（packaged 复用 Electron binary + ELECTRON_RUN_AS_NODE；dev 优先用下载的） */
export function resolveNodeBin(): string {
  if (!app.isPackaged) {
    const exe = IS_WIN ? "node.exe" : "node";
    const bundled = path.join(resolveDevTargetPath(), "runtime", exe);
    return fs.existsSync(bundled) ? bundled : "node";
  }
  // macOS：使用 Helper binary（Info.plist 含 LSUIElement=true，不产生 Dock 弹跳图标）
  if (!IS_WIN) {
    const contentsDir = path.resolve(path.dirname(process.execPath), "..");
    const exeName = path.basename(process.execPath);
    const helperName = `${exeName} Helper`;
    const helperPath = path.join(
      contentsDir, "Frameworks", `${helperName}.app`, "Contents", "MacOS", helperName,
    );
    if (fs.existsSync(helperPath)) return helperPath;
  }
  return resolvePackagedWindowsNodeBin();
}

/** packaged 模式需要的额外环境变量（让 Electron binary 作为纯 Node.js 运行） */
export function resolveNodeExtraEnv(): Record<string, string> {
  return app.isPackaged ? { ELECTRON_RUN_AS_NODE: "1" } : {};
}

/** npm CLI（dev 模式优先用 package:resources 下载的，无则降级系统 npm） */
export function resolveNpmBin(): string {
  if (!app.isPackaged) {
    const exe = IS_WIN ? "npm.cmd" : "npm";
    const bundled = path.join(resolveDevTargetPath(), "runtime", exe);
    return fs.existsSync(bundled) ? bundled : "npm";
  }
  return path.join(resolveResourcesPath(), "runtime", IS_WIN ? "npm.cmd" : "npm");
}

/** Gateway 入口（优先使用 openclaw.mjs；旧包回退 gateway-entry.mjs） */
export function resolveGatewayEntry(): string {
  const openclawCliEntry = path.join(resolveResourcesPath(), "gateway", "node_modules", "openclaw", "openclaw.mjs");
  if (fs.existsSync(openclawCliEntry)) {
    return openclawCliEntry;
  }
  return path.join(resolveResourcesPath(), "gateway", "gateway-entry.mjs");
}

/** Gateway 工作目录（统一使用 npm 安装的 openclaw 包路径） */
export function resolveGatewayCwd(): string {
  return path.join(resolveResourcesPath(), "gateway", "node_modules", "openclaw");
}

/** clawhub CLI bin 入口（与 openclaw 同一 node_modules） */
export function resolveClawhubEntry(): string {
  return path.join(resolveResourcesPath(), "gateway", "node_modules", "clawhub", "bin", "clawdhub.js");
}

/** 用户 bin 目录（~/.openclaw/bin/，存放 CLI wrapper 脚本） */
export function resolveUserBinDir(): string {
  return path.join(resolveUserStateDir(), "bin");
}

/** 用户状态目录（~/.openclaw/） */
export function resolveUserStateDir(): string {
  if (process.env.OPENCLAW_STATE_DIR) return process.env.OPENCLAW_STATE_DIR;
  const home = IS_WIN ? process.env.USERPROFILE : process.env.HOME;
  return path.join(home ?? "", ".openclaw");
}

/** 用户配置文件（JSON5 格式） */
export function resolveUserConfigPath(): string {
  return path.join(resolveUserStateDir(), "openclaw.json");
}

/** 用户配置备份目录 */
export function resolveConfigBackupDir(): string {
  return path.join(resolveUserStateDir(), "config-backups");
}

/** 最近一次可启动配置快照 */
export function resolveLastKnownGoodConfigPath(): string {
  return path.join(resolveUserStateDir(), "openclaw.last-known-good.json");
}

/** Gateway 诊断日志（固定写入 ~/.openclaw/gateway.log） */
export function resolveGatewayLogPath(): string {
  return path.join(resolveUserStateDir(), "gateway.log");
}

// ── Chat UI 路径 ──

/** Chat UI 的 index.html（dev 模式在 chat-ui/dist/，打包后在 app 资源中） */
export function resolveChatUiPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "chat-ui", "dist", "index.html");
  }
  return path.join(app.getAppPath(), "chat-ui", "dist", "index.html");
}

// ── Setup 完成判断 ──

/** 检查 Setup 是否已完成（配置文件存在且有效） */
export function isSetupComplete(): boolean {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return false;

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    return isSetupCompleteFromConfig(config);
  } catch {
    return false;
  }
}
