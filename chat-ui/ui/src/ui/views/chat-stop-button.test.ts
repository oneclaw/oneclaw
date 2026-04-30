// 守护回归：用户停了 OneClaw 报"对话框出来后即使在工作 Stop 按钮也消失"，
// 根因是旧 isBusy = sending || stream !== null —— sending 在 chat.send ack 后立刻回 false，
// stream 在工具间隙被冻成 null，于是 run 仍在却看不到 Stop。fix：把 canAbort（=chatRunId）也并进 isBusy。
import test from "node:test";
import assert from "node:assert/strict";

import { computeStopButtonVisible } from "./chat-stop-button-gate.ts";

test("Stop 按钮：发送 HTTP 在途时显示", () => {
  const r = computeStopButtonVisible({
    sending: true,
    stream: null,
    canAbort: true,
    onAbort: () => {},
  });
  assert.equal(r.showStop, true);
});

test("Stop 按钮：流式打字中显示", () => {
  const r = computeStopButtonVisible({
    sending: false,
    stream: "AI 正在打字中...",
    canAbort: true,
    onAbort: () => {},
  });
  assert.equal(r.showStop, true);
});

test("Stop 按钮：工具调用之间（sending=false / stream=null / runId 仍在）必须显示", () => {
  // 这是回归点：chat.send 已 ack，chatStream 被冻进 leadingSegment，
  // 旧逻辑会把 isBusy 置 false 让 Stop 消失，留下用户只能 kill 进程。
  const r = computeStopButtonVisible({
    sending: false,
    stream: null,
    canAbort: true,
    onAbort: () => {},
  });
  assert.equal(r.showStop, true, "工具调用之间 Stop 仍应可见");
});

test("Stop 按钮：run 已结束（runId 清空）时不显示", () => {
  const r = computeStopButtonVisible({
    sending: false,
    stream: null,
    canAbort: false,
  });
  assert.equal(r.showStop, false);
});

test("Stop 按钮：onAbort 没接（理论上不会发生）时不显示，避免按了没反应", () => {
  const r = computeStopButtonVisible({
    sending: true,
    stream: null,
    canAbort: true,
    // onAbort 缺
  });
  assert.equal(r.showStop, false);
});
