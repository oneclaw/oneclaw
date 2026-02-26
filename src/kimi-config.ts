import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PORT, resolveGatewayCwd, resolveUserStateDir } from "./constants";

export const KIMI_PLUGIN_ID = "kimi-claw";
export const KIMI_SEARCH_PLUGIN_ID = "kimi-search";
export const DEFAULT_KIMI_BRIDGE_WS_URL = "wss://www.kimi.com/api-claw/bots/agent-ws";

export interface SaveKimiPluginParams {
  botToken: string;
  gatewayToken: string;
  wsURL: string;
}

// 写入 kimi-claw 插件配置（启用 + bridge/gateway 参数 + log + kimi-search 联动）
export function saveKimiPluginConfig(config: any, params: SaveKimiPluginParams): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};

  const existingEntry =
    typeof config.plugins.entries[KIMI_PLUGIN_ID] === "object" &&
    config.plugins.entries[KIMI_PLUGIN_ID] !== null
      ? config.plugins.entries[KIMI_PLUGIN_ID]
      : {};
  const existingConfig =
    typeof existingEntry.config === "object" && existingEntry.config !== null
      ? existingEntry.config
      : {};

  config.plugins.entries[KIMI_PLUGIN_ID] = {
    ...existingEntry,
    enabled: true,
    config: {
      ...existingConfig,
      bridge: {
        ...(typeof existingConfig.bridge === "object" && existingConfig.bridge !== null
          ? existingConfig.bridge
          : {}),
        mode: "acp",
        url: params.wsURL,
        token: params.botToken,
      },
      gateway: {
        ...(typeof existingConfig.gateway === "object" && existingConfig.gateway !== null
          ? existingConfig.gateway
          : {}),
        url: `ws://127.0.0.1:${DEFAULT_PORT}`,
        token: params.gatewayToken,
        agentId: "main",
      },
      retry: {
        ...(typeof existingConfig.retry === "object" && existingConfig.retry !== null
          ? existingConfig.retry
          : {}),
        baseMs: 1000,
        maxMs: 600000,
        maxAttempts: 0,
      },
      log: { enabled: true },
    },
  };

  // 同步启用 kimi-search 插件
  const existingSearch =
    typeof config.plugins.entries[KIMI_SEARCH_PLUGIN_ID] === "object" &&
    config.plugins.entries[KIMI_SEARCH_PLUGIN_ID] !== null
      ? config.plugins.entries[KIMI_SEARCH_PLUGIN_ID]
      : {};
  config.plugins.entries[KIMI_SEARCH_PLUGIN_ID] = { ...existingSearch, enabled: true };
}

// 解析内置插件目录（packaged/dev 环境统一）
export function resolveKimiPluginDir(): string {
  return path.join(resolveGatewayCwd(), "extensions", KIMI_PLUGIN_ID);
}

// 检查 kimi-claw 插件是否随应用内置（缺失则拒绝写配置，避免网关启动失败）
export function isKimiPluginBundled(): boolean {
  const pluginDir = resolveKimiPluginDir();
  // 入口可能是源码 index.ts 或编译产物 dist/index.js
  const hasEntry =
    fs.existsSync(path.join(pluginDir, "index.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.js"));
  return hasEntry && fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}

// 从已有配置中提取 kimi-claw 插件信息（供 settings 回显）
export function extractKimiConfig(config: any): { enabled: boolean; botToken: string; wsURL: string } {
  const entry = config?.plugins?.entries?.[KIMI_PLUGIN_ID];
  if (!entry || typeof entry !== "object") {
    return { enabled: false, botToken: "", wsURL: "" };
  }
  return {
    enabled: entry.enabled === true,
    botToken: entry.config?.bridge?.token ?? "",
    wsURL: entry.config?.bridge?.url ?? "",
  };
}

// ── Kimi Search 配置 ──

const KIMI_SEARCH_API_KEY_FILE = "kimi-search-api-key";

// sidecar 文件路径（~/.openclaw/credentials/kimi-search-api-key）
function resolveKimiSearchApiKeyPath(): string {
  return path.join(resolveUserStateDir(), "credentials", KIMI_SEARCH_API_KEY_FILE);
}

// 读取 sidecar 文件中的专属 key
export function readKimiSearchDedicatedApiKey(): string {
  try {
    const filePath = resolveKimiSearchApiKeyPath();
    if (!fs.existsSync(filePath)) return "";
    return fs.readFileSync(filePath, "utf-8").trim();
  } catch {
    return "";
  }
}

// 写入专属 key 到 sidecar 文件（空字符串则删除文件）
export function writeKimiSearchDedicatedApiKey(apiKey: string): void {
  const filePath = resolveKimiSearchApiKeyPath();
  const trimmed = apiKey.trim();
  if (!trimmed) {
    try { fs.unlinkSync(filePath); } catch {}
    return;
  }
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, trimmed, "utf-8");
}

// 按优先级解析 kimi-search 的 API key：sidecar 专属 key > 复用 kimi-code provider key
export function resolveKimiSearchApiKey(config: any): string {
  // 1. sidecar 文件中的专属 key
  const dedicatedKey = readKimiSearchDedicatedApiKey();
  if (dedicatedKey) return dedicatedKey;

  // 2. 复用 kimi-code provider 的 key
  const kimiCodingKey = config?.models?.providers?.["kimi-coding"]?.apiKey;
  if (typeof kimiCodingKey === "string" && kimiCodingKey.trim()) {
    return kimiCodingKey.trim();
  }

  return "";
}

// 提取 kimi-search 配置（供 settings 回显）
export function extractKimiSearchConfig(config: any): {
  enabled: boolean;
  apiKey: string;
  isKimiCodeConfigured: boolean;
} {
  const searchEntry = config?.plugins?.entries?.[KIMI_SEARCH_PLUGIN_ID];
  const dedicatedKey = readKimiSearchDedicatedApiKey();
  const kimiCodingKey = config?.models?.providers?.["kimi-coding"]?.apiKey ?? "";
  return {
    enabled: searchEntry?.enabled === true,
    apiKey: dedicatedKey,
    isKimiCodeConfigured: typeof kimiCodingKey === "string" && kimiCodingKey.trim().length > 0,
  };
}

// 写入 kimi-search 启用状态（只写 enabled，不碰 config，避免 schema 校验失败）
export function saveKimiSearchConfig(config: any, params: { enabled: boolean }): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};

  const existing =
    typeof config.plugins.entries[KIMI_SEARCH_PLUGIN_ID] === "object" &&
    config.plugins.entries[KIMI_SEARCH_PLUGIN_ID] !== null
      ? config.plugins.entries[KIMI_SEARCH_PLUGIN_ID]
      : {};

  // 只保留 enabled，清除可能残留的 config 字段
  config.plugins.entries[KIMI_SEARCH_PLUGIN_ID] = {
    ...existing,
    enabled: params.enabled,
  };
  delete config.plugins.entries[KIMI_SEARCH_PLUGIN_ID].config;
}

// 检查 kimi-search 插件是否随应用内置
export function isKimiSearchPluginBundled(): boolean {
  const pluginDir = path.join(resolveGatewayCwd(), "extensions", KIMI_SEARCH_PLUGIN_ID);
  const hasEntry =
    fs.existsSync(path.join(pluginDir, "index.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.js"));
  return hasEntry && fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}
