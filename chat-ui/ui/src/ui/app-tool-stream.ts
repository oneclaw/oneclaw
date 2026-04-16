import { truncateText } from "./format.ts";

const TOOL_STREAM_LIMIT = 50;
const TOOL_STREAM_THROTTLE_MS = 80;
const TOOL_OUTPUT_CHAR_LIMIT = 120_000;

export type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  sessionKey?: string;
  data: Record<string, unknown>;
};

// 每次新 tool call 到来时，把当前在打字的 assistant 文本冻结成一段，挂在这条 tool entry 上。
// 这样渲染时能按"上一段文本 → tool call → tool result → 下一段文本 …"的时间序展开，
// 与 gateway 写进 transcript 的消息形态保持一致（history 加载后也是这样分开展示）。
export type StreamSegment = { text: string; ts: number };

export type ToolStreamEntry = {
  toolCallId: string;
  runId: string;
  sessionKey?: string;
  name: string;
  args?: unknown;
  output?: string;
  startedAt: number;
  updatedAt: number;
  // 该 tool 之前冻结下来的 assistant 文本（若有）。只会设一次，就在 entry 创建那一刻。
  leadingSegment?: StreamSegment;
  // 分成两条 message：call 走 assistant 气泡 + 内联 tool 卡，result 走独立的 toolResult 气泡。
  // 和 history 里的消息形态完全一致，复用同一套 renderGroupedMessage 分支。
  callMessage: Record<string, unknown>;
  resultMessage?: Record<string, unknown>;
};

type ToolStreamHost = {
  sessionKey: string;
  chatRunId: string | null;
  toolStreamById: Map<string, ToolStreamEntry>;
  toolStreamOrder: string[];
  // 已摊平的时间线：segment text / call msg / result msg 混合，供渲染直接 iterate。
  chatToolMessages: Record<string, unknown>[];
  toolStreamSyncTimer: number | null;
  // 当前在打字的 assistant 文本（尚未被任何 tool call 触发冻结，只有这一段闪红光）
  chatStream: string | null;
  chatStreamStartedAt: number | null;
  // handleChatEvent delta 走 raf 节流，pending 是下一帧要写进 chatStream 的值
  chatPendingStreamText: string | null;
};

function extractToolOutputText(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") {
    return record.text;
  }
  const content = record.content;
  if (!Array.isArray(content)) {
    return null;
  }
  const parts = content
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const entry = item as Record<string, unknown>;
      if (entry.type === "text" && typeof entry.text === "string") {
        return entry.text;
      }
      return null;
    })
    .filter((part): part is string => Boolean(part));
  if (parts.length === 0) {
    return null;
  }
  return parts.join("\n");
}

function formatToolOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const contentText = extractToolOutputText(value);
  let text: string;
  if (typeof value === "string") {
    text = value;
  } else if (contentText) {
    text = contentText;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      // oxlint-disable typescript/no-base-to-string
      text = String(value);
    }
  }
  const truncated = truncateText(text, TOOL_OUTPUT_CHAR_LIMIT);
  if (!truncated.truncated) {
    return truncated.text;
  }
  return `${truncated.text}\n\n… truncated (${truncated.total} chars, showing first ${truncated.text.length}).`;
}

// 构造 assistant 侧的 tool call 消息：**不挂 toolCallId 到顶层**。
// 挂了的话 normalizeMessage 会把它归类成 toolResult，渲染走无气泡的 renderCollapsedToolCards 路径；
// 不挂则 role 保持 assistant → 走正常气泡分支，tool card 以折叠形式嵌在气泡里（和 history 一致）。
function buildToolCallMessage(entry: ToolStreamEntry): Record<string, unknown> {
  return {
    role: "assistant",
    runId: entry.runId,
    content: [
      {
        type: "toolCall",
        id: entry.toolCallId,
        name: entry.name,
        arguments: entry.args ?? {},
      },
    ],
    timestamp: entry.startedAt,
  };
}

// 构造 toolResult 消息：走 role=toolResult 路径，自成一个 group，渲染为独立的 "Tool output" 气泡。
function buildToolResultMessage(entry: ToolStreamEntry): Record<string, unknown> {
  return {
    role: "toolResult",
    toolCallId: entry.toolCallId,
    runId: entry.runId,
    content: [{ type: "text", text: entry.output ?? "" }],
    timestamp: entry.updatedAt,
  };
}

function trimToolStream(host: ToolStreamHost) {
  if (host.toolStreamOrder.length <= TOOL_STREAM_LIMIT) {
    return;
  }
  const overflow = host.toolStreamOrder.length - TOOL_STREAM_LIMIT;
  const removed = host.toolStreamOrder.splice(0, overflow);
  for (const id of removed) {
    host.toolStreamById.delete(id);
  }
}

function syncToolStreamMessages(host: ToolStreamHost) {
  // 摊平成时间线：每条 entry 依次贡献 leadingSegment（若有）→ callMessage → resultMessage（若已出）
  const out: Record<string, unknown>[] = [];
  for (const id of host.toolStreamOrder) {
    const entry = host.toolStreamById.get(id);
    if (!entry) {
      continue;
    }
    if (entry.leadingSegment && entry.leadingSegment.text.trim().length > 0) {
      out.push({
        role: "assistant",
        content: [{ type: "text", text: entry.leadingSegment.text }],
        timestamp: entry.leadingSegment.ts,
      });
    }
    out.push(entry.callMessage);
    if (entry.resultMessage) {
      out.push(entry.resultMessage);
    }
  }
  host.chatToolMessages = out;
}

export function flushToolStreamSync(host: ToolStreamHost) {
  if (host.toolStreamSyncTimer != null) {
    clearTimeout(host.toolStreamSyncTimer);
    host.toolStreamSyncTimer = null;
  }
  syncToolStreamMessages(host);
}

export function scheduleToolStreamSync(host: ToolStreamHost, force = false) {
  if (force) {
    flushToolStreamSync(host);
    return;
  }
  if (host.toolStreamSyncTimer != null) {
    return;
  }
  host.toolStreamSyncTimer = window.setTimeout(
    () => flushToolStreamSync(host),
    TOOL_STREAM_THROTTLE_MS,
  );
}

export function resetToolStream(host: ToolStreamHost) {
  host.toolStreamById.clear();
  host.toolStreamOrder = [];
  host.chatToolMessages = [];
  flushToolStreamSync(host);
}

export type CompactionStatus = {
  active: boolean;
  startedAt: number | null;
  completedAt: number | null;
};

type CompactionHost = ToolStreamHost & {
  compactionStatus?: CompactionStatus | null;
  compactionClearTimer?: number | null;
};

const COMPACTION_TOAST_DURATION_MS = 5000;

export function handleCompactionEvent(host: CompactionHost, payload: AgentEventPayload) {
  const data = payload.data ?? {};
  const phase = typeof data.phase === "string" ? data.phase : "";

  // Clear any existing timer
  if (host.compactionClearTimer != null) {
    window.clearTimeout(host.compactionClearTimer);
    host.compactionClearTimer = null;
  }

  if (phase === "start") {
    host.compactionStatus = {
      active: true,
      startedAt: Date.now(),
      completedAt: null,
    };
  } else if (phase === "end") {
    host.compactionStatus = {
      active: false,
      startedAt: host.compactionStatus?.startedAt ?? null,
      completedAt: Date.now(),
    };
    // Auto-clear the toast after duration
    host.compactionClearTimer = window.setTimeout(() => {
      host.compactionStatus = null;
      host.compactionClearTimer = null;
    }, COMPACTION_TOAST_DURATION_MS);
  }
}

export function handleAgentEvent(host: ToolStreamHost, payload?: AgentEventPayload) {
  if (!payload) {
    return;
  }

  // Handle compaction events
  if (payload.stream === "compaction") {
    handleCompactionEvent(host as CompactionHost, payload);
    return;
  }

  if (payload.stream !== "tool") {
    return;
  }
  const sessionKey = typeof payload.sessionKey === "string" ? payload.sessionKey : undefined;
  if (sessionKey && sessionKey !== host.sessionKey) {
    return;
  }
  // Fallback: only accept session-less events for the active run.
  if (!sessionKey && host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (host.chatRunId && payload.runId !== host.chatRunId) {
    return;
  }
  if (!host.chatRunId) {
    return;
  }

  const data = payload.data ?? {};
  const toolCallId = typeof data.toolCallId === "string" ? data.toolCallId : "";
  if (!toolCallId) {
    return;
  }
  const name = typeof data.name === "string" ? data.name : "tool";
  const phase = typeof data.phase === "string" ? data.phase : "";
  const args = phase === "start" ? data.args : undefined;
  const output =
    phase === "update"
      ? formatToolOutput(data.partialResult)
      : phase === "result"
        ? formatToolOutput(data.result)
        : undefined;

  const now = Date.now();
  let entry = host.toolStreamById.get(toolCallId);
  if (!entry) {
    // 新 tool call：把当前 live 的 assistant 文本冻结下来作为这条 entry 的 leadingSegment。
    // 优先 pending（raf 队列里尚未 flush 的最新值），否则用已可见的 chatStream。
    const pending = host.chatPendingStreamText;
    const live = host.chatStream;
    const liveText = (pending ?? live ?? "").trim().length > 0 ? (pending ?? live) : null;
    const leading: StreamSegment | undefined = liveText
      ? { text: liveText, ts: host.chatStreamStartedAt ?? now }
      : undefined;
    if (leading) {
      host.chatStream = null;
      host.chatStreamStartedAt = null;
      host.chatPendingStreamText = null;
    }
    entry = {
      toolCallId,
      runId: payload.runId,
      sessionKey,
      name,
      args,
      output: output || undefined,
      startedAt: typeof payload.ts === "number" ? payload.ts : now,
      updatedAt: now,
      leadingSegment: leading,
      callMessage: {},
    };
    entry.callMessage = buildToolCallMessage(entry);
    if (entry.output !== undefined) {
      entry.resultMessage = buildToolResultMessage(entry);
    }
    host.toolStreamById.set(toolCallId, entry);
    host.toolStreamOrder.push(toolCallId);
  } else {
    entry.name = name;
    if (args !== undefined) {
      entry.args = args;
    }
    if (output !== undefined) {
      entry.output = output || undefined;
    }
    entry.updatedAt = now;
    // 名称/参数变更要反映到 call 消息，但保留其 timestamp（start 时钉住）。
    entry.callMessage = {
      ...buildToolCallMessage(entry),
      timestamp: entry.callMessage.timestamp ?? entry.startedAt,
    };
    if (entry.output !== undefined) {
      entry.resultMessage = buildToolResultMessage(entry);
    }
  }

  trimToolStream(host);
  scheduleToolStreamSync(host, phase === "result");
}
