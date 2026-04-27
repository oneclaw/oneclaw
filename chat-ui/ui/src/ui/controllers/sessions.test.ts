import assert from "node:assert/strict";
import { pendingSessionLabels } from "../session-pending.ts";
import { loadSessions } from "./sessions.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

async function testLoadSessionsQueuesRefreshBehindInFlightRequest() {
  pendingSessionLabels.clear();
  const first = deferred<any>();
  const second = deferred<any>();
  const requests: Array<{ method: string; params: Record<string, unknown> }> = [];
  const state = {
    client: {
      request(method: string, params: Record<string, unknown>) {
        requests.push({ method, params });
        return requests.length === 1 ? first.promise : second.promise;
      },
    },
    connected: true,
    sessionsLoading: false,
    sessionsResult: null,
    sessionsError: null,
    sessionsFilterActive: "",
    sessionsFilterLimit: "120",
    sessionsIncludeGlobal: true,
    sessionsIncludeUnknown: false,
  } as any;

  const initialLoad = loadSessions(state);
  assert.equal(state.sessionsLoading, true);
  assert.equal(requests.length, 1);

  const queuedLoad = loadSessions(state);
  assert.equal(requests.length, 1, "并发刷新应先排队，不能直接发第二个请求");

  first.resolve({
    sessions: [{ key: "stale-session" }],
  });
  await flushMicrotasks();

  assert.equal(requests.length, 2, "排队刷新应在首个请求结束后立即补发");
  assert.equal(state.sessionsLoading, true, "补发刷新进行中应维持 loading 状态");

  second.resolve({
    sessions: [{ key: "fresh-session" }],
  });
  await Promise.all([initialLoad, queuedLoad]);

  assert.equal(state.sessionsLoading, false);
  assert.equal(state.sessionsResult?.sessions?.[0]?.key, "fresh-session");
}

async function testLoadSessionsKeepsPendingLocalRowsVisible() {
  pendingSessionLabels.clear();
  pendingSessionLabels.set("agent:main:local-draft", "New Chat");

  const state = {
    client: {
      request() {
        return Promise.resolve({
          sessions: [{ key: "agent:main:existing", label: "Existing" }],
        });
      },
    },
    connected: true,
    sessionsLoading: false,
    sessionsResult: null,
    sessionsError: null,
    sessionsFilterActive: "",
    sessionsFilterLimit: "120",
    sessionsIncludeGlobal: true,
    sessionsIncludeUnknown: false,
  } as any;

  await loadSessions(state);

  assert.deepEqual(
    state.sessionsResult?.sessions.map((row: any) => row.key),
    ["agent:main:local-draft", "agent:main:existing"],
  );
  assert.equal(state.sessionsResult?.sessions[0]?.label, "New Chat");
  pendingSessionLabels.clear();
}

async function main() {
  await testLoadSessionsQueuesRefreshBehindInFlightRequest();
  await testLoadSessionsKeepsPendingLocalRowsVisible();
  console.log("sessions controller tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
