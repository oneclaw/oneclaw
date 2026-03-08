import * as fs from "fs";
import * as path from "path";
import { resolveGatewayCwd } from "./constants";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";

export const DINGTALK_CONNECTOR_PLUGIN_ID = "dingtalk-connector";
export const DEFAULT_DINGTALK_SESSION_TIMEOUT_MS = 30 * 60 * 1000;

export interface ExtractedDingtalkConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  sessionTimeout: number;
}

export interface SaveDingtalkConfigParams {
  enabled: boolean;
  clientId?: string;
  clientSecret?: string;
  sessionTimeout?: number;
}

// 统一解析钉钉插件目录，兼容 dev / packaged 环境。
export function resolveDingtalkPluginDir(): string {
  return path.join(resolveGatewayCwd(), "extensions", DINGTALK_CONNECTOR_PLUGIN_ID);
}

// 检查钉钉插件是否已经随应用一起打包。
export function isDingtalkPluginBundled(): boolean {
  const pluginDir = resolveDingtalkPluginDir();
  const hasEntry =
    fs.existsSync(path.join(pluginDir, "plugin.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "plugin.js")) ||
    fs.existsSync(path.join(pluginDir, "index.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.js"));
  return hasEntry && fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}

// 统一把 sessionTimeout 规整成正整数毫秒值，非法值回退到默认值。
function normalizeDingtalkSessionTimeout(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }
  return fallback;
}

// 从当前用户配置中提取钉钉配置，供设置页回显。
export function extractDingtalkConfig(config: any): ExtractedDingtalkConfig {
  const entry = config?.plugins?.entries?.[DINGTALK_CONNECTOR_PLUGIN_ID];
  const channel = config?.channels?.[DINGTALK_CONNECTOR_PLUGIN_ID];
  return {
    enabled: entry?.enabled === true || channel?.enabled === true,
    clientId: typeof channel?.clientId === "string" ? channel.clientId : "",
    clientSecret: typeof channel?.clientSecret === "string" ? channel.clientSecret : "",
    sessionTimeout: normalizeDingtalkSessionTimeout(
      channel?.sessionTimeout,
      DEFAULT_DINGTALK_SESSION_TIMEOUT_MS
    ),
  };
}

// 钉钉连接器依赖 Gateway HTTP chatCompletions 端点，保存时自动补齐。
function ensureDingtalkGatewayHttpEndpoint(config: any): void {
  config.gateway ??= {};
  config.gateway.http ??= {};
  config.gateway.http.endpoints ??= {};

  const existing =
    typeof config.gateway.http.endpoints.chatCompletions === "object" &&
    config.gateway.http.endpoints.chatCompletions !== null
      ? config.gateway.http.endpoints.chatCompletions
      : {};

  config.gateway.http.endpoints.chatCompletions = {
    ...existing,
    enabled: true,
  };
}

// 写入钉钉配置时保留高级字段，仅覆盖设置页可管理的核心字段。
export function saveDingtalkConfig(config: any, params: SaveDingtalkConfigParams): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.channels ??= {};

  const existingEntry =
    typeof config.plugins.entries[DINGTALK_CONNECTOR_PLUGIN_ID] === "object" &&
    config.plugins.entries[DINGTALK_CONNECTOR_PLUGIN_ID] !== null
      ? config.plugins.entries[DINGTALK_CONNECTOR_PLUGIN_ID]
      : {};
  const existingChannel =
    typeof config.channels[DINGTALK_CONNECTOR_PLUGIN_ID] === "object" &&
    config.channels[DINGTALK_CONNECTOR_PLUGIN_ID] !== null
      ? config.channels[DINGTALK_CONNECTOR_PLUGIN_ID]
      : {};

  config.plugins.entries[DINGTALK_CONNECTOR_PLUGIN_ID] = {
    ...existingEntry,
    enabled: params.enabled === true,
  };

  if (params.enabled !== true) {
    config.channels[DINGTALK_CONNECTOR_PLUGIN_ID] = {
      ...existingChannel,
      enabled: false,
    };
    return;
  }

  const gatewayToken = ensureGatewayAuthTokenInConfig(config);
  ensureDingtalkGatewayHttpEndpoint(config);

  const fallbackTimeout = normalizeDingtalkSessionTimeout(
    existingChannel.sessionTimeout,
    DEFAULT_DINGTALK_SESSION_TIMEOUT_MS
  );

  config.channels[DINGTALK_CONNECTOR_PLUGIN_ID] = {
    ...existingChannel,
    enabled: true,
    clientId: String(params.clientId ?? "").trim(),
    clientSecret: String(params.clientSecret ?? "").trim(),
    gatewayToken,
    sessionTimeout: normalizeDingtalkSessionTimeout(params.sessionTimeout, fallbackTimeout),
  };
}
