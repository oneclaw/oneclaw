import assert from "node:assert/strict";
import { abortChatRun, handleChatEvent, loadChatHistory } from "./chat.ts";

type RafTask = {
  id: number;
  fn: FrameRequestCallback;
};

class FakeRaf {
  private nextId = 1;
  private tasks = new Map<number, RafTask>();

  // 提供最小帧调度器，手动推进 requestAnimationFrame 回调。
  requestAnimationFrame(fn: FrameRequestCallback) {
    const id = this.nextId++;
    this.tasks.set(id, { id, fn });
    return id;
  }

  cancelAnimationFrame(id: number) {
    this.tasks.delete(id);
  }

  runNext() {
    const task = [...this.tasks.values()].sort((a, b) => a.id - b.id)[0];
    if (!task) {
      return;
    }
    this.tasks.delete(task.id);
    task.fn(performance.now());
  }

  runAll() {
    while (this.tasks.size > 0) {
      this.runNext();
    }
  }
}

function installBrowserGlobals(raf: FakeRaf) {
  Object.assign(globalThis, {
    window: {
      requestAnimationFrame: (fn: FrameRequestCallback) => raf.requestAnimationFrame(fn),
      cancelAnimationFrame: (id: number) => raf.cancelAnimationFrame(id),
    },
    requestAnimationFrame: (fn: FrameRequestCallback) => raf.requestAnimationFrame(fn),
    cancelAnimationFrame: (id: number) => raf.cancelAnimationFrame(id),
    performance: { now: () => 0 },
  });
}

function makeState(overrides: Record<string, unknown> = {}) {
  return {
    client: null,
    connected: true,
    sessionKey: "session-1",
    chatLoading: false,
    chatMessages: [],
    chatThinkingLevel: null,
    chatSending: false,
    chatMessage: "",
    chatAttachments: [],
    chatRunId: "run-1",
    chatStream: "",
    chatStreamStartedAt: null,
    chatVisibleMessageCount: 0,
    chatHistoryHydrationFrame: null,
    chatPendingStreamText: null,
    chatStreamFrame: null,
    chatAbortedRunId: null,
    lastError: null,
    ...overrides,
  } as any;
}

async function flushMicrotasks() {
  await Promise.resolve();
}

// stream delta 应在一帧内合并，只保留最新文本，避免每个 token 都触发重渲染。
async function testChatStreamIsRafThrottled() {
  const raf = new FakeRaf();
  installBrowserGlobals(raf);
  const state = makeState();

  handleChatEvent(state, {
    runId: "run-1",
    sessionKey: "session-1",
    state: "delta",
    message: { role: "assistant", content: [{ type: "text", text: "hello" }] },
  });
  handleChatEvent(state, {
    runId: "run-1",
    sessionKey: "session-1",
    state: "delta",
    message: { role: "assistant", content: [{ type: "text", text: "hello world" }] },
  });

  assert.equal(state.chatStream, "", "delta 到达当帧不应立刻写入 Lit state");
  raf.runAll();
  assert.equal(state.chatStream, "hello world", "一帧内应只提交最新的 stream 文本");
}

// 首次加载大量历史消息时，首帧只渲染一个小批次，后续再渐进补齐。
async function testLoadChatHistoryBatchesInitialRender() {
  const raf = new FakeRaf();
  installBrowserGlobals(raf);
  const messages = Array.from({ length: 80 }, (_, index) => ({
    role: "assistant",
    content: [{ type: "text", text: `message-${index}` }],
    timestamp: index,
  }));
  const state = makeState({
    client: {
      request: async () => ({
        messages,
        thinkingLevel: "medium",
      }),
    },
  });

  await loadChatHistory(state);
  await flushMicrotasks();

  assert.equal(state.chatMessages.length, 80, "历史消息仍应完整保存在状态里");
  assert.equal(state.chatVisibleMessageCount, 20, "首帧应只暴露第一批可见消息");

  raf.runNext();
  assert.ok(state.chatVisibleMessageCount > 20, "后续帧应继续扩展可见消息");

  raf.runAll();
  assert.equal(state.chatVisibleMessageCount, 80, "渐进渲染结束后应补齐全部历史消息");
}

// feedback #391：gateway 在工具调用卡死时可能永远不发 final/error 事件；
// 用户点停止后，本地 streaming 状态必须立即解除，且迟到的 delta 不能把它重新拉回来。
async function testAbortImmediatelyClearsStreamAndIgnoresLateDeltas() {
  const raf = new FakeRaf();
  installBrowserGlobals(raf);
  let abortRequested = false;
  const state = makeState({
    client: {
      // 模拟 gateway 挂死：chat.abort 永远不返回
      request: (method: string) => {
        if (method === "chat.abort") {
          abortRequested = true;
          return new Promise(() => {});
        }
        return Promise.resolve({});
      },
    },
    chatRunId: "run-stuck",
    chatStream: "任务处理中…",
    chatStreamStartedAt: 0,
  });

  // abort 不等 RPC 返回，直接立刻解冻，不 await
  const abortPromise = abortChatRun(state);

  // 微任务让 abort 内部完成本地清流
  await flushMicrotasks();

  assert.equal(abortRequested, true, "abort 应发出 chat.abort RPC");
  assert.equal(state.chatRunId, null, "abort 后 chatRunId 必须立刻清空");
  assert.equal(state.chatStream, null, "abort 后 streaming 文本必须立刻清空");
  assert.equal(state.chatAbortedRunId, "run-stuck", "abort 后应记下待忽略的旧 runId");

  // 模拟 gateway 迟到的 delta：不应把 stream 重新激活
  handleChatEvent(state, {
    runId: "run-stuck",
    sessionKey: "session-1",
    state: "delta",
    message: { role: "assistant", content: [{ type: "text", text: "迟到的回复" }] },
  });
  raf.runAll();
  assert.equal(state.chatStream, null, "abort 后，旧 run 的 delta 不得重新开启 streaming");
  assert.equal(state.chatRunId, null, "abort 后，旧 run 的事件不得恢复 chatRunId");

  // 不 await abortPromise：它永远 pending（RPC 超时后 reject，与本测试无关）
  void abortPromise;
}

async function main() {
  await testChatStreamIsRafThrottled();
  await testLoadChatHistoryBatchesInitialRender();
  await testAbortImmediatelyClearsStreamAndIgnoresLateDeltas();
  console.log("chat controller tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
