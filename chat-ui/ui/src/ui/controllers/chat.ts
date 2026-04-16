import type { GatewayBrowserClient } from "../gateway.ts";
import type { ChatAttachment } from "../ui-types.ts";
import { extractText } from "../chat/message-extract.ts";
import { generateUUID } from "../uuid.ts";

// delivery-mirror 是 gateway 将外发消息镜像写回 transcript 的副本。
// 当 agent 已在 transcript 中写过同文本的 assistant 消息时，mirror 条目是冗余的，
// 显示两条会让用户困惑。此函数按内容指纹去除这类重复。
function deduplicateDeliveryMirrors(messages: unknown[]): unknown[] {
  const seen = new Set<string>();
  return messages.filter((m) => {
    const rec = m as Record<string, unknown>;
    if (rec.role !== "assistant") {
      return true;
    }
    const text = extractText(m)?.trim();
    if (!text) {
      return true;
    }
    // 用内容前 200 字符作为指纹，足够区分不同消息又避免长文本开销
    const fingerprint = text.slice(0, 200);
    if (rec.model === "delivery-mirror") {
      // mirror 条目：仅当同文本 agent 条目已存在时才丢弃
      return !seen.has(fingerprint);
    }
    // 非 mirror 的 assistant 条目：记录指纹
    seen.add(fingerprint);
    return true;
  });
}

export type ChatState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  sessionKey: string;
  chatLoading: boolean;
  chatMessages: unknown[];
  chatVisibleMessageCount: number;
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  chatHistoryHydrationFrame: number | null;
  chatPendingStreamText: string | null;
  chatStreamFrame: number | null;
  // 记录最近一次被用户本地 abort 的 runId：gateway 在卡死或重启前可能仍会把
  // 旧 run 的 delta/final 事件陆续推回，这里用它来幂等丢弃，避免 stop 之后
  // UI 又被旧事件重新拉回 streaming 状态。
  chatAbortedRunId: string | null;
  lastError: string | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

const INITIAL_CHAT_HISTORY_RENDER_COUNT = 20;
const CHAT_HISTORY_RENDER_BATCH = 10;

// 取消历史消息渐进渲染，避免旧帧在 session 切换后继续写状态。
function cancelChatHistoryHydration(state: ChatState) {
  if (state.chatHistoryHydrationFrame !== null) {
    clearTimeout(state.chatHistoryHydrationFrame);
    state.chatHistoryHydrationFrame = null;
  }
}

// 大历史记录先露出一小批，后续逐帧补齐，避免首屏同步渲染把 renderer 卡死。
function scheduleChatHistoryHydration(state: ChatState, sessionKey: string, total: number) {
  cancelChatHistoryHydration(state);
  if (total <= state.chatVisibleMessageCount) {
    return;
  }
  const hydrate = () => {
    state.chatHistoryHydrationFrame = null;
    if (state.sessionKey !== sessionKey) {
      return;
    }
    const next = Math.min(total, state.chatVisibleMessageCount + CHAT_HISTORY_RENDER_BATCH);
    state.chatVisibleMessageCount = next;
    if (next < total) {
      state.chatHistoryHydrationFrame = setTimeout(hydrate, 32) as unknown as number;
    }
  };
  state.chatHistoryHydrationFrame = setTimeout(hydrate, 32) as unknown as number;
}

// chat delta 一帧只提交一次最新文本，别让每个 token 都触发 Lit 全量重渲染。
function scheduleChatStreamFlush(state: ChatState) {
  if (state.chatStreamFrame !== null) {
    return;
  }
  state.chatStreamFrame = requestAnimationFrame(() => {
    state.chatStreamFrame = null;
    if (state.chatPendingStreamText === null) {
      return;
    }
    state.chatStream = state.chatPendingStreamText;
    state.chatPendingStreamText = null;
  });
}

// run 结束时要连同挂起的 stream 帧一起清理，避免旧文本回写脏状态。
function resetChatStreamState(state: ChatState) {
  if (state.chatStreamFrame !== null) {
    cancelAnimationFrame(state.chatStreamFrame);
    state.chatStreamFrame = null;
  }
  state.chatPendingStreamText = null;
  state.chatStream = null;
  state.chatRunId = null;
  state.chatStreamStartedAt = null;
}

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) {
    return;
  }
  const requestSessionKey = state.sessionKey;
  cancelChatHistoryHydration(state);
  state.chatLoading = true;
  state.lastError = null;
  try {
    const res = await state.client.request<{ messages?: Array<unknown>; thinkingLevel?: string }>(
      "chat.history",
      {
        sessionKey: requestSessionKey,
        limit: 200,
      },
    );
    if (state.sessionKey !== requestSessionKey) {
      return;
    }
    const raw = Array.isArray(res.messages) ? res.messages : [];
    const deduplicated = deduplicateDeliveryMirrors(raw);
    state.chatMessages = deduplicated;
    state.chatVisibleMessageCount = Math.min(
      deduplicated.length,
      INITIAL_CHAT_HISTORY_RENDER_COUNT,
    );
    scheduleChatHistoryHydration(state, requestSessionKey, deduplicated.length);
    state.chatThinkingLevel = res.thinkingLevel ?? null;
  } catch (err) {
    if (state.sessionKey !== requestSessionKey) {
      return;
    }
    state.lastError = String(err);
  } finally {
    if (state.sessionKey === requestSessionKey) {
      state.chatLoading = false;
    }
  }
}

function dataUrlToBase64(dataUrl: string): { content: string; mimeType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    return null;
  }
  return { mimeType: match[1], content: match[2] };
}

export async function sendChatMessage(
  state: ChatState,
  message: string,
  attachments?: ChatAttachment[],
  thinkingLevel?: string | null,
): Promise<string | null> {
  if (!state.client || !state.connected) {
    return null;
  }
  // 分离图片附件和文件路径附件
  const imageAttachments = attachments?.filter((a) => a.dataUrl) ?? [];
  const fileAttachments = attachments?.filter((a) => a.filePath && !a.dataUrl) ?? [];
  const hasImages = imageAttachments.length > 0;
  const hasFiles = fileAttachments.length > 0;

  // 文件路径拼到消息前面，让 gateway 自行读取
  const filePaths = fileAttachments.map((a) => a.filePath!);
  const filePrefix = filePaths.length > 0
    ? filePaths.join("\n") + "\n\n"
    : "";
  const msg = (filePrefix + message).trim();

  const hasAttachments = hasImages || hasFiles;
  if (!msg && !hasAttachments) {
    return null;
  }

  const now = Date.now();

  // 构建用户消息内容块（用于本地 UI 显示）
  const contentBlocks: Array<{ type: string; text?: string; source?: unknown }> = [];
  if (msg) {
    contentBlocks.push({ type: "text", text: msg });
  }
  if (hasImages) {
    for (const att of imageAttachments) {
      contentBlocks.push({
        type: "image",
        source: { type: "base64", media_type: att.mimeType, data: att.dataUrl },
      });
    }
  }

  state.chatMessages = [
    ...state.chatMessages,
    {
      role: "user",
      content: contentBlocks,
      timestamp: now,
    },
  ];
  state.chatVisibleMessageCount = state.chatMessages.length;
  cancelChatHistoryHydration(state);

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;
  // 发新消息意味着上一轮本地 abort 的 run 已彻底不相关，清掉旧 runId 避免影响未来判断。
  state.chatAbortedRunId = null;
  state.chatPendingStreamText = null;

  // 只有图片附件走 base64 API，文件路径已拼入消息文本
  const apiAttachments = hasImages
    ? imageAttachments
        .map((att) => {
          const parsed = dataUrlToBase64(att.dataUrl);
          if (!parsed) {
            return null;
          }
          return {
            type: "image",
            mimeType: parsed.mimeType,
            content: parsed.content,
          };
        })
        .filter((a): a is NonNullable<typeof a> => a !== null)
    : undefined;

  try {
    await state.client.request("chat.send", {
      sessionKey: state.sessionKey,
      message: msg,
      deliver: false,
      idempotencyKey: runId,
      attachments: apiAttachments,
      ...(thinkingLevel && thinkingLevel !== "off" ? { thinking: thinkingLevel } : {}),
    });
    return runId;
  } catch (err) {
    const error = String(err);
    state.chatRunId = null;
    state.chatStream = null;
    state.chatStreamStartedAt = null;
    state.lastError = error;
    state.chatMessages = [
      ...state.chatMessages,
      {
        role: "assistant",
        content: [{ type: "text", text: "Error: " + error }],
        timestamp: Date.now(),
      },
    ];
    state.chatVisibleMessageCount = state.chatMessages.length;
    return null;
  } finally {
    state.chatSending = false;
  }
}

// 见 feedback #391：gateway 在工具调用卡死（或嵌套 agent.wait 超时）时，
// 可能永远不会发 final/error 事件。此时前端靠等 gateway 返回来解冻是没希望的。
// 策略：点停止后立刻本地清流，让 UI 恢复响应；chat.abort RPC 再在后台尽力发送，
// 短超时避免悬挂；已终止 run 的后续事件由 chatAbortedRunId 幂等丢弃。
const CHAT_ABORT_RPC_TIMEOUT_MS = 3000;

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  // 先记下待忽略的 runId，再清流；顺序重要：清流会把 chatRunId 置 null。
  if (runId) {
    state.chatAbortedRunId = runId;
  }
  resetChatStreamState(state);
  try {
    const request = state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("chat.abort timed out")),
        CHAT_ABORT_RPC_TIMEOUT_MS,
      );
    });
    try {
      await Promise.race([request, timeout]);
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
    return true;
  } catch (err) {
    // RPC 失败或超时不回滚本地状态：用户已经选择停止，UI 必须保持可用。
    state.lastError = String(err);
    return false;
  }
}

export function handleChatEvent(state: ChatState, payload?: ChatEventPayload) {
  if (!payload) {
    return null;
  }
  if (payload.sessionKey !== state.sessionKey) {
    return null;
  }

  // 用户已本地 abort 过的 run：丢弃其后续事件，避免 delta 把 stream 状态重新拉起来。
  // final 仍往上抛，方便调用方刷新历史（抛到的是对应路径），但不再驱动本 session 的 stream。
  if (payload.runId && state.chatAbortedRunId && payload.runId === state.chatAbortedRunId) {
    if (payload.state === "final") {
      return "final";
    }
    return null;
  }

  // Final from another run (e.g. sub-agent announce): refresh history to show new message.
  // See https://github.com/openclaw/openclaw/issues/1909
  if (payload.runId && state.chatRunId && payload.runId !== state.chatRunId) {
    if (payload.state === "final") {
      return "final";
    }
    return null;
  }

  if (payload.state === "delta") {
    const next = extractText(payload.message);
    if (typeof next === "string") {
      const current = state.chatPendingStreamText ?? state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatPendingStreamText = next;
        scheduleChatStreamFlush(state);
      }
    }
  } else if (payload.state === "final") {
    resetChatStreamState(state);
  } else if (payload.state === "aborted") {
    resetChatStreamState(state);
  } else if (payload.state === "error") {
    resetChatStreamState(state);
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}
