import test from "node:test";
import assert from "node:assert/strict";

import {
  shouldFinishUsageRefreshAttempt,
  shouldRefreshSessionsForChatState,
} from "./usage-refresh.ts";

test("usage refresh：baseline 缺失时不因第一条旧 row 提前结束轮询", () => {
  assert.equal(shouldFinishUsageRefreshAttempt(null, "100:8192", false), false);
});

test("usage refresh：baseline 缺失时跑完所有轮询后可以结束", () => {
  assert.equal(shouldFinishUsageRefreshAttempt(null, "100:8192", true), true);
});

test("usage refresh：baseline 存在时拿到变化的 usage 即可结束", () => {
  assert.equal(shouldFinishUsageRefreshAttempt("100:8192", "200:131072", false), true);
});

test("usage refresh：baseline 存在但 usage 未变化时最后一轮也要兜底结束", () => {
  assert.equal(shouldFinishUsageRefreshAttempt("100:8192", "100:8192", true), true);
});

test("usage refresh：baseline 存在但当前 row 消失时继续等待", () => {
  assert.equal(shouldFinishUsageRefreshAttempt("100:8192", null, false), false);
});

test("usage refresh：baseline 存在但 row 消失时最后一轮也要兜底结束", () => {
  assert.equal(shouldFinishUsageRefreshAttempt("100:8192", null, true), true);
});

test("chat terminal refresh：final/error/aborted 都刷新 sessions", () => {
  assert.equal(shouldRefreshSessionsForChatState("final"), true);
  assert.equal(shouldRefreshSessionsForChatState("error"), true);
  assert.equal(shouldRefreshSessionsForChatState("aborted"), true);
  assert.equal(shouldRefreshSessionsForChatState("delta"), false);
  assert.equal(shouldRefreshSessionsForChatState(undefined), false);
});
