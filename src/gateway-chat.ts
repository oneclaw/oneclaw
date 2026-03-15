/**
 * Gateway Chat — 通过 WebSocket RPC (Protocol 3) 发送聊天消息
 *
 * 与 gateway-rpc.ts 的一次性调用不同，此模块需要在连接后监听流式 chat 事件，
 * 收集所有 delta/final 消息直到对话完成。
 */

import * as crypto from "crypto";
import { resolveGatewayPort } from "./constants";
import * as log from "./logger";

const TAG = "[gateway-chat]";

// 同步解码 WebSocket 消息数据
function decodeMessageData(data: unknown): string {
  if (typeof data === "string") return data;
  if (data instanceof ArrayBuffer) return new TextDecoder().decode(data);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return data.toString("utf-8");
  return String(data);
}

/**
 * 从 chat event message 中提取文本
 * 兼容 { content: string } 和 { content: [{ type: "text", text: "..." }] } 两种格式
 */
function extractTextFromMessage(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const m = message as Record<string, unknown>;

  const content = m.content;
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        const item = p as Record<string, unknown>;
        if (item.type === "text" && typeof item.text === "string") {
          return item.text;
        }
        return null;
      })
      .filter((v): v is string => typeof v === "string");
    if (parts.length > 0) return parts.join("\n");
  }

  if (typeof m.text === "string") return m.text;
  return null;
}

/**
 * 通过 WebSocket RPC Protocol 3 发送聊天消息并收集流式回复
 *
 * @param message 用户消息文本
 * @param token Gateway 认证 token
 * @param sessionKey 会话 key（默认 "main"）
 * @param timeoutMs 超时时间（默认 60s，AI 回复可能较慢）
 * @returns AI 回复的完整文本，或 null 表示失败
 */
export function sendChatMessage(
  message: string,
  token: string,
  sessionKey = "main",
  timeoutMs = 60_000,
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const url = `ws://127.0.0.1:${resolveGatewayPort()}/`;
    const connectId = crypto.randomUUID();
    const reqId = crypto.randomUUID();
    const idempotencyKey = crypto.randomUUID();

    // 收集流式文本（每次 delta 覆盖更新，final 时确定最终文本）
    let collectedText = "";

    const done = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(result);
    };

    const timer = setTimeout(() => {
      log.warn(`${TAG} 超时 (${timeoutMs}ms)`);
      done(collectedText || null);
    }, timeoutMs);

    log.info(`${TAG} 连接 ${url}`);
    const ws = new WebSocket(url, {
      headers: { "Origin": `http://127.0.0.1:${resolveGatewayPort()}` },
    } as any);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      log.info(`${TAG} WebSocket 已连接`);
    };

    ws.onmessage = (event: MessageEvent) => {
      let raw: string;
      try {
        raw = decodeMessageData(event.data);
      } catch {
        return;
      }

      let msg: any;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }

      // ── Step 1: 收到 challenge → 发送握手 ──
      if (msg.type === "event" && msg.event === "connect.challenge") {
        log.info(`${TAG} 收到 challenge，发送握手`);
        ws.send(JSON.stringify({
          type: "req",
          id: connectId,
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 3,
            client: {
              id: "openclaw-control-ui",
              displayName: "OneClaw",
              version: "1.0",
              platform: process.platform,
              mode: "webchat",
            },
            auth: { token },
            role: "operator",
            scopes: ["operator.admin", "operator.approvals", "operator.pairing"],
          },
        }));
        return;
      }

      // ── Step 2: 握手响应 → 发送 chat.send ──
      if (msg.type === "res" && msg.id === connectId) {
        if (!msg.ok) {
          log.error(`${TAG} 握手失败: ${JSON.stringify(msg.error)}`);
          done(null);
          return;
        }
        log.info(`${TAG} 握手成功，发送 chat.send`);
        ws.send(JSON.stringify({
          type: "req",
          id: reqId,
          method: "chat.send",
          params: {
            sessionKey,
            message,
            deliver: false,
            idempotencyKey,
          },
        }));
        return;
      }

      // ── Step 3: chat.send 响应（仅确认请求已接收） ──
      if (msg.type === "res" && msg.id === reqId) {
        if (!msg.ok) {
          log.error(`${TAG} chat.send 失败: ${JSON.stringify(msg.error)}`);
          done(null);
          return;
        }
        log.info(`${TAG} chat.send 已接受，等待流式回复...`);
        // 继续等待 chat 事件
        return;
      }

      // ── Step 4: 处理 chat 事件（流式回复） ──
      if (msg.type === "event" && msg.event === "chat") {
        const payload = msg.payload as {
          runId?: string;
          sessionKey?: string;
          state?: string;
          message?: unknown;
          errorMessage?: string;
        } | undefined;

        if (!payload) return;

        // 只处理匹配的 sessionKey
        if (payload.sessionKey && payload.sessionKey !== sessionKey) return;

        if (payload.state === "delta") {
          // delta 事件：提取当前累积文本
          const text = extractTextFromMessage(payload.message);
          if (text) {
            collectedText = text;
          }
        } else if (payload.state === "final") {
          // final 事件：提取最终文本
          const text = extractTextFromMessage(payload.message);
          if (text) {
            collectedText = text;
          }
          log.info(`${TAG} 收到 final，回复长度: ${collectedText.length}`);
          done(collectedText || null);
        } else if (payload.state === "error") {
          log.error(`${TAG} chat 错误: ${payload.errorMessage}`);
          done(null);
        } else if (payload.state === "aborted") {
          log.warn(`${TAG} chat 被中止`);
          done(collectedText || null);
        }
        return;
      }
    };

    ws.onerror = () => {
      log.error(`${TAG} WebSocket 连接失败`);
      done(null);
    };

    ws.onclose = (e: CloseEvent) => {
      log.info(`${TAG} WebSocket 关闭 (code=${e.code})`);
      done(collectedText || null);
    };
  });
}
