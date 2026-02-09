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

/** 资源根目录 */
export function resolveResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  return path.join(app.getAppPath(), "resources");
}

/** 内嵌 Node.js 二进制 */
export function resolveNodeBin(): string {
  return path.join(resolveResourcesPath(), "runtime", IS_WIN ? "node.exe" : "node");
}

/** 内嵌 npm CLI */
export function resolveNpmBin(): string {
  return path.join(resolveResourcesPath(), "runtime", IS_WIN ? "npm.cmd" : "npm");
}

/** Gateway 统一入口（内容固定，不区分 locale） */
export function resolveGatewayEntry(): string {
  return path.join(resolveResourcesPath(), "gateway", "gateway-entry.mjs");
}

/** Gateway 工作目录（路径固定，不区分 locale） */
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

/** Gateway 诊断日志（固定写入 ~/.openclaw/gateway.log） */
export function resolveGatewayLogPath(): string {
  return path.join(resolveUserStateDir(), "gateway.log");
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
