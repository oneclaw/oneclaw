// 统一 Setup 完成态判定：只认最终完成标记，避免半完成状态误判。
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
