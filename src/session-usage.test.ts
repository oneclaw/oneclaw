import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { listSessionUsage } from "./session-usage";

test("listSessionUsage 使用 estimateTokens 估算三项 token 用量", async () => {
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-session-usage-"));

  try {
    process.env.OPENCLAW_STATE_DIR = tmpDir;
    const sessionsDir = path.join(tmpDir, "agents", "default", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionFile = path.join(sessionsDir, "s1.jsonl");
    fs.writeFileSync(
      sessionFile,
      [
        { type: "session", id: "s1" },
        { type: "message", message: { role: "user", content: "12345678" } },
        { type: "message", message: { role: "assistant", content: [{ type: "text", text: "abcd" }] } },
        { type: "message", message: { role: "user", content: "abcdefgh" } },
        { type: "message", message: { role: "assistant", content: [{ type: "text", text: "abcdefgh" }] } },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n",
      "utf-8",
    );

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        s1: {
          sessionId: "s1",
          updatedAt: 123,
          label: "demo",
          sessionFile,
          inputTokens: 999,
          outputTokens: 999,
          cacheReadTokens: 999,
        },
      }),
      "utf-8",
    );

    const rows = await listSessionUsage();

    assert.equal(rows.length, 1);
    assert.equal(rows[0].input, 4);
    assert.equal(rows[0].output, 3);
    assert.equal(rows[0].cacheRead, 3);
    assert.equal(rows[0].outputUnsupported, false);
    assert.equal(rows[0].cacheReadUnsupported, false);
  } finally {
    if (prevStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("listSessionUsage 只在当前分支内估算 cacheRead", async () => {
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-session-usage-"));

  try {
    process.env.OPENCLAW_STATE_DIR = tmpDir;
    const sessionsDir = path.join(tmpDir, "agents", "default", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });

    const sessionFile = path.join(sessionsDir, "branch.jsonl");
    fs.writeFileSync(
      sessionFile,
      [
        { type: "session", id: "root" },
        { type: "message", id: "u1", parentId: "root", message: { role: "user", content: "12345678" } },
        {
          type: "message",
          id: "a1",
          parentId: "u1",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "abcd" }],
          },
        },
        { type: "message", id: "u2-old", parentId: "a1", message: { role: "user", content: "abcdefgh" } },
        { type: "message", id: "a2-old", parentId: "u2-old", message: { role: "assistant", content: [{ type: "text", text: "old!" }] } },
        { type: "message", id: "u2-new", parentId: "a1", message: { role: "user", content: "ijklmnop" } },
        {
          type: "message",
          id: "a2-new",
          parentId: "u2-new",
          message: {
            role: "assistant",
            content: [{ type: "text", text: "wxyz" }],
          },
        },
      ].map((row) => JSON.stringify(row)).join("\n") + "\n",
      "utf-8",
    );

    fs.writeFileSync(
      path.join(sessionsDir, "sessions.json"),
      JSON.stringify({
        branch: {
          sessionId: "branch",
          updatedAt: 456,
          label: "branch-demo",
          sessionFile,
        },
      }),
      "utf-8",
    );

    const rows = await listSessionUsage();

    assert.equal(rows.length, 1);
    assert.equal(rows[0].input, 4);
    assert.equal(rows[0].output, 2);
    assert.equal(rows[0].cacheRead, 3);
  } finally {
    if (prevStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = prevStateDir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
