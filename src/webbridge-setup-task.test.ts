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

function trackSkillInstall() {
  const calls: string[] = [];
  return {
    calls,
    fake: async (binaryPath: string) => {
      calls.push(binaryPath);
      return { success: true, output: "✓ Claude Code → /x" };
    },
  };
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
    installSkill: async () => ({ success: true, output: "✓ fake" }),
    logger: { info: () => {}, error: () => {} },
    ...overrides,
  };
}

test("runWebbridgeSetupTask 下载成功 + extId 非空 → webbridge-ready + installSkill 被调", async () => {
  const skill = trackSkillInstall();
  const deps = makeDeps({ installSkill: skill.fake });
  const summary: SetupTaskSummary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "webbridge-ready");
  assert.equal(summary.webbridgeInstalled, true);
  assert.equal(summary.binaryPath, "/fake/bin/kimi-webbridge");
  assert.ok(summary.extensionSummary);
  assert.equal(summary.extensionSummary?.[0]?.browserId, "chrome");
  assert.deepEqual(
    skill.calls,
    ["/fake/bin/kimi-webbridge"],
    "installSkill 必须用 installer 返的 binaryPath 调一次",
  );
});

test("runWebbridgeSetupTask 下载成功 + extId 空 → fell-back-to-openclaw + 改写 config（严格）", async () => {
  const skill = trackSkillInstall();
  const counter = trackCalls();
  const writes: any[] = [];
  const applyModeCalls: string[] = [];
  let extensionsCalled = false;
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1.0.0",
      binaryPath: "/fake/bin/kimi-webbridge",
      etag: "W/fake",
    }),
    installExtensions: async () => {
      extensionsCalled = true;
      return [];
    },
    readConfig: () => ({}),
    writeConfig: (c) => {
      writes.push(c);
    },
    applyMode: (c, mode) => {
      applyModeCalls.push(mode);
      return { ...c, _mode: mode };
    },
    extensionId: "",
    onConfigRewritten: counter.inc,
    installSkill: skill.fake,
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(summary.webbridgeInstalled, false);
  assert.equal(extensionsCalled, false, "extId 空时不该调 installExtensions");
  assert.equal(skill.calls.length, 1, "skill 阶段在 extensionId 检查之前 → 仍被调一次");
  assert.equal(counter.get(), 1, "onConfigRewritten 被调一次（降级通知）");
  assert.deepEqual(applyModeCalls, ["openclaw"]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]._mode, "openclaw");
});

test("runWebbridgeSetupTask 下载失败 → fell-back-to-openclaw + 改写 config + 通知 + installSkill 不被调", async () => {
  const counter = trackCalls();
  const skill = trackSkillInstall();
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
    installSkill: skill.fake,
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
  assert.equal(skill.calls.length, 0, "binary 没下载成功 → 不调 installSkill");
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

test("runWebbridgeSetupTask 下载成功但 extension 安装抛错 → fell-back-to-openclaw + error（严格）", async () => {
  const counter = trackCalls();
  const writes: any[] = [];
  const applyModeCalls: string[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1.0.0",
      binaryPath: "/fake/bin/kimi-webbridge",
      etag: "W/fake",
    }),
    installExtensions: async () => {
      throw new Error("reg access denied");
    },
    readConfig: () => ({}),
    writeConfig: (c) => writes.push(c),
    applyMode: (c, mode) => {
      applyModeCalls.push(mode);
      return { ...c, _mode: mode };
    },
    extensionId: "abcdef0123456789abcdef0123456789",
    onConfigRewritten: counter.inc,
    installSkill: async () => ({ success: true, output: "✓ fake" }),
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(summary.webbridgeInstalled, false);
  assert.equal(summary.extensionSummary, null);
  assert.match(summary.error ?? "", /reg access denied/);
  assert.equal(counter.get(), 1);
  assert.deepEqual(applyModeCalls, ["openclaw"]);
  assert.equal(writes.length, 1);
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

test("runWebbridgeSetupTask installSkill 抛错 → fell-back-to-openclaw（严格）", async () => {
  const counter = trackCalls();
  const writes: any[] = [];
  const applyModeCalls: string[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1.0.0",
      binaryPath: "/fake/bin/kimi-webbridge",
      etag: "W/fake",
    }),
    installExtensions: async () => [
      { browserId: "chrome", browserName: "Chrome", result: "installed" },
    ],
    readConfig: () => ({}),
    writeConfig: (c) => writes.push(c),
    applyMode: (c, mode) => {
      applyModeCalls.push(mode);
      return { ...c, _mode: mode };
    },
    extensionId: "abcdef0123456789abcdef0123456789",
    onConfigRewritten: counter.inc,
    installSkill: async () => {
      throw new Error("skill write fail");
    },
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(summary.webbridgeInstalled, false);
  assert.match(summary.error ?? "", /skill write fail/);
  assert.equal(counter.get(), 1);
  assert.deepEqual(applyModeCalls, ["openclaw"]);
});

test("runWebbridgeSetupTask installSkill 返 success=false → fell-back-to-openclaw（严格）", async () => {
  const counter = trackCalls();
  const writes: any[] = [];
  const applyModeCalls: string[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1.0.0",
      binaryPath: "/fake/bin/kimi-webbridge",
      etag: "W/fake",
    }),
    installExtensions: async () => [
      { browserId: "chrome", browserName: "Chrome", result: "installed" },
    ],
    readConfig: () => ({}),
    writeConfig: (c) => writes.push(c),
    applyMode: (c, mode) => {
      applyModeCalls.push(mode);
      return { ...c, _mode: mode };
    },
    extensionId: "abcdef0123456789abcdef0123456789",
    onConfigRewritten: counter.inc,
    installSkill: async () => ({
      success: false,
      output: "",
      error: "partial failure",
    }),
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(summary.webbridgeInstalled, false);
  assert.match(summary.error ?? "", /partial failure/);
  assert.equal(counter.get(), 1);
  assert.deepEqual(applyModeCalls, ["openclaw"]);
});

// ===== fallbackOnFailure:false 路径（Settings repair 用） =====

test("fallbackOnFailure:false + 下载失败 → outcome=fell-back-to-openclaw，但不改 config、不通知", async () => {
  const counter = trackCalls();
  const writes: any[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => {
      throw new Error("net");
    },
    installExtensions: async () => [],
    readConfig: () => ({}),
    writeConfig: (c) => writes.push(c),
    applyMode: (c, mode) => ({ ...c, _mode: mode }),
    extensionId: "abcdef0123456789abcdef0123456789",
    onConfigRewritten: counter.inc,
    installSkill: async () => ({ success: true, output: "" }),
    fallbackOnFailure: false,
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(writes.length, 0, "关键：不写 config");
  assert.equal(counter.get(), 0, "不触发 onConfigRewritten");
});

test("fallbackOnFailure:false + skill 失败 → 不改 config", async () => {
  const writes: any[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1",
      binaryPath: "/x",
      etag: null,
    }),
    installExtensions: async () => [
      { browserId: "chrome", browserName: "Chrome", result: "installed" },
    ],
    readConfig: () => ({}),
    writeConfig: (c) => writes.push(c),
    applyMode: (c) => c,
    extensionId: "abcdef0123456789abcdef0123456789",
    installSkill: async () => ({
      success: false,
      output: "",
      error: "boom",
    }),
    fallbackOnFailure: false,
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "fell-back-to-openclaw");
  assert.equal(writes.length, 0);
});

test("fallbackOnFailure:false + 全 OK → outcome=webbridge-ready，仍不写 config（调用方职责）", async () => {
  const writes: any[] = [];
  const deps: WebbridgeSetupTaskDeps = {
    installer: async () => ({
      installed: true,
      skipped: false,
      version: "1",
      binaryPath: "/x",
      etag: null,
    }),
    installExtensions: async () => [
      { browserId: "chrome", browserName: "Chrome", result: "installed" },
    ],
    readConfig: () => ({}),
    writeConfig: (c) => writes.push(c),
    applyMode: (c) => c,
    extensionId: "abcdef0123456789abcdef0123456789",
    installSkill: async () => ({ success: true, output: "" }),
    fallbackOnFailure: false,
    logger: { info: () => {}, error: () => {} },
  };
  const summary = await runWebbridgeSetupTask(deps);
  assert.equal(summary.outcome, "webbridge-ready");
  assert.equal(writes.length, 0, "webbridge-ready 路径也不写 config（留给调用方）");
});
