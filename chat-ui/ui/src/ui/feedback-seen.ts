// 反馈 thread 的"已读"时间戳本地持久化。
// 用于在 OneClaw 启动 / 重新进入反馈面板时识别"过去未读"——
// 即客户端不在线（或没订阅 SSE）期间后端推送的回复。
//
// 数据结构：{ [threadId: string]: ISO 时间戳 }，记录该 thread 上次"已被用户看到"的时刻。
// 判断未读的方式：thread.last_reply_at（或 updated_at）> seenMap[id] → 未读。

const STORAGE_KEY = "openclaw.feedback.seen.v1";

export type FeedbackSeenMap = Record<string, string>;

export function loadFeedbackSeenMap(): FeedbackSeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveFeedbackSeenMap(map: FeedbackSeenMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // 容忍 quota / 隐私模式失败：UI 不应因 localStorage 不可用而崩溃
  }
}

/** 把 ISO 时间戳转 ms；解析失败返回 0 */
function toMs(iso: string | null | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isNaN(n) ? 0 : n;
}

/** 把 thread 标记为"已读到现在为止"。幂等 + 单调推进（只前进不倒退）。 */
export function markFeedbackThreadSeen(threadId: number, at: string = new Date().toISOString()): void {
  const map = loadFeedbackSeenMap();
  const key = String(threadId);
  const existing = map[key];
  // 若新时间戳比已有的还早（SSE 乱序 / 时钟回退等），保留已有值，避免误判未读
  if (existing && toMs(at) < toMs(existing)) return;
  map[key] = at;
  saveFeedbackSeenMap(map);
}

type ThreadActivity = {
  id: number;
  has_reply?: boolean;
  last_reply_at?: string | null;
  updated_at?: string;
};

/** 时间戳比较容差：服务端 `last_reply_at` 和 `message.created_at` 可能有几百毫秒的精度差异，
 *  不在容差内的差距才视为"确有新消息"。 */
const UNREAD_TOLERANCE_MS = 2000;

/**
 * 判断 thread 是否有"过去未读"：后端最近活动时间 > 本地上次已读时间（带 2s 容差）。
 * 解析为 Date 做数值比较，避免 ISO 字符串精度不同导致的误判
 * （如 "...10:40:00Z" vs "...10:40:00.123Z"）。
 */
export function isThreadUnread(thread: ThreadActivity, seenMap: FeedbackSeenMap): boolean {
  // 没有任何回复活动的 thread 不算未读
  if (!thread.has_reply) return false;
  const last = thread.last_reply_at || thread.updated_at;
  if (!last) return false;
  const seen = seenMap[String(thread.id)];
  if (!seen) return true; // 有回复但从没看过 → 未读
  return toMs(last) - toMs(seen) > UNREAD_TOLERANCE_MS;
}
