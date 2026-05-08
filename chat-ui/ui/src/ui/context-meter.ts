import { lookupContextWindow } from "./context-window.ts";
import type { GatewaySessionRow } from "./types.ts";

export type ContextMeterStats = {
  used: number;
  max: number;
  ratio: number;
  percent: number;
  widthPct: string;
};

function positiveTokenCount(value: unknown): number | null {
  return typeof value === "number" && value > 0 ? value : null;
}

function sessionModel(session: GatewaySessionRow): string | null {
  return typeof session.model === "string" && session.model.trim() ? session.model : null;
}

export function resolveContextMeterMax(session: GatewaySessionRow): number | null {
  const sessionMax = positiveTokenCount(session.contextTokens);
  if (sessionMax) {
    return sessionMax;
  }

  return lookupContextWindow(sessionModel(session));
}

export function resolveContextMeterStats(
  session: GatewaySessionRow,
  dirtySessions?: ReadonlySet<string> | null,
): ContextMeterStats | null {
  // 1. session 在 dirty 集合内（用户刚切了 model 还没拿到下一轮 usage）→ 隐藏。
  if (dirtySessions && dirtySessions.has(session.key)) {
    return null;
  }

  // 2. gateway 还没写过真实 prompt token 数（新会话或从未完成过回复）→ 隐藏。
  const used = typeof session.totalTokens === "number" ? session.totalTokens : 0;
  if (used <= 0) {
    return null;
  }

  const max = resolveContextMeterMax(session) ?? 0;
  if (max <= 0) {
    return null;
  }

  const ratio = Math.min(1, used / max);
  const percent = Math.round(ratio * 100);
  return {
    used,
    max,
    ratio,
    percent,
    widthPct: (ratio * 100).toFixed(1),
  };
}

// 用户切换模型时调用：把当前会话标记为「等下一轮 usage 落库再显示进度条」。
export function markSessionMeterDirty(set: Set<string>, sessionKey: string): void {
  if (!sessionKey) return;
  set.add(sessionKey);
}

// usage 刷新时调用：仅当 totalTokens 单调推进（说明 gateway 已写入新一轮 usage）才清除标记。
// 返回值表示是否真的清除了。
export function clearSessionMeterDirtyIfUsageAdvanced(
  set: Set<string>,
  sessionKey: string,
  prevTotal: number,
  nextTotal: number,
): boolean {
  if (!set.has(sessionKey)) return false;
  if (nextTotal > prevTotal) {
    set.delete(sessionKey);
    return true;
  }
  return false;
}
