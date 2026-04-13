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
