import { readOneclawConfig } from "./oneclaw-config";

// 旧逻辑保留：检查 openclaw.json 的 wizard.lastRunAt（gateway schema 兼容）
export function isSetupCompleteFromConfig(config: any): boolean {
  if (!config || typeof config !== "object") {
    return false;
  }

  const wizard = config.wizard;
  // 仅当最后一步成功写入 lastRunAt 时，才视为真正完成 Setup。
  return !!(
    wizard &&
    typeof wizard === "object" &&
    typeof wizard.lastRunAt === "string" &&
    wizard.lastRunAt.trim() !== ""
  );
}

// 基于 oneclaw.config.json 判定 Setup 是否完成
export function isOneclawSetupComplete(): boolean {
  const config = readOneclawConfig();
  return !!(config?.setupCompletedAt);
}
