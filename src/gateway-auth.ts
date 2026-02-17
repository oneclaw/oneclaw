import * as crypto from "crypto";
import * as fs from "fs";
import { resolveUserConfigPath } from "./constants";

type GatewayConfig = Record<string, any>;
interface ResolveTokenOptions {
  persist?: boolean;
}

const FILE_ORIGIN_NULL = "null";

// 为 Electron file:// 页面补全 Control UI 的 null origin 白名单。
function ensureControlUiAllowedOriginsInConfig(config: GatewayConfig): void {
  config.gateway ??= {};
  config.gateway.controlUi ??= {};

  const controlUi = config.gateway.controlUi as GatewayConfig;
  const rawAllowedOrigins = Array.isArray(controlUi.allowedOrigins) ? controlUi.allowedOrigins : [];

  const normalized = rawAllowedOrigins
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  const hasNullOrigin = normalized.some((value) => value.toLowerCase() === FILE_ORIGIN_NULL);
  if (!hasNullOrigin) {
    normalized.push(FILE_ORIGIN_NULL);
  }

  controlUi.allowedOrigins = normalized;
}

/**
 * 统一整理 gateway.auth：确保 mode=token 且 token 存在。
 */
export function ensureGatewayAuthTokenInConfig(config: GatewayConfig): string {
  config.gateway ??= {};
  config.gateway.auth ??= {};

  const auth = config.gateway.auth as GatewayConfig;
  const token = typeof auth.token === "string" ? auth.token.trim() : "";
  const resolvedToken = token || crypto.randomBytes(16).toString("hex");

  auth.mode = "token";
  auth.token = resolvedToken;

  // 本应用始终使用本地 gateway；空值时补全为 local，避免未设置状态。
  if (typeof config.gateway.mode !== "string" || !config.gateway.mode.trim()) {
    config.gateway.mode = "local";
  }
  ensureControlUiAllowedOriginsInConfig(config);

  return resolvedToken;
}

/**
 * 从 openclaw.json 读取（或补全）gateway token。
 * 仅在配置文件可解析时才回写，避免覆盖损坏配置。
 */
export function resolveGatewayAuthToken(opts: ResolveTokenOptions = {}): string {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) {
    return crypto.randomBytes(16).toString("hex");
  }

  let config: GatewayConfig;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    config = JSON.parse(raw);
  } catch {
    return crypto.randomBytes(16).toString("hex");
  }

  // 只读模式：仅使用已有 token，避免在 Setup 判定前提前改写配置。
  if (opts.persist === false) {
    const token = typeof config.gateway?.auth?.token === "string" ? config.gateway.auth.token.trim() : "";
    return token || crypto.randomBytes(16).toString("hex");
  }

  const before = JSON.stringify(config);
  const token = ensureGatewayAuthTokenInConfig(config);
  const after = JSON.stringify(config);

  if (before !== after) {
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch {}
  }

  return token;
}
