# 反馈对话实时化 (SSE) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 OneClaw 客户端通过 SSE 实时接收后端反馈对话的新消息与状态更新，消除"退出再进入"才能看到回复的体验断层。

**Architecture:**
主进程维护一条全局 SSE 长连接（`GET /api/v1/user/events?device_id=X`），解析后端推送的 `message.created` / `thread.updated` / `ping` 帧，通过 IPC 广播到所有 BrowserWindow；渲染层在进入反馈面板时订阅，退出时断开；详情页做消息去重追加，列表页做红点与元信息刷新；用户追问采用乐观更新 + `message.id` 去重避免重复气泡。

**Tech Stack:**
- 主进程：Node `http`/`https`（已有）、`EventEmitter`、`ipcMain`
- 渲染层：Lit、既有 `feedbackPanelState` 单例状态
- 测试：`node:test` + `node:assert/strict`（项目既有约定）
- 协议：SSE（`text/event-stream`），帧格式见 [设计文档 §3.2](../../../../oneclaw-feedback/docs/superpowers/specs/2026-04-13-realtime-chat-design.md#32-帧格式)

**Source spec:** `/Users/moonshot/Code/oneclaw-feedback/docs/superpowers/specs/2026-04-13-realtime-chat-design.md`（后端对接文档，协议即合同）

**Branch:** `feat/realtime-chat-sse`（已创建）

**PR 节奏：** 按 Phase A / Phase B 切分为两个独立可 review 的 PR；Phase A 单独 merge 后后端日志可见 connect/disconnect，不触碰 UI；Phase B 完成端到端体验。

---

## 协议快查（所有任务共用）

### SSE 端点
```
GET ${FEEDBACK_BASE}/user/events?device_id={DEVICE_ID}
Accept: text/event-stream
```
其中 `FEEDBACK_BASE` = `ONECLAW_FEEDBACK_URL` 去掉末尾的 `/feedback`，例如 `https://feedback.oneclaw.cn/api/v1`。

### 帧格式（`\n\n` 分帧）
```
event: message
data: {"type":"message.created","thread_id":123,"message":{...}}

event: ping
data: {}

```

### 事件 JSON schema
```ts
type FeedbackEvent =
  | {
      type: "message.created";
      thread_id: number;
      message: {
        id: number;
        feedback_id: number;
        role: "user" | "agent" | "official";
        content: string;
        file_keys: string[];
        created_at: string;
      };
    }
  | {
      type: "thread.updated";
      thread_id: number;
      thread: {
        id: number;
        status: string;
        last_reply_at: string;
        updated_at: string;
      };
    };
// ping 帧客户端直接丢弃，不投递给业务层
```

### 连接策略
| 项 | 规则 |
|---|---|
| 连接粒度 | 一台设备一条连接（覆盖所有 thread） |
| 建连时机 | 进入 `oneclawView === "feedback"` 时 |
| 断连时机 | 离开 feedback view / 应用退出 |
| 重连 | 指数退避 1s→2s→4s→8s 封顶，连上重置 |
| Watchdog | 60s 内无字节（含 ping）→ `req.destroy()` 触发重连 |
| 断连补偿 | 重连成功后对当前 open detail 触发 `feedback:thread` refetch；列表 refetch `feedback:threads` |
| 去重 | `message.id` 为主键，HTTP echo 与 SSE 事件两条路径必须只渲染一次 |

---

## 文件结构

### 新建
- `src/feedback-sse.ts` — SSE 客户端类（~120 LOC + 测试）
- `src/feedback-sse.test.ts` — 帧解析、重连退避、watchdog 单元测试

### 修改
- `src/feedback-ipc.ts` — 追加 `feedback:subscribe` / `feedback:unsubscribe` 处理器；`feedback:reply` 响应体补全 `message` 字段
- `src/preload.ts` — 暴露 `feedbackSubscribe` / `feedbackUnsubscribe` / `onFeedbackEvent` / `onFeedbackReconnecting`
- `src/main.ts` — 在 `will-quit` 时清理全局 SSE（通过 feedback-ipc 提供的 teardown 句柄）
- `chat-ui/ui/src/ui/views/feedback-dialog.ts` — 扩展 `FeedbackMessage.role` 值域；`FeedbackPanelState` 新增 `unreadThreadIds` / `reconnecting` 字段；sidebar 渲染未读红点
- `chat-ui/ui/src/ui/app-render.ts` — `setOneClawView` 钩子中订阅/取消；新增 `handleFeedbackEvent` 分发函数；`onReplySend` 改为乐观更新模式

**注**：每个文件职责单一，测试紧挨源文件。

---

## Phase A — 主进程 SSE 基础设施（PR A）

### Task 1：SSE 帧解析器（失败测试）

**Files:**
- Create: `src/feedback-sse.test.ts`

- [ ] **Step 1.1：写第一批失败测试（帧解析 + ping 丢弃）**

```ts
// src/feedback-sse.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { parseSseFrames } from "./feedback-sse";

test("parseSseFrames 应按 \\n\\n 切出完整帧并返回剩余 buffer", () => {
  const buf = "event: message\ndata: {\"type\":\"message.created\",\"thread_id\":1,\"message\":{\"id\":10}}\n\nevent: ping\ndata: {}\n\nevent: message\ndata: {\"type\":\"thread";
  const { events, rest } = parseSseFrames(buf);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "message.created");
  assert.equal((events[0] as any).thread_id, 1);
  // ping 被丢弃，不出现在 events 中
  // 不完整的第三帧保留到 rest
  assert.ok(rest.startsWith("event: message\ndata: {\"type\":\"thread"));
});

test("parseSseFrames 遇到无 data 行的帧直接忽略不抛异常", () => {
  const buf = "event: message\n\nevent: message\ndata: {\"type\":\"message.created\",\"thread_id\":2,\"message\":{\"id\":11}}\n\n";
  const { events, rest } = parseSseFrames(buf);
  assert.equal(events.length, 1);
  assert.equal((events[0] as any).thread_id, 2);
  assert.equal(rest, "");
});

test("parseSseFrames 遇到非法 JSON 跳过该帧并继续解析后续帧", () => {
  const buf = "event: message\ndata: {not json}\n\nevent: message\ndata: {\"type\":\"thread.updated\",\"thread_id\":3,\"thread\":{}}\n\n";
  const { events, rest } = parseSseFrames(buf);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "thread.updated");
  assert.equal(rest, "");
});
```

- [ ] **Step 1.2：编译并运行测试，确认全部失败**

Run: `npx tsc -p tsconfig.json && node --test dist/feedback-sse.test.js`
Expected: 3 失败（模块/导出不存在）

### Task 2：实现 FeedbackSSE 基础类

**Files:**
- Create: `src/feedback-sse.ts`

- [ ] **Step 2.1：写最小实现——帧解析纯函数 + 空壳 class**

```ts
// src/feedback-sse.ts
import * as http from "http";
import * as https from "https";
import { EventEmitter } from "events";
import * as log from "./logger";

export type FeedbackEventMessage = {
  type: "message.created";
  thread_id: number;
  message: {
    id: number;
    feedback_id: number;
    role: "user" | "agent" | "official";
    content: string;
    file_keys: string[];
    created_at: string;
  };
};

export type FeedbackEventThread = {
  type: "thread.updated";
  thread_id: number;
  thread: {
    id: number;
    status: string;
    last_reply_at: string;
    updated_at: string;
  };
};

export type FeedbackEvent = FeedbackEventMessage | FeedbackEventThread;

/** 纯函数：把 buffer 切成完整帧，返回解析出的事件和未完成的剩余 buffer。ping 帧被丢弃。 */
export function parseSseFrames(buffer: string): { events: FeedbackEvent[]; rest: string } {
  const events: FeedbackEvent[] = [];
  let rest = buffer;
  while (true) {
    const sepIdx = rest.indexOf("\n\n");
    if (sepIdx === -1) break;
    const frame = rest.slice(0, sepIdx);
    rest = rest.slice(sepIdx + 2);
    const dataLine = frame.split("\n").find((l) => l.startsWith("data:"));
    if (!dataLine) continue;
    const payload = dataLine.slice(5).trim();
    let json: any;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }
    if (!json || typeof json.type !== "string") continue;
    if (json.type === "ping") continue;
    if (json.type === "message.created" || json.type === "thread.updated") {
      events.push(json as FeedbackEvent);
    }
  }
  return { events, rest };
}

export class FeedbackSSE extends EventEmitter {
  private req: http.ClientRequest | null = null;
  private reconnectDelay = 1000;
  private closed = false;
  private buffer = "";
  private lastByteAt = Date.now();
  private watchdog: NodeJS.Timeout | null = null;

  constructor(private url: string) {
    super();
  }

  start(): void {
    this.closed = false;
    this.connect();
    this.watchdog = setInterval(() => {
      if (Date.now() - this.lastByteAt > 60_000) {
        log.warn("SSE watchdog: 60s 未收到字节，重连");
        this.req?.destroy();
      }
    }, 10_000);
  }

  stop(): void {
    this.closed = true;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.req?.destroy();
    this.req = null;
  }

  private connect(): void {
    if (this.closed) return;
    const parsed = new URL(this.url);
    const mod = parsed.protocol === "https:" ? https : http;
    this.req = mod.request(
      parsed,
      { method: "GET", headers: { Accept: "text/event-stream" } },
      (res) => {
        if (res.statusCode !== 200) {
          log.warn(`SSE 非 200 状态码: ${res.statusCode}，调度重连`);
          this.scheduleReconnect();
          return;
        }
        this.reconnectDelay = 1000;
        this.lastByteAt = Date.now();
        log.info("SSE 连接已建立");
        res.on("data", (chunk: Buffer) => {
          this.lastByteAt = Date.now();
          this.buffer += chunk.toString("utf-8");
          const { events, rest } = parseSseFrames(this.buffer);
          this.buffer = rest;
          for (const evt of events) {
            this.emit("event", evt);
          }
        });
        res.on("end", () => this.scheduleReconnect());
        res.on("error", () => this.scheduleReconnect());
      },
    );
    this.req.on("error", (err) => {
      log.warn(`SSE 请求错误: ${err.message}`);
      this.scheduleReconnect();
    });
    this.req.end();
  }

  private scheduleReconnect(): void {
    if (this.closed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
    this.emit("reconnecting");
    setTimeout(() => this.connect(), delay);
  }
}
```

- [ ] **Step 2.2：重新编译并运行测试**

Run: `npx tsc -p tsconfig.json && node --test dist/feedback-sse.test.js`
Expected: 3 通过

- [ ] **Step 2.3：提交**

```bash
git add src/feedback-sse.ts src/feedback-sse.test.ts
git commit -m "feat(feedback-sse): 帧解析器 + SSE 客户端骨架"
```

### Task 3：注册 IPC `feedback:subscribe` / `feedback:unsubscribe`

**Files:**
- Modify: `src/feedback-ipc.ts`（追加在 `registerFeedbackIpc` 末尾，引入 `FeedbackSSE`）
- Modify: `src/main.ts`（在 `will-quit` 里调用 teardown）

- [ ] **Step 3.1：在 feedback-ipc.ts 顶部追加导入**

```ts
// 在已有 import 下追加
import { BrowserWindow as _BW } from "electron"; // （已导入过 BrowserWindow 则跳过，保持只导入一次）
import { FeedbackSSE } from "./feedback-sse";
```

实际操作：确认文件第 1 行 `import { ipcMain, app, BrowserWindow, dialog } from "electron";` 已含 `BrowserWindow`，无需重复导入；只需新增：

```ts
import { FeedbackSSE } from "./feedback-sse";
```

- [ ] **Step 3.2：在文件顶部（`registerFeedbackIpc` 之外）声明模块级 SSE 单例与 teardown 导出**

```ts
// 放在 registerFeedbackIpc 定义之前
let sseClient: FeedbackSSE | null = null;

/** 应用退出时调用，强制停止 SSE 连接 */
export function stopFeedbackSse(): void {
  sseClient?.stop();
  sseClient = null;
}
```

- [ ] **Step 3.3：在 `registerFeedbackIpc(deps)` 函数体末尾（`feedback:submit` 之后、函数闭合花括号之前）追加两个 handler**

```ts
// feedback:subscribe — 建立 SSE 长连接（幂等）
ipcMain.handle("feedback:subscribe", () => {
  if (sseClient) return { ok: true };
  const deviceId = readDeviceId();
  const base = FEEDBACK_URL.replace(/\/feedback\/?$/, "");
  const url = `${base}/user/events?device_id=${encodeURIComponent(deviceId)}`;
  log.info(`feedback:subscribe 建立 SSE 连接: ${base}/user/events`);
  sseClient = new FeedbackSSE(url);
  sseClient.on("event", (evt) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("feedback:event", evt);
    }
  });
  sseClient.on("reconnecting", () => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed()) w.webContents.send("feedback:reconnecting");
    }
  });
  sseClient.start();
  return { ok: true };
});

// feedback:unsubscribe — 主动断开（用户离开反馈面板时）
ipcMain.handle("feedback:unsubscribe", () => {
  sseClient?.stop();
  sseClient = null;
  log.info("feedback:unsubscribe SSE 已停止");
  return { ok: true };
});
```

- [ ] **Step 3.4：在 main.ts 的 `will-quit` 钩子中调用 `stopFeedbackSse`**

先搜索 `will-quit` 以确认位置：

Run: `grep -n "will-quit" src/main.ts`

在文件顶部 import 区追加：

```ts
import { registerFeedbackIpc, stopFeedbackSse } from "./feedback-ipc";
```
（替换已有的 `import { registerFeedbackIpc } from "./feedback-ipc";`）

在 `app.on("will-quit", ...)` 的回调体内最前面加一行：

```ts
stopFeedbackSse();
```

（若 main.ts 没有 `will-quit` 监听，则在 `registerFeedbackIpc({...})` 调用之后追加：

```ts
app.on("will-quit", () => {
  stopFeedbackSse();
});
```

）

- [ ] **Step 3.5：类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 error

- [ ] **Step 3.6：提交**

```bash
git add src/feedback-ipc.ts src/main.ts
git commit -m "feat(feedback-ipc): subscribe/unsubscribe IPC + 应用退出清理"
```

### Task 4：preload.ts 暴露 API

**Files:**
- Modify: `src/preload.ts`

- [ ] **Step 4.1：在已有 feedback 相关方法之后（约 line 189 后）追加**

```ts
  // SSE 订阅：建连 / 断开
  feedbackSubscribe: () => ipcRenderer.invoke("feedback:subscribe"),
  feedbackUnsubscribe: () => ipcRenderer.invoke("feedback:unsubscribe"),

  // SSE 事件监听（返回 unsubscribe 函数，遵循项目既有 onGatewayReady / onAppNavigate 模式）
  onFeedbackEvent: (cb: (evt: unknown) => void) => {
    const listener = (_e: unknown, evt: unknown) => cb(evt);
    ipcRenderer.on("feedback:event", listener);
    return () => ipcRenderer.removeListener("feedback:event", listener);
  },
  onFeedbackReconnecting: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("feedback:reconnecting", listener);
    return () => ipcRenderer.removeListener("feedback:reconnecting", listener);
  },
```

- [ ] **Step 4.2：类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 error

- [ ] **Step 4.3：提交**

```bash
git add src/preload.ts
git commit -m "feat(preload): 暴露 feedback SSE 订阅 API"
```

### Task 5：完整构建 + 冒烟验证（后端日志观测）

- [ ] **Step 5.1：完整构建**

Run: `npm run build`
Expected: 成功，无 error

- [ ] **Step 5.2：启动开发模式**

Run: `npm run dev`

- [ ] **Step 5.3：在 DevTools Console 里手动触发订阅（因为 Phase A 没改 UI）**

DevTools → Console：
```js
await window.oneclaw.feedbackSubscribe();
```

- [ ] **Step 5.4：检查服务端日志**

联系后端同学或在后端 Pod 执行：
```
kubectl logs -n growth -l app=oneclaw-feedback -f | grep -E 'event subscriber (connected|disconnected)'
```
Expected: 看到 `event subscriber connected: device_id=<X>`

- [ ] **Step 5.5：调用 unsubscribe 并确认日志**

DevTools Console：
```js
await window.oneclaw.feedbackUnsubscribe();
```
Expected: 后端日志出现 `event subscriber disconnected`

- [ ] **Step 5.6：Phase A 结束——推送分支并开 PR**

```bash
git push -u origin feat/realtime-chat-sse
```

创建 PR A：
```bash
gh pr create --title "feat(feedback): SSE 订阅主进程基础设施 (Phase A)" --body "$(cat <<'EOF'
## Summary
- 新增 FeedbackSSE 客户端类：帧解析纯函数 + 指数退避重连 + 60s watchdog
- IPC 注册：feedback:subscribe / feedback:unsubscribe，单例模式
- preload 暴露：feedbackSubscribe / feedbackUnsubscribe / onFeedbackEvent / onFeedbackReconnecting
- will-quit 清理全局 SSE

## 协议
见 [设计文档](../oneclaw-feedback/docs/superpowers/specs/2026-04-13-realtime-chat-design.md)

## Test plan
- [ ] node --test 单测全部通过（3 条帧解析测试）
- [ ] DevTools Console 手动调用 feedbackSubscribe 后，后端日志显示 `event subscriber connected`
- [ ] 调用 feedbackUnsubscribe 后，后端日志显示 `event subscriber disconnected`
- [ ] UI 不受影响（此 PR 不改渲染层）

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> ⚠️ **确认点**：push / create PR 前请确认用户授权（遵循项目 `docs/gotchas.md` 第 12 条原则）。

---

## Phase B — 渲染层订阅与实时渲染（PR B）

### Task 6：扩展 FeedbackMessage 类型 + 乐观更新标记

**Files:**
- Modify: `chat-ui/ui/src/ui/views/feedback-dialog.ts`（line 187-194、line 196-247）

- [ ] **Step 6.1：扩展 `FeedbackMessage` 接口**

把 `chat-ui/ui/src/ui/views/feedback-dialog.ts:187-194` 替换为：

```ts
interface FeedbackMessage {
  id: number;
  thread_id: number;          // 保留 UI 内部字段，SSE 入口将 feedback_id → thread_id 映射
  role: "user" | "admin" | "agent" | "official";
  content: string;
  file_keys: string[];
  created_at: string;
  _pending?: boolean;          // 乐观更新标记：true = 临时气泡，灰度+重试状态
  _failed?: boolean;           // 发送失败标记
  _tempKey?: string;           // 客户端生成的 uuid，用于 HTTP 响应到达时替换
}
```

- [ ] **Step 6.2：扩展 `FeedbackPanelState`**

把 `FeedbackPanelState` 接口（line 196-221）追加两个字段：

```ts
  // 实时化相关
  unreadThreadIds: number[];   // 未读 thread id 列表，进入详情时清除该 id
  sseReconnecting: boolean;    // 当前是否在重连中（顶部状态条使用）
```

同步修改 `createFeedbackPanelState()`（line 223-247）的 return 对象，追加：

```ts
    unreadThreadIds: [],
    sseReconnecting: false,
```

- [ ] **Step 6.3：sidebar 渲染区分 agent/official 视觉一致（设计文档 §3.3 建议）**

在 `renderDetailContent` 中渲染消息气泡时，把既有针对 `role === "admin"` 的样式扩展为：`role !== "user"` 统一走"官方回复"样式。搜索 `role === "admin"`：

Run: `grep -n 'role === ' chat-ui/ui/src/ui/views/feedback-dialog.ts`

对每个匹配用以下等价替换（保留含义，但允许 agent/official）：

```ts
// before
message.role === "admin"
// after
message.role !== "user"
```

`_pending` 消息额外加 opacity：在渲染 message 的 class 里追加：

```ts
class="feedback-message ${message.role !== "user" ? "feedback-message--admin" : "feedback-message--user"} ${message._pending ? "feedback-message--pending" : ""} ${message._failed ? "feedback-message--failed" : ""}"
```

- [ ] **Step 6.4：给未读 thread 添加红点样式——在 sidebar 渲染处**

`feedback-dialog.ts` 中 `renderSidebarNav` 的 thread 按钮部分（line 340-354），把 `${thread.has_reply ? html\`<span class="feedback-layout__nav-badge">...` 扩展：

```ts
${thread.has_reply || state.unreadThreadIds.includes(thread.id)
  ? html`<span class="feedback-layout__nav-badge">${t("feedback.hasReply")}</span>`
  : nothing}
```

- [ ] **Step 6.5：重新构建并确认无 TS error**

Run: `cd chat-ui/ui && npx vite build`
Expected: 0 error

- [ ] **Step 6.6：提交**

```bash
git add chat-ui/ui/src/ui/views/feedback-dialog.ts
git commit -m "feat(feedback-ui): 扩展消息 role + 未读状态 + 乐观更新字段"
```

### Task 7：进入/离开反馈视图时的订阅生命周期

**Files:**
- Modify: `chat-ui/ui/src/ui/app-render.ts`（line 242-255 `setOneClawView` + 新增 handler）

- [ ] **Step 7.1：在文件顶部 import 区域追加类型（约 line 27 后）**

```ts
// 若 feedback-dialog.ts 需导出这两个类型，先在 feedback-dialog.ts 末尾 export
// export type { FeedbackMessage, FeedbackThread };
import type { FeedbackMessage, FeedbackThread } from "./views/feedback-dialog";
```

对应地在 `chat-ui/ui/src/ui/views/feedback-dialog.ts` 末尾追加：

```ts
export type { FeedbackMessage, FeedbackThread };
```

- [ ] **Step 7.2：在 `app-render.ts` 顶部 SSE 订阅状态变量（line 578 附近 `let feedbackHasReplyGlobal = false;` 之后追加）**

```ts
let feedbackSseUnsub: (() => void) | null = null;
let feedbackReconnectUnsub: (() => void) | null = null;
```

- [ ] **Step 7.3：新增 `handleFeedbackEvent` 分发函数（紧挨 `loadFeedbackThreadDetail` 函数之后）**

```ts
type FeedbackSseEvent =
  | { type: "message.created"; thread_id: number; message: FeedbackMessage & { feedback_id: number } }
  | { type: "thread.updated"; thread_id: number; thread: Partial<FeedbackThread> & { id: number } };

function handleFeedbackEvent(state: AppViewState, evt: FeedbackSseEvent) {
  if (evt.type === "message.created") {
    const incoming: FeedbackMessage = {
      id: evt.message.id,
      thread_id: evt.message.feedback_id ?? evt.thread_id,
      role: evt.message.role,
      content: evt.message.content,
      file_keys: evt.message.file_keys ?? [],
      created_at: evt.message.created_at,
    };
    const openId = feedbackPanelState.detailThread?.id ?? null;
    if (openId === evt.thread_id) {
      // 当前正在看这个 thread → 去重 append
      appendDetailMessageDedup(incoming);
    } else if (incoming.role !== "user") {
      // 其他 thread 且不是自己发的 → 标记未读
      if (!feedbackPanelState.unreadThreadIds.includes(evt.thread_id)) {
        feedbackPanelState = {
          ...feedbackPanelState,
          unreadThreadIds: [...feedbackPanelState.unreadThreadIds, evt.thread_id],
        };
        feedbackHasReplyGlobal = true;
      }
    }
    state.requestUpdate();
  } else if (evt.type === "thread.updated") {
    const idx = feedbackPanelState.threads.findIndex((t) => t.id === evt.thread_id);
    if (idx >= 0) {
      const prev = feedbackPanelState.threads[idx];
      const next = { ...prev, ...evt.thread } as FeedbackThread;
      const threads = [...feedbackPanelState.threads];
      threads[idx] = next;
      feedbackPanelState = { ...feedbackPanelState, threads };
      state.requestUpdate();
    }
  }
}

function appendDetailMessageDedup(msg: FeedbackMessage) {
  const list = feedbackPanelState.detailMessages ?? [];
  // 以 id 为主键去重；兼容 _tempKey（乐观更新时临时占位可能已入列表）
  if (list.some((m) => m.id === msg.id && msg.id > 0)) return;
  const replaced = list.filter((m) => !(m._pending && m._tempKey && msg.role === "user" && m.content === msg.content));
  const merged = [...replaced, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
  feedbackPanelState = { ...feedbackPanelState, detailMessages: merged };
}
```

- [ ] **Step 7.4：新增 `subscribeFeedbackSse` / `unsubscribeFeedbackSse` 辅助函数（紧跟 `handleFeedbackEvent` 之后）**

```ts
function subscribeFeedbackSse(state: AppViewState) {
  if (feedbackSseUnsub) return; // 幂等
  void (window as any).oneclaw?.feedbackSubscribe?.();
  feedbackSseUnsub = (window as any).oneclaw?.onFeedbackEvent?.((evt: FeedbackSseEvent) => {
    handleFeedbackEvent(state, evt);
  }) ?? null;
  feedbackReconnectUnsub = (window as any).oneclaw?.onFeedbackReconnecting?.(() => {
    feedbackPanelState = { ...feedbackPanelState, sseReconnecting: true };
    state.requestUpdate();
    // 重连成功后会继续收事件；最简策略：重连事件触发时顺手刷新一次列表
    loadFeedbackThreads(state);
    const openId = feedbackPanelState.detailThread?.id ?? null;
    if (openId) void loadFeedbackThreadDetail(state, openId);
  }) ?? null;
}

function unsubscribeFeedbackSse() {
  feedbackSseUnsub?.();
  feedbackReconnectUnsub?.();
  feedbackSseUnsub = null;
  feedbackReconnectUnsub = null;
  void (window as any).oneclaw?.feedbackUnsubscribe?.();
}
```

- [ ] **Step 7.5：在 `setOneClawView` 中挂钩（line 242-255）**

把 line 242-255 替换为：

```ts
function setOneClawView(state: AppViewState, next: "chat" | "settings" | "skills" | "workspace" | "cron" | "feedback") {
  const prev = state.settings.oneclawView ?? "chat";
  if (prev === next) {
    return;
  }
  // 离开反馈视图时释放截图数据 + 取消 SSE 订阅
  if (prev === "feedback" && next !== "feedback") {
    feedbackPanelState = { ...feedbackPanelState, newScreenshots: [], newScreenshotPreviews: [], newFileNames: [] };
    unsubscribeFeedbackSse();
  }
  // 进入反馈视图时建立 SSE 订阅
  if (prev !== "feedback" && next === "feedback") {
    subscribeFeedbackSse(state);
  }
  state.applySettings({
    ...state.settings,
    oneclawView: next,
  });
}
```

- [ ] **Step 7.6：在 `onOpenDetail` 中清除该 thread 的未读**

把 `app-render.ts` line 358-360 `onOpenDetail: (id: number) => { void loadFeedbackThreadDetail(state, id); }` 替换为：

```ts
    onOpenDetail: (id: number) => {
      // 清除该 thread 的未读标记
      if (feedbackPanelState.unreadThreadIds.includes(id)) {
        feedbackPanelState = {
          ...feedbackPanelState,
          unreadThreadIds: feedbackPanelState.unreadThreadIds.filter((x) => x !== id),
        };
      }
      void loadFeedbackThreadDetail(state, id);
    },
```

- [ ] **Step 7.7：构建验证**

Run: `cd chat-ui/ui && npx vite build && cd ../..`
Expected: 0 error

- [ ] **Step 7.8：提交**

```bash
git add chat-ui/ui/src/ui/app-render.ts chat-ui/ui/src/ui/views/feedback-dialog.ts
git commit -m "feat(feedback-ui): 进入/离开反馈视图时建立 SSE 订阅 + 事件分发"
```

### Task 8：`feedback:reply` 响应体补全 message 字段（为乐观更新做准备）

**Files:**
- Modify: `src/feedback-ipc.ts`（`postMultipart` + `feedback:reply` handler）

- [ ] **Step 8.1：扩展 FeedbackResult 类型**

在 `src/feedback-ipc.ts:22-28` 把 `FeedbackResult` 改为：

```ts
interface FeedbackResult {
  ok: boolean;
  id?: number;
  message?: unknown;   // POST /messages 时回填刚插入的 message 对象（供乐观更新替换）
  error?: string;
}
```

- [ ] **Step 8.2：`postMultipart` 返回体保留整个 message**

把 line 85-97 的 `res.on("end", ...)` 改为：

```ts
res.on("end", () => {
  try {
    const json = JSON.parse(data);
    if (res.statusCode === 200) {
      // 兼容：json.message（messages POST）或 json.id（feedback 主提交）
      if (json && typeof json === "object" && "message" in json) {
        resolve({ ok: true, id: json.id, message: json.message });
      } else if (json && typeof json === "object" && "id" in json && "content" in json) {
        // 后端直接返回 message 对象（设计文档 §4.6 引用的 thread.go:215 行为）
        resolve({ ok: true, id: json.id, message: json });
      } else {
        resolve({ ok: true, id: json?.id });
      }
    } else {
      resolve({ ok: false, error: json.error || `HTTP ${res.statusCode}` });
    }
  } catch {
    resolve({ ok: false, error: `HTTP ${res.statusCode}` });
  }
});
```

- [ ] **Step 8.3：类型检查**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: 0 error

- [ ] **Step 8.4：提交**

```bash
git add src/feedback-ipc.ts
git commit -m "feat(feedback-ipc): reply 响应体回传完整 message 对象"
```

### Task 9：详情页乐观更新

**Files:**
- Modify: `chat-ui/ui/src/ui/app-render.ts`（`onReplySend` 回调，line 513-532 附近）

- [ ] **Step 9.1：替换 `onReplySend` 为乐观版本**

定位到 `buildFeedbackPanelCallbacks` 中的 `onReplySend`（line ~513），整段替换为：

```ts
    onReplySend: async () => {
      if (!feedbackPanelState.detailThread || (!feedbackPanelState.detailReplyContent.trim() && feedbackPanelState.detailReplyFiles.length === 0)) return;
      const threadId = feedbackPanelState.detailThread.id;
      const content = feedbackPanelState.detailReplyContent;
      const files = feedbackPanelState.detailReplyFiles.length > 0
        ? feedbackPanelState.detailReplyFiles.map((base64, i) => ({ name: feedbackPanelState.detailReplyFileNames[i] || `file-${i + 1}`, base64 }))
        : undefined;

      // 1. 本地先插入临时 pending 气泡
      const tempKey = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const tempMsg: FeedbackMessage = {
        id: 0,
        thread_id: threadId,
        role: "user",
        content,
        file_keys: [],
        created_at: new Date().toISOString(),
        _pending: true,
        _tempKey: tempKey,
      };
      feedbackPanelState = {
        ...feedbackPanelState,
        detailMessages: [...feedbackPanelState.detailMessages, tempMsg],
        detailReplyContent: "",
        detailReplyFiles: [],
        detailReplyFilePreviews: [],
        detailReplyFileNames: [],
        detailReplySending: true,
      };
      state.requestUpdate();

      // 2. 发 POST
      try {
        const result = await window.oneclaw?.feedbackReply?.(threadId, content, files);
        if (result?.ok && result.message) {
          // 3a. 用真实 message 替换临时占位
          const real: FeedbackMessage = {
            id: (result.message as any).id,
            thread_id: (result.message as any).feedback_id ?? threadId,
            role: (result.message as any).role ?? "user",
            content: (result.message as any).content ?? content,
            file_keys: (result.message as any).file_keys ?? [],
            created_at: (result.message as any).created_at ?? tempMsg.created_at,
          };
          const merged = feedbackPanelState.detailMessages
            .filter((m) => m._tempKey !== tempKey)
            .concat(real)
            // id 去重，防止 SSE echo 已先一步到达
            .filter((m, i, arr) => arr.findIndex((x) => x.id === m.id && m.id > 0) === i);
          feedbackPanelState = { ...feedbackPanelState, detailMessages: merged, detailReplySending: false };
        } else if (result?.ok) {
          // 3b. 后端 200 但没回 message（老版本）：保留临时占位，依赖 SSE 替换
          feedbackPanelState = {
            ...feedbackPanelState,
            detailReplySending: false,
          };
        } else {
          // 3c. 失败：把临时气泡标红（保留给用户，避免丢字）
          feedbackPanelState = {
            ...feedbackPanelState,
            detailMessages: feedbackPanelState.detailMessages.map((m) =>
              m._tempKey === tempKey ? { ...m, _pending: false, _failed: true } : m,
            ),
            detailReplySending: false,
          };
        }
      } catch {
        feedbackPanelState = {
          ...feedbackPanelState,
          detailMessages: feedbackPanelState.detailMessages.map((m) =>
            m._tempKey === tempKey ? { ...m, _pending: false, _failed: true } : m,
          ),
          detailReplySending: false,
        };
      }
      state.requestUpdate();
    },
```

- [ ] **Step 9.2：构建验证**

Run: `cd chat-ui/ui && npx vite build && cd ../..`
Expected: 0 error

- [ ] **Step 9.3：提交**

```bash
git add chat-ui/ui/src/ui/app-render.ts
git commit -m "feat(feedback-ui): 追问乐观更新 + id 去重防重复气泡"
```

### Task 10：CSS —— pending/failed/unread 视觉

**Files:**
- Modify: `chat-ui/ui/src/ui/views/feedback-dialog.ts` 或对应的 CSS 文件

- [ ] **Step 10.1：搜索现有样式所在位置**

Run: `grep -rn "feedback-message--admin\|feedback-layout__nav-badge" chat-ui/ui/src/`
找到对应 CSS 文件（多半是 `chat-ui/ui/src/styles.css` 或 Lit 内联 css）。

- [ ] **Step 10.2：在同位置追加 3 条样式**

```css
.feedback-message--pending {
  opacity: 0.55;
}

.feedback-message--failed {
  opacity: 0.9;
  border: 1px solid #c0392b;
}

.feedback-message--failed::after {
  content: "⚠ 发送失败";
  color: #c0392b;
  font-size: 11px;
  display: block;
  margin-top: 4px;
}
```

（红色用 `#c0392b`，严守 CLAUDE.md 设计规则第 1 条：主题红色。）

- [ ] **Step 10.3：构建验证**

Run: `cd chat-ui/ui && npx vite build && cd ../..`
Expected: 0 error

- [ ] **Step 10.4：提交**

```bash
git add chat-ui/ui/src/
git commit -m "style(feedback-ui): pending/failed 气泡视觉 + 未读红点"
```

### Task 11：端到端冒烟测试（与设计文档 §6 验收清单逐项对）

- [ ] **Step 11.1：完整构建 + 启动**

```bash
npm run build
npm run dev
```

- [ ] **Step 11.2：验收 1 — 建连可观测**

操作：点击侧边栏进入反馈视图。
预期：后端日志出现 `event subscriber connected: device_id=<X>`。

- [ ] **Step 11.3：验收 2 — 外部插入消息秒级到气泡**

操作：先打开任意 thread 详情；然后请后端同学用 curl 往该 thread 插一条 message（或用另一台设备 / Postman）。
预期：<3s 内当前详情页出现新气泡，role 为 agent/official 的用"官方回复"样式。

- [ ] **Step 11.4：验收 3 — 自己发追问不重复**

操作：在详情页输入追问，点发送。
预期：
  - 气泡立刻出现（pending 灰度）
  - HTTP 返回后气泡变为正常态
  - SSE echo 到达时气泡**不重复**（列表中只有一条）

- [ ] **Step 11.5：验收 4 — 断网 10s 自愈**

操作：断开网络 10s 再连回。期间后端别人插入 1 条消息。
预期：
  - 网络恢复后主进程自动重连
  - 顶部短暂出现 reconnecting 提示（sseReconnecting=true）
  - 重连成功后 `loadFeedbackThreadDetail` 兜底 refetch，漏的消息出现在列表里

- [ ] **Step 11.6：验收 5 — 离开视图断连**

操作：从反馈视图切回聊天视图。
预期：后端日志出现 `event subscriber disconnected`。

- [ ] **Step 11.7：验收 6 — 合盖 5 分钟**

操作：macOS 合盖 5 分钟再打开。
预期：60s watchdog 检测到静默后 destroy 触发重连；后续仍能收事件。

- [ ] **Step 11.8：验收 7 — 另一个 thread 收到回复置红点**

操作：在列表视图（不进具体 thread 详情），请后端往 thread X 插消息。
预期：sidebar 中 thread X 的 badge 亮起。

- [ ] **Step 11.9：Push & 开 PR B**

```bash
git push
```

创建 PR B：
```bash
gh pr create --title "feat(feedback): 渲染层 SSE 订阅 + 红点 + 乐观更新 (Phase B)" --body "$(cat <<'EOF'
## Summary
- 进入/离开反馈视图时建立/断开 SSE 订阅
- 详情页 message.created 去重追加（id 主键）
- 列表页 thread.updated 更新元信息；未读红点
- 追问乐观更新：pending/failed 视觉 + HTTP echo 替换
- 重连时兜底 refetch，弥补断连漏消息

## Test plan
参照 [设计文档 §6 验收清单](../oneclaw-feedback/docs/superpowers/specs/2026-04-13-realtime-chat-design.md#6-客户端验收清单)：
- [ ] 进入反馈视图，后端日志显示 connected
- [ ] 外部插入消息，<3s 内气泡到达
- [ ] 追问乐观更新 + SSE echo 不重复
- [ ] 断网 10s 自愈 + 漏消息 refetch 补齐
- [ ] 离开视图后端日志显示 disconnected
- [ ] macOS 合盖 5 分钟后仍能收事件
- [ ] 其他 thread 收到回复置红点

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

> ⚠️ **确认点**：push / create PR 前请确认用户授权。

---

## 风险与边界

| 风险 | 对策 |
|---|---|
| 企业代理缓冲导致 SSE 完全失效 | 初版不处理（YAGNI）。后续若发现用户命中，加"60s 零事件 → HTTP 轮询降级"（见设计文档 §5.4） |
| 同 device_id 多窗口 | 后端限制 ≤3 条并发连接，超过踢旧。客户端单主进程一条连接，天然 OK |
| 乐观更新失败用户看到红色气泡但不知道怎么重发 | 初版只标红；后续迭代加"点击重试"按钮 |
| watchdog 误杀正在下载大帧的连接 | SSE 帧都是小 JSON，不会有 60s 还没到一个 data 的场景；若命中再调参 |
| Agent 回复内容很长导致 UI 卡顿 | 超出本次迭代范围，沿用既有消息渲染逻辑 |

---

## 完成标准

- [ ] Phase A PR merge + 后端日志能见到 connect/disconnect
- [ ] Phase B PR merge + 设计文档 §6 验收 7 项全部通过
- [ ] `src/feedback-sse.test.ts` 3 条单测 CI 通过
- [ ] 无 TypeScript error（`tsc --noEmit`）
- [ ] `docs/gotchas.md` 若遇到非平凡坑（如代理缓冲、watchdog 误判）已补充
