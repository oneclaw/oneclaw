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
  chatThinkingLevel: string | null;
  chatSending: boolean;
  chatMessage: string;
  chatAttachments: ChatAttachment[];
  chatRunId: string | null;
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  lastError: string | null;
};

export type ChatEventPayload = {
  runId: string;
  sessionKey: string;
  state: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

export async function loadChatHistory(state: ChatState) {
  if (!state.client || !state.connected) {
    return;
  }
  const requestSessionKey = state.sessionKey;
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
    state.chatMessages = deduplicateDeliveryMirrors(raw);
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

  state.chatSending = true;
  state.lastError = null;
  const runId = generateUUID();
  state.chatRunId = runId;
  state.chatStream = "";
  state.chatStreamStartedAt = now;

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
    return null;
  } finally {
    state.chatSending = false;
  }
}

export async function abortChatRun(state: ChatState): Promise<boolean> {
  if (!state.client || !state.connected) {
    return false;
  }
  const runId = state.chatRunId;
  try {
    await state.client.request(
      "chat.abort",
      runId ? { sessionKey: state.sessionKey, runId } : { sessionKey: state.sessionKey },
    );
    return true;
  } catch (err) {
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
      const current = state.chatStream ?? "";
      if (!current || next.length >= current.length) {
        state.chatStream = next;
      }
    }
  } else if (payload.state === "final") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "aborted") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
  } else if (payload.state === "error") {
    state.chatStream = null;
    state.chatRunId = null;
    state.chatStreamStartedAt = null;
    state.lastError = payload.errorMessage ?? "chat error";
  }
  return payload.state;
}
