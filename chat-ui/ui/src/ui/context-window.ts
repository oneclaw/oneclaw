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
 * 目前覆盖 Kimi（Moonshot）、Claude、OpenAI GPT-4o/GPT-5、Gemini 2.0/3、
 * DeepSeek（V3/V3.1/V3.2/R1/V4-Pro/V4-Flash 等 2025-2026 型号）、
 * Qwen（Qwen3-Max/Coder、Qwen3.5+/Plus/Flash、Qwen-Turbo、Qwen-Long 等
 * 2025-2026 型号）的常见窗口；未命中任何规则时返回 null，UI 降级为不显示 meter。
 *
 * 接受 `providerKey/modelId` 复合键（{@link ConfiguredModel.key} 格式）、
 * `provider/vendor/modelId` 复合键或裸 modelId。匹配不区分大小写，顺序敏感——
 * 更具体的规则须排在前面。
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

  // Mainstream provider fallbacks used before gateway persists contextTokens
  { pattern: /^gpt-5\.4(?!-mini)(?:-|$)/i, tokens: 1_050_000 },
  { pattern: /^gpt-5(?:\.|-|$)/i, tokens: 400_000 },
  { pattern: /^gpt-4o(?:-|$)/i, tokens: 128_000 },
  { pattern: /^gemini-3(?:\.|-|$)/i, tokens: 1_000_000 },
  { pattern: /^gemini-2\.0(?:-|$)/i, tokens: 1_000_000 },
  // DeepSeek V4 family（2026-04 起，Pro/Flash 均为 1M）
  { pattern: /^deepseek-v4(?:[.\-]|$)/i, tokens: 1_000_000 },
  // DeepSeek 显式分档优先（保留旧约定）
  { pattern: /^deepseek-.*128k(?:-|$)/i, tokens: 128_000 },
  { pattern: /^deepseek-.*64k(?:-|$)/i, tokens: 64_000 },
  // DeepSeek V3 / V3.1 / V3.2(-Exp / -Terminus) — 128k
  { pattern: /^deepseek-v3(?:[.\-]|$)/i, tokens: 131_072 },
  // R1 系列（含 R1-0528 起的 128k 版本）
  { pattern: /^deepseek-r1(?:-|$)/i, tokens: 131_072 },
  // 通用兜底：当前在产 DeepSeek 模型（含 deepseek-chat / deepseek-reasoner / deepseek-coder 等别名）几乎全是 128k+
  { pattern: /^deepseek-/i, tokens: 131_072 },

  // Qwen 1M tier — Plus / Flash 3.5 之后版本
  { pattern: /^qwen3?\.[5-9].*(?:plus|flash)/i, tokens: 1_000_000 },
  // Qwen 1M tier — Turbo（Qwen2.5-Turbo 起 1M）
  { pattern: /^qwen[\d.]*-turbo(?:-|$)/i, tokens: 1_000_000 },
  // Qwen3-Max / Qwen3-Coder — 256k native
  { pattern: /^qwen3-max(?:-|$)/i, tokens: 262_144 },
  { pattern: /^qwen3-coder(?:-|$)/i, tokens: 262_144 },
  // 显式分档
  { pattern: /^qwen.*256k(?:-|$)/i, tokens: 256_000 },
  { pattern: /^qwen.*32k(?:-|$)/i, tokens: 32_000 },
  // Qwen-Long — 官方上限 10M tokens
  { pattern: /^qwen-long(?:-|$)/i, tokens: 10_000_000 },
  // Qwen-Plus 当前快照 — 131k
  { pattern: /^qwen-plus(?:-|$)/i, tokens: 131_072 },
  // Qwen-Max 老快照 — 32k
  { pattern: /^qwen-max(?:-|$)/i, tokens: 32_768 },
  // 通用兜底
  { pattern: /^qwen/i, tokens: 32_000 },
];

/**
 * Extract the model id from a slash-delimited composite key, or return the input
 * unchanged if it does not contain a slash.
 */
export function extractModelId(input: string | null | undefined): string {
  if (!input) return "";
  const idx = input.lastIndexOf("/");
  return idx === -1 ? input : input.slice(idx + 1);
}

/**
 * Look up the context window (in tokens) for a given model. Accepts either
 * a slash-delimited composite key or a bare `modelId`. Returns null when no rule matches.
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
