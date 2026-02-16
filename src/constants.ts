import { app } from "electron";
import * as path from "path";
import * as fs from "fs";

// ── 网络端口 ──

export const DEFAULT_PORT = 18789;
export const DEFAULT_BIND = "loopback";

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

/** Node.js 二进制（dev 模式优先用 package:resources 下载的，无则降级系统 node） */
export function resolveNodeBin(): string {
  if (!app.isPackaged) {
    const exe = IS_WIN ? "node.exe" : "node";
    const bundled = path.join(resolveDevTargetPath(), "runtime", exe);
    return fs.existsSync(bundled) ? bundled : "node";
  }
  return path.join(resolveResourcesPath(), "runtime", IS_WIN ? "node.exe" : "node");
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

/** Gateway 入口（统一使用 package:resources 从 npm 安装的路径） */
export function resolveGatewayEntry(): string {
  return path.join(resolveResourcesPath(), "gateway", "gateway-entry.mjs");
}

/** Gateway 工作目录（统一使用 npm 安装的 openclaw 包路径） */
export function resolveGatewayCwd(): string {
  return path.join(resolveResourcesPath(), "gateway", "node_modules", "openclaw");
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

    // 有 wizard 记录 → 已完成
    if (config.wizard) return true;

    // 有 models.providers 配置 → 已完成
    if (config.models?.providers && Object.keys(config.models.providers).length > 0) return true;

    // 有 gateway.auth 配置 → 已完成
    const auth = config.gateway?.auth;
    if (auth?.mode || auth?.token || auth?.password) return true;

    return false;
  } catch {
    return false;
  }
}
