import * as fs from "fs";
import * as path from "path";
import { resolveGatewayPackageDir } from "./constants";

export const QQBOT_PLUGIN_ID = "qqbot";

export interface ExtractedQqbotConfig {
  enabled: boolean;
  appId: string;
  clientSecret: string;
  markdownSupport: boolean;
}

export interface SaveQqbotConfigParams {
  enabled: boolean;
  appId?: string;
  clientSecret?: string;
  markdownSupport?: boolean;
}

// 统一解析 QQ Bot 插件目录。openclaw 自 2026.4.5 起将 @openclaw/qqbot 作为内置
// extension vendor 在自身 dist/extensions/ 下，OneClaw 不再单独 ship 也不需要
// reconcile 到 ~/.openclaw/extensions/。
export function resolveQqbotPluginDir(): string {
  return path.join(resolveGatewayPackageDir(), "dist", "extensions", QQBOT_PLUGIN_ID);
}

// 检查 QQ Bot 插件是否已经随应用一起打包。
export function isQqbotPluginBundled(): boolean {
  const pluginDir = resolveQqbotPluginDir();
  return fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}

// 从当前用户配置中提取 QQ Bot 配置，供设置页回显。
export function extractQqbotConfig(config: any): ExtractedQqbotConfig {
  const entry = config?.plugins?.entries?.[QQBOT_PLUGIN_ID];
  const channel = config?.channels?.[QQBOT_PLUGIN_ID];
  return {
    enabled: entry?.enabled === true || channel?.enabled === true,
    appId: typeof channel?.appId === "string" ? channel.appId : "",
    clientSecret: typeof channel?.clientSecret === "string" ? channel.clientSecret : "",
    markdownSupport: channel?.markdownSupport === true,
  };
}

// 规范化 allowFrom，未配置时默认允许所有发送者触发命令。
function normalizeQqbotAllowFrom(entries: unknown): string[] {
  if (!Array.isArray(entries)) {
    return ["*"];
  }
  const next = Array.from(
    new Set(
      entries
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );
  return next.length > 0 ? next : ["*"];
}

// 写入 QQ Bot 配置时保留高级字段，仅覆盖设置页可管理的核心字段。
export function saveQqbotConfig(config: any, params: SaveQqbotConfigParams): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.channels ??= {};

  const existingEntry =
    typeof config.plugins.entries[QQBOT_PLUGIN_ID] === "object" &&
    config.plugins.entries[QQBOT_PLUGIN_ID] !== null
      ? config.plugins.entries[QQBOT_PLUGIN_ID]
      : {};
  const existingChannel =
    typeof config.channels[QQBOT_PLUGIN_ID] === "object" &&
    config.channels[QQBOT_PLUGIN_ID] !== null
      ? config.channels[QQBOT_PLUGIN_ID]
      : {};

  config.plugins.entries[QQBOT_PLUGIN_ID] = {
    ...existingEntry,
    enabled: params.enabled === true,
  };

  if (params.enabled !== true) {
    config.channels[QQBOT_PLUGIN_ID] = {
      ...existingChannel,
      enabled: false,
    };
    return;
  }

  config.channels[QQBOT_PLUGIN_ID] = {
    ...existingChannel,
    enabled: true,
    appId: String(params.appId ?? "").trim(),
    clientSecret: String(params.clientSecret ?? "").trim(),
    markdownSupport: params.markdownSupport === true,
    allowFrom: normalizeQqbotAllowFrom(existingChannel.allowFrom),
  };

  // 设置页直接写入明文密钥时，清理 file-based 旧配置，避免来源冲突。
  delete config.channels[QQBOT_PLUGIN_ID].clientSecretFile;
}
