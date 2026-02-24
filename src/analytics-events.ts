export type AnalyticsErrorType = "validation" | "auth" | "timeout" | "network" | "io" | "unknown";

interface ActionResultPropsInput {
  success: boolean;
  latencyMs: number;
  errorType?: AnalyticsErrorType;
  extra?: Record<string, unknown>;
}

// 过滤 undefined 属性，保证事件属性 schema 稳定。
function sanitizeAnalyticsProps(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output;
}

// 归一化错误文本，统一小写后用于错误类型分类。
function normalizeErrorText(input: unknown): string {
  if (!input) return "";
  if (typeof input === "string") return input.trim().toLowerCase();
  if (input instanceof Error) {
    return `${input.name}: ${input.message}`.trim().toLowerCase();
  }
  return String(input).trim().toLowerCase();
}

// 将离散错误信息映射为稳定枚举，避免看板被自由文本打爆。
export function classifyAnalyticsErrorType(input: unknown): AnalyticsErrorType {
  const text = normalizeErrorText(input);
  if (!text) return "unknown";

  if (
    text.includes("timeout") ||
    text.includes("timed out") ||
    text.includes("超时") ||
    text.includes("abort")
  ) {
    return "timeout";
  }

  if (
    text.includes("401") ||
    text.includes("403") ||
    text.includes("api key 无效") ||
    text.includes("unauthorized") ||
    text.includes("forbidden") ||
    text.includes("auth")
  ) {
    return "auth";
  }

  if (
    text.includes("网络错误") ||
    text.includes("连接错误") ||
    text.includes("econn") ||
    text.includes("enotfound") ||
    text.includes("eai_again") ||
    text.includes("socket") ||
    text.includes("fetch failed")
  ) {
    return "network";
  }

  if (
    text.includes("不能为空") ||
    text.includes("非法") ||
    text.includes("invalid") ||
    text.includes("required") ||
    text.includes("unknown provider") ||
    text.includes("请选择")
  ) {
    return "validation";
  }

  if (
    text.includes("enoent") ||
    text.includes("eacces") ||
    text.includes("eprem") ||
    text.includes("enospc") ||
    text.includes("read") ||
    text.includes("write") ||
    text.includes("unlink")
  ) {
    return "io";
  }

  return "unknown";
}

// 组装 action_started 事件属性，统一注入 action 字段。
export function buildActionStartedProps(
  action: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return sanitizeAnalyticsProps({ action, ...extra });
}

// 组装 action_result 事件属性，统一 success/latency/error 结构。
export function buildActionResultProps(
  action: string,
  input: ActionResultPropsInput,
): Record<string, unknown> {
  const latencyMs =
    Number.isFinite(input.latencyMs) && input.latencyMs >= 0
      ? Math.round(input.latencyMs)
      : 0;
  const errorType = input.success ? undefined : (input.errorType ?? "unknown");

  return sanitizeAnalyticsProps({
    action,
    success: input.success,
    latency_ms: latencyMs,
    error_type: errorType,
    ...(input.extra ?? {}),
  });
}
