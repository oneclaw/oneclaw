import test from "node:test";
import assert from "node:assert/strict";
import {
  runWebbridgeSetupTask,
  type WebbridgeSetupTaskDeps,
  type SetupTaskSummary,
} from "./webbridge-setup-task";

function trackCalls() {
  const state = { count: 0 };
  return { get: () => state.count, inc: () => state.count++ };
}

function makeDeps(
  overrides: Partial<WebbridgeSetupTaskDeps> = {},
): WebbridgeSetupTaskDeps {
  const store = { current: { existing: "field" } };
  return {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1.0.0",
      binaryPath: "/fake/bin/kimi-webbridge",
      etag: "W/fake",
    }),
    installExtensions: async () => [
      {
        browserId: "chrome",
        browserName: "Google Chrome",
        result: "installed",
      },
    ],
    readConfig: () => JSON.parse(JSON.stringify(store.current)),
    writeConfig: (c) => {
      store.current = JSON.parse(JSON.stringify(c));
    },
    applyMode: (c, mode) => ({ ...c, _applied: mode }),
    extensionId: "abcdef0123456789abcdef0123456789",
    onConfigRewritten: () => {},
    logger: { info: () => {}, error: () => {} },
    ...overrides,
  };
}

test("runWebbridgeSetupTask 下载成功 + extId 非空 → webbridge-ready", async () => {
  const deps = makeDeps();
  const summary: SetupTaskSummary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "webbridge-ready");
  assert.equal(summary.webbridgeInstalled, true);
  assert.equal(summary.binaryPath, "/fake/bin/kimi-webbridge");
  assert.ok(summary.extensionSummary);
  assert.equal(summary.extensionSummary?.[0]?.browserId, "chrome");
});

test("runWebbridgeSetupTask 下载成功 + extId 空 → extension-skipped", async () => {
  let extensionsCalled = false;
  const deps = makeDeps({
    extensionId: "",
    installExtensions: async () => {
      extensionsCalled = true;
      return [];
    },
  });
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "extension-skipped");
  assert.equal(summary.webbridgeInstalled, true);
  assert.equal(summary.extensionSummary, null);
  assert.equal(extensionsCalled, false, "extId 空时不该调 installExtensions");
});

test("runWebbridgeSetupTask 下载失败 → fell-back-to-openclaw + 改写 config + 通知", async () => {
  const counter = trackCalls();
  const store = { current: { existing: "field" } };
  const writes: any[] = [];
  const applyModeCalls: string[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => {
      throw new Error("CDN 500");
    },
    installExtensions: async () => {
      throw new Error("should not be called");
    },
    readConfig: () => JSON.parse(JSON.stringify(store.current)),
    writeConfig: (c) => {
      writes.push(c);
      store.current = JSON.parse(JSON.stringify(c));
    },
    applyMode: (c, mode) => {
      applyModeCalls.push(mode);
      return { ...c, _mode: mode };
    },
    extensionId: "abcdef0123456789abcdef0123456789",
    onConfigRewritten: counter.inc,
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(summary.webbridgeInstalled, false);
  assert.equal(summary.extensionSummary, null);
  assert.match(summary.error ?? "", /CDN 500/);
  assert.equal(counter.get(), 1, "onConfigRewritten 必须被调一次");
  assert.deepEqual(applyModeCalls, ["openclaw"]);
  assert.equal(writes.length, 1, "config 只写回一次");
  assert.equal(writes[0]._mode, "openclaw");
});

test("runWebbridgeSetupTask 下载失败 + 未提供 onConfigRewritten → 不抛错", async () => {
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => {
      throw new Error("boom");
    },
    installExtensions: async () => [],
    readConfig: () => ({}),
    writeConfig: () => {},
    applyMode: (c) => c,
    extensionId: "abc",
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
});

test("runWebbridgeSetupTask 下载成功但 extension 安装抛错 → webbridge-ready + error", async () => {
  const deps = makeDeps({
    installExtensions: async () => {
      throw new Error("reg access denied");
    },
  });
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "webbridge-ready");
  assert.equal(summary.webbridgeInstalled, true);
  assert.equal(summary.extensionSummary, null);
  assert.match(summary.error ?? "", /reg access denied/);
});

test("runWebbridgeSetupTask installer 返 skipped（cache 命中）→ webbridge-ready", async () => {
  const deps = makeDeps({
    installer: async () => ({
      installed: false,
      skipped: true,
      version: "1.0.0",
      binaryPath: "/fake/bin",
      etag: "W/fake",
    }),
  });
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "webbridge-ready");
  assert.equal(summary.webbridgeInstalled, true);
  assert.equal(summary.binaryPath, "/fake/bin");
});
