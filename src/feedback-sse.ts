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

/** Agent 开始为某 thread 跑分析。客户端应显示"AI 正在思考"动画。 */
export type FeedbackEventAgentThinking = {
  type: "agent.thinking";
  thread_id: number;
};

/** Agent 退出（成功或失败）。客户端应隐藏"AI 正在思考"动画。 */
export type FeedbackEventAgentDone = {
  type: "agent.done";
  thread_id: number;
};

/** 当前 thread 处于人工回复模式。客户端应显示"人工回复"提示。 */
export type FeedbackEventManualPending = {
  type: "agent.manual_pending";
  thread_id: number;
};

/** 研发在飞书群执行 /auto on，thread 从人工回复切回自动回复。客户端应清除"人工回复"提示，可选显示"AI 已上线"。 */
export type FeedbackEventAgentOnline = {
  type: "agent.online";
  thread_id: number;
};

export type FeedbackEvent =
  | FeedbackEventMessage
  | FeedbackEventThread
  | FeedbackEventAgentThinking
  | FeedbackEventAgentDone
  | FeedbackEventManualPending
  | FeedbackEventAgentOnline;

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
    if (
      json.type === "message.created" ||
      json.type === "thread.updated" ||
      json.type === "agent.thinking" ||
      json.type === "agent.done" ||
      json.type === "agent.manual_pending" ||
      json.type === "agent.online"
    ) {
      events.push(json as FeedbackEvent);
    }
    // 未知 type 默认丢弃，符合"老客户端遇到未识别 type 应忽略"的约定（见设计文档 §3.1）
  }
  return { events, rest };
}

export class FeedbackSSE extends EventEmitter {
  private req: http.ClientRequest | null = null;
  private reconnectDelay = 1000;
  private closed = false;
  private buffer = "";
  private wasReconnecting = false;
  private lastByteAt = Date.now();
  private watchdog: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(private url: string) {
    super();
  }

  start(): void {
    if (this.watchdog) {
      // 已启动，幂等返回
      return;
    }
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
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
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
        // 通知消费者"连接握手成功"。每次成功建连/重连都会触发，
        // 用于渲染层显示"已连接"状态指示器。
        this.emit("open");
        res.on("data", (chunk: Buffer) => {
          if (this.closed) return;
          this.lastByteAt = Date.now();
          if (this.wasReconnecting) {
            this.wasReconnecting = false;
            this.emit("reconnected");
          }
          this.buffer += chunk.toString("utf-8");
          const { events, rest } = parseSseFrames(this.buffer);
          this.buffer = rest;
          for (const evt of events) {
            this.emit("event", evt);
          }
        });
        res.on("end", () => {
          if (this.closed) return;
          this.scheduleReconnect();
        });
        res.on("error", () => {
          if (this.closed) return;
          this.scheduleReconnect();
        });
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
    this.wasReconnecting = true;
    this.emit("reconnecting");
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
