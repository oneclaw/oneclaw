import * as fs from "fs";
import * as path from "path";
import { resolveGatewayCwd } from "./constants";

export const WECOM_PLUGIN_ID = "wecom-openclaw-plugin";
export const WECOM_CHANNEL_ID = "wecom";

export type WecomDmPolicy = "pairing" | "open";
export type WecomGroupPolicy = "open" | "allowlist" | "disabled";

export interface ExtractedWecomConfig {
  enabled: boolean;
  botId: string;
  secret: string;
  dmPolicy: WecomDmPolicy;
  groupPolicy: WecomGroupPolicy;
  groupAllowFrom: string[];
}

export interface SaveWecomConfigParams {
  enabled: boolean;
  botId?: string;
  secret?: string;
  dmPolicy?: string;
  groupPolicy?: string;
  groupAllowFrom?: unknown;
}

// 统一解析企业微信插件目录，兼容 dev / packaged 环境。
export function resolveWecomPluginDir(): string {
  return path.join(resolveGatewayCwd(), "extensions", WECOM_PLUGIN_ID);
}

// 检查企业微信插件是否已经随应用一起打包。
export function isWecomPluginBundled(): boolean {
  const pluginDir = resolveWecomPluginDir();
  const hasEntry =
    fs.existsSync(path.join(pluginDir, "index.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.js")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.cjs.js")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.esm.js"));
  return hasEntry && fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}

// 统一规整企业微信私聊策略，非法值回退到默认 pairing。
function normalizeWecomDmPolicy(value: unknown): WecomDmPolicy {
  return value === "open" ? "open" : "pairing";
}

// 统一规整企业微信群策略，非法值回退到默认 open。
function normalizeWecomGroupPolicy(value: unknown): WecomGroupPolicy {
  if (value === "allowlist" || value === "disabled") {
    return value;
  }
  return "open";
}

// 规范化字符串数组，顺手去重并过滤空值。
function normalizeWecomEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );
}

// 当私聊策略是 open 时，确保 allowFrom 含有通配符，避免行为和配置漂移。
function normalizeWecomAllowFrom(dmPolicy: WecomDmPolicy, value: unknown): string[] {
  if (dmPolicy !== "open") {
    return normalizeWecomEntries(value);
  }
  return ["*"];
}

// 从当前用户配置中提取企业微信配置，供设置页回显。
export function extractWecomConfig(config: any): ExtractedWecomConfig {
  const entry = config?.plugins?.entries?.[WECOM_PLUGIN_ID];
  const channel = config?.channels?.[WECOM_CHANNEL_ID];
  return {
    enabled: entry?.enabled === true || channel?.enabled === true,
    botId: typeof channel?.botId === "string" ? channel.botId : "",
    secret: typeof channel?.secret === "string" ? channel.secret : "",
    dmPolicy: normalizeWecomDmPolicy(channel?.dmPolicy),
    groupPolicy: normalizeWecomGroupPolicy(channel?.groupPolicy),
    groupAllowFrom: normalizeWecomEntries(channel?.groupAllowFrom),
  };
}

// 写入企业微信配置时保留高级字段，仅覆盖设置页可管理的核心字段。
export function saveWecomConfig(config: any, params: SaveWecomConfigParams): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.channels ??= {};

  const existingEntry =
    typeof config.plugins.entries[WECOM_PLUGIN_ID] === "object" &&
    config.plugins.entries[WECOM_PLUGIN_ID] !== null
      ? config.plugins.entries[WECOM_PLUGIN_ID]
      : {};
  const existingChannel =
    typeof config.channels[WECOM_CHANNEL_ID] === "object" &&
    config.channels[WECOM_CHANNEL_ID] !== null
      ? config.channels[WECOM_CHANNEL_ID]
      : {};

  config.plugins.entries[WECOM_PLUGIN_ID] = {
    ...existingEntry,
    enabled: params.enabled === true,
  };

  if (params.enabled !== true) {
    config.channels[WECOM_CHANNEL_ID] = {
      ...existingChannel,
      enabled: false,
    };
    return;
  }

  const dmPolicy = normalizeWecomDmPolicy(params.dmPolicy ?? existingChannel.dmPolicy);
  const groupPolicy = normalizeWecomGroupPolicy(params.groupPolicy ?? existingChannel.groupPolicy);
  const nextGroupAllowFrom =
    params.groupAllowFrom === undefined
      ? normalizeWecomEntries(existingChannel.groupAllowFrom)
      : normalizeWecomEntries(params.groupAllowFrom);

  config.channels[WECOM_CHANNEL_ID] = {
    ...existingChannel,
    enabled: true,
    botId: String(params.botId ?? "").trim(),
    secret: String(params.secret ?? "").trim(),
    dmPolicy,
    groupPolicy,
    allowFrom: normalizeWecomAllowFrom(dmPolicy, existingChannel.allowFrom),
    groupAllowFrom: nextGroupAllowFrom,
  };
}
