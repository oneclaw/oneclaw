import assert from "node:assert/strict";
import { GatewayBrowserClient } from "./gateway.ts";

type TimerTask = {
  id: number;
  fn: () => void;
};

class FakeTimers {
  private nextId = 1;
  private tasks = new Map<number, TimerTask>();

  // 提供最小可控定时器，实现手动推进回调。
  setTimeout(fn: () => void): number {
    const id = this.nextId++;
    this.tasks.set(id, { id, fn });
    return id;
  }

  clearTimeout(id: number) {
    this.tasks.delete(id);
  }

  // 顺序执行当前所有待触发回调，模拟时间推进。
  runAll() {
    while (this.tasks.size > 0) {
      const tasks = [...this.tasks.values()].sort((a, b) => a.id - b.id);
      this.tasks.clear();
      for (const task of tasks) {
        task.fn();
      }
    }
  }
}

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: string[] = [];
  readyState = FakeWebSocket.CONNECTING;
  private listeners = new Map<string, Array<(event: any) => void>>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, handler: (event: any) => void) {
    const bucket = this.listeners.get(type) ?? [];
    bucket.push(handler);
    this.listeners.set(type, bucket);
  }

  send(payload: string) {
    this.sent.push(payload);
  }

  close(code = 1000, reason = "") {
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close", { code, reason });
  }

  // 手动触发 open，模拟底层 socket 已建立但握手尚未完成。
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open", {});
  }

  message(data: unknown) {
    this.emit("message", { data });
  }

  private emit(type: string, event: any) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event);
    }
  }
}

function createStorage() {
  const store = new Map<string, string>();
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
}

function installBrowserGlobals(timers: FakeTimers) {
  const storage = createStorage();
  const windowLike = {
    setTimeout: (fn: () => void, _delay?: number) => timers.setTimeout(fn),
    clearTimeout: (id: number) => timers.clearTimeout(id),
    localStorage: storage,
  };

  Object.assign(globalThis, {
    window: windowLike,
    localStorage: storage,
    WebSocket: FakeWebSocket,
  });

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      platform: "test",
      userAgent: "test-agent",
      language: "en-US",
    },
  });
}

async function flushMicrotasks() {
  await Promise.resolve();
}

async function testReconnectNowCancelsScheduledReconnect() {
  FakeWebSocket.instances = [];
  const timers = new FakeTimers();
  installBrowserGlobals(timers);

  const client = new GatewayBrowserClient({ url: "ws://127.0.0.1:18789" });
  client.start();
  assert.equal(FakeWebSocket.instances.length, 1, "首次启动应只创建一条 socket");

  FakeWebSocket.instances[0].close(1006, "boom");
  client.reconnectNow();
  assert.equal(FakeWebSocket.instances.length, 2, "立即重连应只额外创建一条 socket");

  timers.runAll();
  assert.equal(
    FakeWebSocket.instances.length,
    2,
    "旧的退避重连 timer 不应再偷偷创建第三条 socket",
  );
}

async function testRequestMustWaitForHelloHandshake() {
  FakeWebSocket.instances = [];
  const timers = new FakeTimers();
  installBrowserGlobals(timers);

  const client = new GatewayBrowserClient({ url: "ws://127.0.0.1:18789" });
  client.start();
  const socket = FakeWebSocket.instances[0];
  socket.open();

  const requestResult = client.request("node.list").then(
    () => "resolved",
    (error) => `rejected:${error instanceof Error ? error.message : String(error)}`,
  );
  await flushMicrotasks();
  const outcome = await Promise.race([requestResult, Promise.resolve("pending")]);

  assert.notEqual(outcome, "pending", "未完成 hello 握手时，请求不应悬空挂起");
  assert.match(String(outcome), /^rejected:/, "未完成 hello 握手时，请求应立即被拒绝");
  assert.equal(socket.sent.length, 0, "未完成 hello 握手前，不应向 gateway 发送业务请求");

  timers.runAll();
}

async function main() {
  await testReconnectNowCancelsScheduledReconnect();
  await testRequestMustWaitForHelloHandshake();
  console.log("gateway reconnect tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
