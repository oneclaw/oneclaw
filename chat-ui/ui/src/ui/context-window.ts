/**
 * Model → 上下文窗口大小的客户端静态查找表。
 *
 * Context Meter 的分母并非只依赖此表，而是两级回退：
 *   1. session.contextTokens — gateway 每轮对话结束后按实际调用模型写入的动态值，优先使用；
 *   2. lookupContextWindow() — 本文件的静态规则表，仅在以下场景作为兜底：
 *      - 会话尚无对话记录（contextTokens 不存在）
 *      - 用户刚切换模型，旧 contextTokens 已失效但新模型还未完成首轮对话
 *
 * 具体选取逻辑见 views/chat.ts renderContextMeter()。
 *
 * 目前覆盖 Kimi（Moonshot）和 Claude 系列；未命中任何规则时返回 null，
 * UI 降级为纯 token 计数、不显示百分比。
 *
 * 接受 `providerKey/modelId` 复合键（{@link ConfiguredModel.key} 格式）或裸
 * modelId。匹配不区分大小写，顺序敏感——更具体的规则须排在前面。
 */

type ContextWindowRule = {
  /** Regex test against the trailing modelId segment. */
  pattern: RegExp;
  /** Total context window in tokens. */
  tokens: number;
};

// Ordered from most specific to most general. The first match wins.
const CONTEXT_WINDOW_RULES: readonly ContextWindowRule[] = [
  // Claude 1M context variants (must precede the default Claude rule)
  { pattern: /^claude-.*-1m(?:-|$)/i, tokens: 1_000_000 },

  // Moonshot platform — explicit context tier in the model id
  { pattern: /moonshot-v1-128k/i, tokens: 131_072 },
  { pattern: /moonshot-v1-32k/i, tokens: 32_768 },
  { pattern: /moonshot-v1-8k/i, tokens: 8_192 },
  { pattern: /kimi-latest-128k/i, tokens: 131_072 },
  { pattern: /kimi-latest-32k/i, tokens: 32_768 },
  { pattern: /kimi-latest-8k/i, tokens: 8_192 },

  // Kimi K2 family — 256k default
  { pattern: /^kimi-k2/i, tokens: 256_000 },
  { pattern: /^k2p?5?(?:-|$)/i, tokens: 256_000 },

  // Claude default — 200k
  { pattern: /^claude-/i, tokens: 200_000 },
];

/**
 * Extract the model id from a `providerKey/modelId` composite, or return the
 * input unchanged if it does not contain a slash.
 */
export function extractModelId(input: string | null | undefined): string {
  if (!input) return "";
  const idx = input.indexOf("/");
  return idx === -1 ? input : input.slice(idx + 1);
}

/**
 * Look up the context window (in tokens) for a given model. Accepts either
 * `providerKey/modelId` or a bare `modelId`. Returns null when no rule matches.
 */
export function lookupContextWindow(
  modelKey: string | null | undefined,
): number | null {
  const modelId = extractModelId(modelKey);
  if (!modelId) return null;
  for (const rule of CONTEXT_WINDOW_RULES) {
    if (rule.pattern.test(modelId)) {
      return rule.tokens;
    }
  }
  return null;
}
