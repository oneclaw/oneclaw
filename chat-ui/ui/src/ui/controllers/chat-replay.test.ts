// 合成 fixture 回放测试：验证三个流式不变量。
// 不变量：每帧事件处理后，渲染层"已可见 assistant 文本"（evictedLeadingSegments + leadingSegment + chatStream）
// 必须严格等于 chat:delta 携带的"截至当前的累计文本"。
//
// fixture 设计见 ../__fixtures__/streaming-dup.fixture.ts。
import test from "node:test";
import assert from "node:assert/strict";

import { handleChatEvent, type ChatState } from "./chat.ts";
import {
  handleAgentEvent,
  flushToolStreamSync,
  resetToolStream,
  type AgentEventPayload,
} from "../app-tool-stream.ts";
import { TURN1, TURN2, TURN3, type FixtureEntry } from "../__fixtures__/streaming-dup.fixture.ts";

type RafTask = { id: number; fn: FrameRequestCallback };
class FakeRaf {
  private nextId = 1;
  private tasks = new Map<number, RafTask>();
  request = (fn: FrameRequestCallback) => {
    const id = this.nextId++;
    this.tasks.set(id, { id, fn });
    return id;
  };
  cancel = (id: number) => {
    this.tasks.delete(id);
  };
  drain() {
    while (this.tasks.size > 0) {
      const task = [...this.tasks.values()].sort((a, b) => a.id - b.id)[0]!;
      this.tasks.delete(task.id);
      task.fn(0);
    }
  }
}

function installGlobals(raf: FakeRaf) {
  Object.assign(globalThis, {
    requestAnimationFrame: raf.request,
    cancelAnimationFrame: raf.cancel,
    window: {
      requestAnimationFrame: raf.request,
      cancelAnimationFrame: raf.cancel,
      setTimeout: ((fn: () => void) => {
        fn();
        return 0 as unknown as number;
      }) as typeof window.setTimeout,
      clearTimeout: () => {},
    },
    performance: { now: () => 0 },
  });
}

type Host = ChatState & {
  toolStreamById: Map<string, unknown>;
  toolStreamOrder: string[];
  chatToolMessages: Record<string, unknown>[];
  toolStreamSyncTimer: number | null;
  evictedLeadingSegments: { text: string; ts: number }[];
};

function makeHost(sessionKey: string): Host {
  return {
    client: null,
    connected: true,
    sessionKey,
    chatLoading: false,
    chatMessages: [],
    chatVisibleMessageCount: 0,
    chatThinkingLevel: null,
    chatSending: false,
    chatMessage: "",
    chatAttachments: [],
    chatRunId: null,
    chatStream: null,
    chatStreamStartedAt: null,
    chatHistoryHydrationFrame: null,
    chatPendingStreamText: null,
    chatStreamFrame: null,
    chatStreamFrozenPrefix: "",
    lastError: null,
    toolStreamById: new Map(),
    toolStreamOrder: [],
    chatToolMessages: [],
    toolStreamSyncTimer: null,
    evictedLeadingSegments: [],
  } as never;
}

function visibleAssistantText(host: Host): string {
  const parts: string[] = [];
  for (const msg of host.chatToolMessages) {
    const m = msg as Record<string, unknown>;
    if (m.role !== "assistant") continue;
    const content = m.content as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block.type === "text" && typeof block.text === "string") {
        parts.push(block.text);
      }
    }
  }
  if (host.chatStream) {
    parts.push(host.chatStream);
  }
  return parts.join("");
}

// 喂一段事件到 host；每条 chat:delta/final 后断言"渲染可见文本 == 该帧累计文本"。
function feed(host: Host, raf: FakeRaf, events: FixtureEntry[], label: string) {
  let lastFull = "";
  let step = 0;
  for (const entry of events) {
    step++;
    if (entry.event === "chat") {
      // 模拟 sendChatMessage 起一个新 run 时的副作用：handleChatEvent 看 runId 必须匹配
      const runId = (entry.payload as { runId?: string }).runId ?? null;
      const state = (entry.payload as { state?: string }).state;
      if (state === "delta" && host.chatRunId !== runId) {
        host.chatRunId = runId;
      }
      handleChatEvent(host as never, entry.payload as never);
      raf.drain();
      const message = (entry.payload as { message?: unknown }).message as
        | Record<string, unknown>
        | undefined;
      const content = message?.content as Array<Record<string, unknown>> | undefined;
      let full = "";
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b.type === "text" && typeof b.text === "string") full += b.text;
        }
      }
      if (full.length > 0) lastFull = full;
      // chat:final 会调 resetChatStreamState 把 chatStream 清空（gateway 已把消息落到 history，
      // 由其他渲染路径接手），所以 final 后不再校验"渲染==累计"。本测试只关心流式过程中的不变量。
      if (state === "final" || state === "aborted" || state === "error") {
        lastFull = "";
        continue;
      }
    } else if (entry.event === "agent") {
      handleAgentEvent(host as never, entry.payload as AgentEventPayload);
      flushToolStreamSync(host as never);
    }

    if (lastFull.length > 0) {
      const visible = visibleAssistantText(host);
      assert.equal(
        visible,
        lastFull,
        `${label} step #${step} (${entry.event}): ` +
          `预期累计=${JSON.stringify(lastFull)}, 实际渲染=${JSON.stringify(visible)}`,
      );
    }
  }
}

test("不变量 1 — 同一轮内 tool 之间多次说话，前置段不应在 chatStream 里被重复渲染", () => {
  const raf = new FakeRaf();
  installGlobals(raf);
  const host = makeHost("agent:test:fixture");
  feed(host, raf, TURN1, "turn1");
});

test("不变量 2 — 跨 turn 状态 reset：上一轮 frozenPrefix 不能影响下一轮文本切片", () => {
  // 关键：turn1 + turn2 共享同一个 host。
  // 真实场景：用户再发一条消息时，sendUserChatMessage 会先 resetToolStream（清 toolMessages /
  // evictedLeadingSegments / frozenPrefix），然后 sendChatMessage 也会再次把 frozenPrefix 清零。
  // 这里只调 resetToolStream 模拟"用户发新消息"这一帧；如果 resetChatStreamState 没在 turn1
  // 的 final 里清 frozenPrefix，本测试会因 turn1 末尾 frozenPrefix 残留 → resetToolStream 清空 →
  // 但还有另一种回归：若有人改 resetToolStream 不再清 frozenPrefix，turn2 的切片仍会出错。
  // 因此本测试同时覆盖 chat:final 路径和 resetToolStream 路径上的 frozenPrefix 清零。
  const raf = new FakeRaf();
  installGlobals(raf);
  const host = makeHost("agent:test:fixture");
  feed(host, raf, TURN1, "turn1");
  // turn1 结束后 frozenPrefix 必须是空（resetChatStreamState 在 final 时清掉）
  assert.equal(
    host.chatStreamFrozenPrefix,
    "",
    `turn1 final 之后 chatStreamFrozenPrefix 必须为空，实际=${JSON.stringify(host.chatStreamFrozenPrefix)}`,
  );
  // 模拟用户发出 turn2 消息：resetToolStream 清掉上一轮残留的 toolMessages / evictedLeadingSegments
  resetToolStream(host as never);
  feed(host, raf, TURN2, "turn2");
});

test("不变量 3 — eviction：tool 数 > TOOL_STREAM_LIMIT 时首段 leadingSegment 不能被丢", () => {
  const raf = new FakeRaf();
  installGlobals(raf);
  const host = makeHost("agent:test:fixture");
  feed(host, raf, TURN3, "turn3");
  // 至少有一段被搬到 evictedLeadingSegments（51 tools 中第 1 个被淘汰，且其 leadingSegment="首段"）
  assert.ok(
    host.evictedLeadingSegments.length >= 1,
    `evictedLeadingSegments 应至少保留 1 段开场白，实际 length=${host.evictedLeadingSegments.length}`,
  );
});
