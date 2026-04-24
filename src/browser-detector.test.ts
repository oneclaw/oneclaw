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
  const originalAppsDirs = process.env.ONECLAW_BROWSER_APPS_DIRS;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // 把 macOS app 搜索路径限制到 fake HOME 下的空目录，绕开宿主机 /Applications
  process.env.ONECLAW_BROWSER_APPS_DIRS = path.join(home, "Applications-fake");
  return () => {
    process.env.HOME = originalHome;
    process.env.USERPROFILE = originalUserProfile;
    if (originalAppsDirs === undefined) delete process.env.ONECLAW_BROWSER_APPS_DIRS;
    else process.env.ONECLAW_BROWSER_APPS_DIRS = originalAppsDirs;
  };
}

function touchLocalState(home: string, target: { userDataDirMac: string; userDataDirWin: string }): void {
  const userDataDir =
    process.platform === "win32"
      ? path.join(home, target.userDataDirWin)
      : path.join(home, target.userDataDirMac);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "Local State"), "{}", "utf-8");
}

test("isBrowserInstalled 返 false 当 Local State 不存在 + 无 app bundle", () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    assert.equal(isBrowserInstalled(chrome), false);
  } finally {
    restore();
  }
});

test("isBrowserInstalled 返 true 当 Local State 存在", () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    touchLocalState(home, chrome);
    assert.equal(isBrowserInstalled(chrome), true);
  } finally {
    restore();
  }
});

test(
  "[macOS] isBrowserInstalled 返 true 当 fake /Applications 里有 app bundle",
  { skip: process.platform === "win32" },
  () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      // Local State 不在，靠 app bundle 判定
      const fakeApps = path.join(home, "Applications-fake");
      fs.mkdirSync(path.join(fakeApps, chrome.appNameMac), { recursive: true });
      assert.equal(isBrowserInstalled(chrome), true);
    } finally {
      restore();
    }
  },
);

test(
  "[ghost] isBrowserInstalled 返 false 当 user data dir 存在但只有 OneClaw 写过的子目录",
  () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const edge = BROWSER_TARGETS.find((t) => t.id === "edge")!;
      // 模拟 OneClaw 旧逻辑写过 ext JSON 留下的 ghost user data dir
      const userDataDir =
        process.platform === "win32"
          ? path.join(home, edge.userDataDirWin)
          : path.join(home, edge.userDataDirMac);
      fs.mkdirSync(path.join(userDataDir, "External Extensions"), { recursive: true });
      // 没 Local State → 不算装了
      assert.equal(isBrowserInstalled(edge), false);
    } finally {
      restore();
    }
  },
);

test("listInstalledBrowsers 只返回真装了的（Local State 存在或 app bundle 存在）", () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    touchLocalState(home, chrome);
    const installed = listInstalledBrowsers();
    const ids = installed.map((t) => t.id);
    assert.ok(ids.includes("chrome"));
    assert.ok(!ids.includes("edge"));
  } finally {
    restore();
  }
});
