import * as fs from "fs";
import * as path from "path";
import { DEFAULT_PORT, resolveGatewayCwd } from "./constants";

export const KIMI_PLUGIN_ID = "kimi-claw";
export const KIMI_SEARCH_PLUGIN_ID = "kimi-search";
export const DEFAULT_KIMI_BRIDGE_WS_URL = "wss://kimi-claw.dev.kimi.team/api-claw/bots/agent-ws";

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
  return (
    fs.existsSync(path.join(pluginDir, "index.ts")) &&
    fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"))
  );
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
