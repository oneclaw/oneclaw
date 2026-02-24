import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyAnalyticsErrorType,
  buildActionStartedProps,
  buildActionResultProps,
} from "./analytics-events";

test("classifyAnalyticsErrorType 应识别常见错误类型", () => {
  assert.equal(classifyAnalyticsErrorType("请求超时"), "timeout");
  assert.equal(classifyAnalyticsErrorType("API Key 无效 (401)"), "auth");
  assert.equal(classifyAnalyticsErrorType("网络错误: ECONNRESET"), "network");
  assert.equal(classifyAnalyticsErrorType("Kimi Bot Token 不能为空。"), "validation");
  assert.equal(classifyAnalyticsErrorType("ENOENT: no such file"), "io");
  assert.equal(classifyAnalyticsErrorType("something odd"), "unknown");
});

test("buildActionStartedProps 应补齐 action 并过滤 undefined", () => {
  const props = buildActionStartedProps("save_provider", {
    provider: "openai",
    model: "gpt-5.2",
    ignored: undefined,
  });

  assert.deepEqual(props, {
    action: "save_provider",
    provider: "openai",
    model: "gpt-5.2",
  });
});

test("buildActionResultProps 应输出标准结果字段", () => {
  const props = buildActionResultProps("save_provider", {
    success: false,
    latencyMs: 123,
    errorType: "auth",
    extra: { provider: "openai" },
  });

  assert.deepEqual(props, {
    action: "save_provider",
    success: false,
    latency_ms: 123,
    error_type: "auth",
    provider: "openai",
  });
});
