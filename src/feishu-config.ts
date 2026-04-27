export const FEISHU_CHANNEL_ID = "feishu";

type MutableRecord = Record<string, any>;

function isRecord(value: unknown): value is MutableRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function ensureRecord(parent: MutableRecord, key: string): MutableRecord {
  if (!isRecord(parent[key])) {
    parent[key] = {};
  }
  return parent[key];
}

function getLegacyFeishuPluginEntry(config: any): MutableRecord | null {
  const entry = config?.plugins?.entries?.[FEISHU_CHANNEL_ID];
  return isRecord(entry) ? entry : null;
}

function getLegacyFeishuEnabled(config: any): boolean | undefined {
  const enabled = getLegacyFeishuPluginEntry(config)?.enabled;
  return typeof enabled === "boolean" ? enabled : undefined;
}

function clearLegacyFeishuPluginEntry(config: any): boolean {
  const entries = config?.plugins?.entries;
  if (!isRecord(entries) || !Object.prototype.hasOwnProperty.call(entries, FEISHU_CHANNEL_ID)) {
    return false;
  }

  delete entries[FEISHU_CHANNEL_ID];
  return true;
}

// 迁移前 OneClaw 以 plugins.entries.feishu.enabled 作为设置页开关来源。
export function isFeishuEnabled(config: any): boolean {
  const legacyEnabled = getLegacyFeishuEnabled(config);
  if (typeof legacyEnabled === "boolean") {
    return legacyEnabled;
  }
  return config?.channels?.[FEISHU_CHANNEL_ID]?.enabled === true;
}

export function setFeishuChannelEnabled(config: MutableRecord, enabled: boolean): boolean {
  const channels = ensureRecord(config, "channels");
  const feishu = ensureRecord(channels, FEISHU_CHANNEL_ID);
  const previous = feishu.enabled;
  feishu.enabled = enabled;
  const cleared = clearLegacyFeishuPluginEntry(config);
  return previous !== enabled || cleared;
}

export function migrateLegacyFeishuPluginEntry(config: MutableRecord): boolean {
  const legacyEnabled = getLegacyFeishuEnabled(config);
  if (typeof legacyEnabled !== "boolean") {
    return clearLegacyFeishuPluginEntry(config);
  }
  return setFeishuChannelEnabled(config, legacyEnabled);
}
