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

/** 把 thread 标记为"已读到现在为止"。重复调用幂等。 */
export function markFeedbackThreadSeen(threadId: number, at: string = new Date().toISOString()): void {
  const map = loadFeedbackSeenMap();
  map[String(threadId)] = at;
  saveFeedbackSeenMap(map);
}

type ThreadActivity = {
  id: number;
  has_reply?: boolean;
  last_reply_at?: string | null;
  updated_at?: string;
};

/**
 * 判断 thread 是否有"过去未读"：后端最近活动时间 > 本地上次已读时间。
 * 如果完全没有过任何回复（has_reply=false 且无 last_reply_at）→ 不未读，
 * 避免新建尚未被回复的 thread 也被标红。
 */
export function isThreadUnread(thread: ThreadActivity, seenMap: FeedbackSeenMap): boolean {
  // 没有任何回复活动的 thread 不算未读
  if (!thread.has_reply) return false;
  const last = thread.last_reply_at || thread.updated_at;
  if (!last) return false;
  const seen = seenMap[String(thread.id)];
  if (!seen) return true; // 有回复但从没看过 → 未读
  return last > seen;
}
