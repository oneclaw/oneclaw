import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  BROWSER_TARGETS,
  isBrowserInstalled,
  listInstalledBrowsers,
  type BrowserTarget,
} from "./browser-detector";

test("BROWSER_TARGETS 至少包含 chrome/edge/brave/vivaldi/opera", () => {
  const ids = BROWSER_TARGETS.map((t) => t.id);
  for (const expected of ["chrome", "edge", "brave", "vivaldi", "opera"]) {
    assert.ok(ids.includes(expected), `missing ${expected}: ${ids.join(",")}`);
  }
});

test("每个 target 有完整字段", () => {
  for (const t of BROWSER_TARGETS) {
    assert.ok(t.id.length > 0, `id 缺: ${JSON.stringify(t)}`);
    assert.ok(t.name.length > 0, `name 缺: ${t.id}`);
    assert.ok(t.userDataDirMac.includes("Library"), `mac 路径形状不对: ${t.id}`);
    assert.ok(t.userDataDirWin.length > 0, `win 路径缺: ${t.id}`);
    assert.ok(
      t.winRegistryKey.startsWith("HKCU\\Software\\"),
      `regkey 缺前缀: ${t.id}`,
    );
  }
});

test("BROWSER_TARGETS id 唯一", () => {
  const ids = BROWSER_TARGETS.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

export function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bd-test-home-"));
}

export function setupFakeHome(home: string): () => void {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return () => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
  };
}

test("isBrowserInstalled 返 false 当 userDataDir 不存在", () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    assert.equal(isBrowserInstalled(chrome), false);
  } finally {
    restore();
  }
});

test("isBrowserInstalled 返 true 当 userDataDir 存在", () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    const fullPath =
      process.platform === "win32"
        ? path.join(home, chrome.userDataDirWin)
        : path.join(home, chrome.userDataDirMac);
    fs.mkdirSync(fullPath, { recursive: true });
    assert.equal(isBrowserInstalled(chrome), true);
  } finally {
    restore();
  }
});

test("listInstalledBrowsers 只返回 userDataDir 存在的", () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    const chromePath =
      process.platform === "win32"
        ? path.join(home, chrome.userDataDirWin)
        : path.join(home, chrome.userDataDirMac);
    fs.mkdirSync(chromePath, { recursive: true });
    const installed = listInstalledBrowsers();
    const ids = installed.map((t) => t.id);
    assert.ok(ids.includes("chrome"));
    assert.ok(!ids.includes("edge"));
  } finally {
    restore();
  }
});
