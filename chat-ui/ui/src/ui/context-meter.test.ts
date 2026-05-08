import test from "node:test";
import assert from "node:assert/strict";

import {
  clearSessionMeterDirtyIfUsageAdvanced,
  markSessionMeterDirty,
  resolveContextMeterMax,
  resolveContextMeterStats,
} from "./context-meter.ts";
import { extractModelId, lookupContextWindow } from "./context-window.ts";

test("context meter：跨会话时优先使用当前 session 持久化窗口", () => {
  const max = resolveContextMeterMax({
    key: "session-a",
    model: "moonshot/moonshot-v1-8k",
    totalTokens: 4096,
    contextTokens: 8192,
  });

  assert.equal(max, 8192);
});

test("context window：provider/model 复合键只取最后一段 model id", () => {
  assert.equal(
    extractModelId("openrouter/anthropic/claude-sonnet-4-6"),
    "claude-sonnet-4-6",
  );
  assert.equal(lookupContextWindow("openrouter/anthropic/claude-sonnet-4-6"), 200_000);
});

test("context meter：缺少 session 模型时不回退到全局 currentModel", () => {
  const max = resolveContextMeterMax({
    key: "session-a",
    totalTokens: 4096,
  });

  assert.equal(max, null);
});

test("context window：为主流 provider 提供保底窗口", () => {
  assert.equal(lookupContextWindow("openai/gpt-4o"), 128_000);
  assert.equal(lookupContextWindow("google/gemini-2.0-flash"), 1_000_000);
  assert.equal(lookupContextWindow("deepseek/deepseek-chat"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-chat-128k"), 128_000);
  assert.equal(lookupContextWindow("qwen/qwen-plus"), 131_072);
  assert.equal(lookupContextWindow("qwen/qwen-long"), 10_000_000);
});

test("context window：覆盖 2025-2026 DeepSeek 主流型号", () => {
  assert.equal(lookupContextWindow("deepseek/deepseek-v4-pro"), 1_000_000);
  assert.equal(lookupContextWindow("deepseek/deepseek-v4-flash"), 1_000_000);
  assert.equal(lookupContextWindow("deepseek/deepseek-v3"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-v3.1"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-v3.1-terminus"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-v3.2-exp"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-r1"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-r1-0528"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-reasoner"), 131_072);
  assert.equal(lookupContextWindow("deepseek/deepseek-coder"), 131_072);
});

test("context window：覆盖 2025-2026 Qwen 主流型号", () => {
  assert.equal(lookupContextWindow("qwen/qwen3.6-plus"), 1_000_000);
  assert.equal(lookupContextWindow("qwen/qwen3.5-plus"), 1_000_000);
  assert.equal(lookupContextWindow("qwen/qwen3.6-flash"), 1_000_000);
  assert.equal(lookupContextWindow("qwen/qwen-turbo"), 1_000_000);
  assert.equal(lookupContextWindow("qwen/qwen-turbo-latest"), 1_000_000);
  assert.equal(lookupContextWindow("qwen/qwen2.5-turbo"), 1_000_000);
  assert.equal(lookupContextWindow("qwen/qwen3-max"), 262_144);
  assert.equal(lookupContextWindow("qwen/qwen3-max-preview"), 262_144);
  assert.equal(lookupContextWindow("qwen/qwen3-coder"), 262_144);
  assert.equal(lookupContextWindow("qwen/qwen3-coder-plus"), 262_144);
  assert.equal(lookupContextWindow("qwen/qwen3-coder-next"), 262_144);
  assert.equal(lookupContextWindow("qwen/qwen-max"), 32_768);
});

test("context window：覆盖当前内置 OpenAI 与 Gemini 预设", () => {
  assert.equal(lookupContextWindow("openai/gpt-5.4"), 1_050_000);
  assert.equal(lookupContextWindow("openai/gpt-5.4-mini"), 400_000);
  assert.equal(lookupContextWindow("openai/gpt-5.2"), 400_000);
  assert.equal(lookupContextWindow("openai/gpt-5.2-codex"), 400_000);
  assert.equal(lookupContextWindow("google/gemini-3.1-pro-preview"), 1_000_000);
  assert.equal(lookupContextWindow("google/gemini-3.1-flash-lite-preview"), 1_000_000);
  assert.equal(lookupContextWindow("google/gemini-3-flash-preview"), 1_000_000);
});

test("context meter：未发过消息（totalTokens 缺失）时 stats 返回 null，无论 dirty 标记是否存在", () => {
  const dirty = new Set<string>(["session-a"]);
  assert.equal(
    resolveContextMeterStats({ key: "session-a", model: "openai/gpt-4o" }, dirty),
    null,
  );
  assert.equal(
    resolveContextMeterStats({ key: "session-a", model: "openai/gpt-4o" }, new Set()),
    null,
  );
});

test("context meter：已发过消息且 sessionKey 不在 dirty Set 内时返回正常 stats", () => {
  const stats = resolveContextMeterStats(
    {
      key: "s1",
      model: "openai/gpt-4o",
      totalTokens: 50_000,
      contextTokens: 128_000,
    },
    new Set<string>(),
  );

  assert.deepEqual(stats, {
    used: 50_000,
    max: 128_000,
    ratio: 50_000 / 128_000,
    percent: 39,
    widthPct: "39.1",
  });
});

test("context meter：已发过消息但 sessionKey 在 dirty Set 内时隐藏", () => {
  const stats = resolveContextMeterStats(
    {
      key: "s1",
      model: "openai/gpt-4o",
      totalTokens: 50_000,
      contextTokens: 128_000,
    },
    new Set<string>(["s1"]),
  );

  assert.equal(stats, null);
});

test("context meter：跨 session 的 dirty 标记不影响目标 session 显示", () => {
  const stats = resolveContextMeterStats(
    {
      key: "s1",
      model: "openai/gpt-4o",
      totalTokens: 50_000,
      contextTokens: 128_000,
    },
    new Set<string>(["s2"]),
  );

  assert.deepEqual(stats, {
    used: 50_000,
    max: 128_000,
    ratio: 50_000 / 128_000,
    percent: 39,
    widthPct: "39.1",
  });
});

test("markSessionMeterDirty：把 sessionKey 加入 Set", () => {
  const dirty = new Set<string>();
  markSessionMeterDirty(dirty, "session-a");
  assert.equal(dirty.has("session-a"), true);
  // 再次调用幂等
  markSessionMeterDirty(dirty, "session-a");
  assert.equal(dirty.size, 1);
});

test("markSessionMeterDirty：空 sessionKey 不入 Set", () => {
  const dirty = new Set<string>();
  markSessionMeterDirty(dirty, "");
  assert.equal(dirty.size, 0);
});

test("clearSessionMeterDirtyIfUsageAdvanced：nextTotal > prevTotal 时移除", () => {
  const dirty = new Set<string>(["s1"]);
  const cleared = clearSessionMeterDirtyIfUsageAdvanced(dirty, "s1", 1000, 1500);
  assert.equal(cleared, true);
  assert.equal(dirty.has("s1"), false);
});

test("clearSessionMeterDirtyIfUsageAdvanced：nextTotal === prevTotal 时不变", () => {
  const dirty = new Set<string>(["s1"]);
  const cleared = clearSessionMeterDirtyIfUsageAdvanced(dirty, "s1", 1000, 1000);
  assert.equal(cleared, false);
  assert.equal(dirty.has("s1"), true);
});

test("clearSessionMeterDirtyIfUsageAdvanced：nextTotal < prevTotal 时也不变（防止异常回退误清）", () => {
  const dirty = new Set<string>(["s1"]);
  const cleared = clearSessionMeterDirtyIfUsageAdvanced(dirty, "s1", 1000, 500);
  assert.equal(cleared, false);
  assert.equal(dirty.has("s1"), true);
});

test("clearSessionMeterDirtyIfUsageAdvanced：sessionKey 不在 Set 时为 no-op", () => {
  const dirty = new Set<string>(["other"]);
  const cleared = clearSessionMeterDirtyIfUsageAdvanced(dirty, "s1", 0, 9999);
  assert.equal(cleared, false);
  assert.equal(dirty.has("other"), true);
});

test("同窗口模型切换组合断言：dirty 一直生效，下一轮 totalTokens 增大后才显示", () => {
  // gpt-4o (128k) → deepseek-v3 (131072) — 不同但都是 128k 级。
  // 这里关键是验证：清除 dirty 不依赖 lookupContextWindow 与 contextTokens 的相等关系。
  const dirty = new Set<string>();
  const session = {
    key: "s1",
    model: "deepseek/deepseek-v3",
    totalTokens: 50_000,
    contextTokens: 128_000, // 仍是切换前 gpt-4o 写入的窗口
  };

  // 1) 切完模型，标 dirty。即使 contextTokens 与 lookup(deepseek-v3)=131_072 不一致也不影响判断。
  markSessionMeterDirty(dirty, "s1");
  assert.equal(resolveContextMeterStats(session, dirty), null);

  // 2) 下一轮 usage 还没回来：totalTokens 没变 → 不清除 → 仍隐藏。
  clearSessionMeterDirtyIfUsageAdvanced(dirty, "s1", 50_000, 50_000);
  assert.equal(resolveContextMeterStats(session, dirty), null);

  // 3) 下一轮 usage 落库：totalTokens 增大 → 清除 → 显示新 stats。
  clearSessionMeterDirtyIfUsageAdvanced(dirty, "s1", 50_000, 60_000);
  const fresh = {
    ...session,
    totalTokens: 60_000,
    contextTokens: 131_072, // 新模型窗口
  };
  const stats = resolveContextMeterStats(fresh, dirty);
  assert.notEqual(stats, null);
  assert.equal(stats!.used, 60_000);
  assert.equal(stats!.max, 131_072);
});
