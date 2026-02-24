import test from "node:test";
import assert from "node:assert/strict";
import {
  getLaunchAtLoginState,
  setLaunchAtLoginEnabled,
} from "./launch-at-login";

type MockHost = {
  getLoginItemSettings: () => { openAtLogin?: boolean };
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
};

test("getLaunchAtLoginState 在非 darwin/win32 平台应返回不支持", () => {
  const host: MockHost = {
    getLoginItemSettings: () => ({ openAtLogin: true }),
    setLoginItemSettings: () => undefined,
  };

  const state = getLaunchAtLoginState(host, "linux");
  assert.deepEqual(state, { supported: false, enabled: false });
});

test("getLaunchAtLoginState 在支持平台应读取 openAtLogin", () => {
  const host: MockHost = {
    getLoginItemSettings: () => ({ openAtLogin: true }),
    setLoginItemSettings: () => undefined,
  };

  const state = getLaunchAtLoginState(host, "darwin");
  assert.deepEqual(state, { supported: true, enabled: true });
});

test("setLaunchAtLoginEnabled 在支持平台应写入 openAtLogin", () => {
  let saved: { openAtLogin: boolean } | null = null;
  const host: MockHost = {
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: (settings) => {
      saved = settings;
    },
  };

  const result = setLaunchAtLoginEnabled(host, true, "win32");
  assert.deepEqual(result, { supported: true });
  assert.deepEqual(saved, { openAtLogin: true });
});

test("setLaunchAtLoginEnabled 在不支持平台应忽略写入", () => {
  let called = false;
  const host: MockHost = {
    getLoginItemSettings: () => ({ openAtLogin: false }),
    setLoginItemSettings: () => {
      called = true;
    },
  };

  const result = setLaunchAtLoginEnabled(host, true, "linux");
  assert.deepEqual(result, { supported: false });
  assert.equal(called, false);
});
