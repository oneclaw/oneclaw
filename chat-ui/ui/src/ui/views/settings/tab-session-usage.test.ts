import test from "node:test";
import assert from "node:assert/strict";
import {
  beginSessionUsageLoad,
  SESSION_USAGE_DETAIL_LIST_MAX_HEIGHT_PX,
  SESSION_USAGE_DETAIL_ROW_HEIGHT_PX,
  SESSION_USAGE_DETAIL_VISIBLE_ROW_LIMIT,
  loadSessionUsageSnapshot,
  mapEntries,
  isRecord,
  resolveSessionUsageDisplayLabel,
} from "./tab-session-usage.lib.ts";

test("isRecord rejects arrays", () => {
  assert.equal(isRecord([]), false);
  assert.equal(isRecord([1, 2]), false);
  assert.equal(isRecord({}), true);
  assert.equal(isRecord({ a: 1 }), true);
  assert.equal(isRecord(null), false);
  assert.equal(isRecord(undefined), false);
  assert.equal(isRecord("x"), false);
});

test("mapEntries returns empty result for non-record payload", () => {
  assert.deepEqual(mapEntries(null), { rows: [], totalSessions: 0, totals: null });
  assert.deepEqual(mapEntries([]), { rows: [], totalSessions: 0, totals: null });
  assert.deepEqual(mapEntries("nope"), { rows: [], totalSessions: 0, totals: null });
});

test("mapEntries uses key as the row id when sessionId is missing", () => {
  const payload = {
    sessions: [
      {
        sessionId: "s1",
        key: "agent:claude:s1",
        agentId: "claude",
        label: "Hello",
        updatedAt: 100,
        usage: { input: 10, output: 20, cacheRead: 5 },
      },
      {
        key: "agent:claude:s3",
        agentId: "claude",
        updatedAt: 300,
        usage: { input: 3, output: 4, cacheRead: 5 },
      },
      // missing both sessionId and key
      { agentId: "claude", updatedAt: 400, usage: {} },
    ],
  };
  const result = mapEntries(payload);
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0]!.sessionId, "agent:claude:s3");
  assert.equal(result.rows[1]!.sessionId, "s1");
  assert.equal(result.rows[1]!.input, 10);
  assert.deepEqual(result.totals, { input: 13, output: 24, cacheRead: 10 });
  assert.equal(result.totalSessions, 2);
});

test("mapEntries returns null totals when no rows survive filtering", () => {
  assert.equal(mapEntries({ sessions: [] }).totals, null);
  assert.equal(mapEntries({}).totals, null);
});

test("beginSessionUsageLoad keeps a failed load from retrying on every render", () => {
  const state = { initialized: false, loading: false };
  assert.equal(beginSessionUsageLoad(state, true, true), true);
  state.loading = false; // mirrors init().finally after a rejected request
  assert.equal(beginSessionUsageLoad(state, true, true), false);
});

test("loadSessionUsageSnapshot issues a single unscoped sessions.usage call", async () => {
  const calls: Array<{ method: string; params?: unknown }> = [];
  const usagePayload = {
    sessions: [
      { key: "agent:a:s0", sessionId: "s0", agentId: "a", updatedAt: 100, usage: { input: 1, output: 2, cacheRead: 3 } },
      { key: "agent:a:s1", sessionId: "s1", agentId: "a", updatedAt: 200, usage: { input: 10, output: 20, cacheRead: 30 } },
      { key: "agent:a:s2", sessionId: "s2", agentId: "a", updatedAt: 300, usage: { input: 100, output: 200, cacheRead: 300 } },
    ],
  };

  const result = await loadSessionUsageSnapshot(async <T>(method: string, params?: unknown): Promise<T> => {
    calls.push({ method, params });
    if (method === "sessions.usage") return usagePayload as T;
    throw new Error(`unexpected method ${method}`);
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    method: "sessions.usage",
    params: undefined,
  });
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0]!.sessionId, "s2");
  assert.equal(result.rows[1]!.sessionId, "s1");
  assert.equal(result.rows[2]!.sessionId, "s0");
  assert.deepEqual(result.totals, { input: 111, output: 222, cacheRead: 333 });
});

test("loadSessionUsageSnapshot keeps archived/inactive rows that sessions.usage returns", async () => {
  // Goal: pull active + archived + inactive — no client-side key filtering.
  const result = await loadSessionUsageSnapshot(async <T>(method: string): Promise<T> => {
    if (method === "sessions.usage") {
      return {
        sessions: [
          { key: "agent:a:s1", sessionId: "s1", agentId: "a", updatedAt: 200, usage: { input: 10, output: 20, cacheRead: 30 } },
          { key: "agent:a:archived", sessionId: "archived", agentId: "a", updatedAt: 100, usage: { input: 99, output: 88, cacheRead: 77 } },
        ],
      } as T;
    }
    throw new Error(`unexpected method ${method}`);
  });

  assert.deepEqual(result.rows.map((row) => row.sessionId), ["s1", "archived"]);
  assert.deepEqual(result.totals, { input: 109, output: 108, cacheRead: 107 });
});

test("loadSessionUsageSnapshot rethrows sessions.usage failures", async () => {
  await assert.rejects(
    loadSessionUsageSnapshot(async <T>(method: string): Promise<T> => {
      if (method === "sessions.usage") {
        throw new Error("gateway timeout");
      }
      throw new Error(`unexpected method ${method}`);
    }),
    /gateway timeout/,
  );
});

test("mapEntries flags isMain for default agent main key", () => {
  const payload = {
    sessions: [
      { sessionId: "m", key: "agent:claude:main", agentId: "claude", updatedAt: 1, usage: {} },
      { sessionId: "x", key: "agent:claude:abc", agentId: "claude", updatedAt: 2, usage: {} },
    ],
  };
  const { rows } = mapEntries(payload);
  const main = rows.find((r) => r.sessionId === "m");
  const other = rows.find((r) => r.sessionId === "x");
  assert.ok(main?.isMain);
  assert.equal(other?.isMain, false);
});

test("resolveSessionUsageDisplayLabel always displays the canonical main session label", () => {
  assert.equal(resolveSessionUsageDisplayLabel({
    sessionId: "e977ce58-103b-4d72-bd94-c3a6e886d813",
    key: "agent:claude:main",
    isMain: true,
    customLabel: null,
    originLabel: "heartbeat",
  }), "agent:main:main");
});

test("resolveSessionUsageDisplayLabel falls back to sessionId for unlabeled non-main rows", () => {
  assert.equal(resolveSessionUsageDisplayLabel({
    sessionId: "e977ce58-103b-4d72-bd94-c3a6e886d813",
    key: "agent:main:e977ce58-103b-4d72-bd94-c3a6e886d813",
    isMain: false,
    customLabel: null,
    originLabel: null,
  }), "e977ce58-103b-4d72-bd94-c3a6e886d813");
});

test("mapEntries sorts rows by updatedAt desc without a display cap", () => {
  const sessions = Array.from({ length: 250 }, (_, i) => ({
    sessionId: `s${i}`,
    key: `agent:a:s${i}`,
    agentId: "a",
    updatedAt: i,
    usage: { input: 1, output: 2, cacheRead: 3 },
  }));
  const result = mapEntries({ sessions });
  assert.equal(result.rows.length, 250);
  assert.equal(result.totalSessions, 250);
  assert.deepEqual(result.totals, { input: 250, output: 500, cacheRead: 750 });
  assert.equal(result.rows[0]!.updatedAt, 249);
  assert.equal(result.rows[249]!.updatedAt, 0);
});

test("session usage details list is capped at ten visible rows before scrolling", () => {
  assert.equal(SESSION_USAGE_DETAIL_VISIBLE_ROW_LIMIT, 10);
  assert.equal(
    SESSION_USAGE_DETAIL_LIST_MAX_HEIGHT_PX,
    SESSION_USAGE_DETAIL_VISIBLE_ROW_LIMIT * SESSION_USAGE_DETAIL_ROW_HEIGHT_PX,
  );
});
