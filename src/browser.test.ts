// browser.test.ts — 关键链路覆盖：检测 / 三模式 / 扩展安装 / blocklist
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  applyBrowserModeConfig,
  BROWSER_TARGETS,
  cleanExtensionBlocklist,
  detectBrowserMode,
  getDefaultBrowser,
  installExtension,
  isBrowserInstalled,
  isExtensionConfigured,
  isExtensionPresentInChrome,
  type ExtensionSpec,
  type RegExecutor,
} from "./browser";

const EXT = "aaaabbbbccccddddeeeeffffgggghhhh";
const SPEC: ExtensionSpec = { extId: EXT, crxPath: "/x/kimi.crx", crxVersion: "1.8.4" };
const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;

function withFakeHome(fn: (home: string) => void | Promise<void>): () => Promise<void> {
  return async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "browser-test-"));
    const orig = { h: process.env.HOME, u: process.env.USERPROFILE, a: process.env.ONECLAW_BROWSER_APPS_DIRS };
    process.env.HOME = process.env.USERPROFILE = home;
    process.env.ONECLAW_BROWSER_APPS_DIRS = path.join(home, "Apps-fake");
    try { await fn(home); } finally {
      process.env.HOME = orig.h; process.env.USERPROFILE = orig.u;
      if (orig.a === undefined) delete process.env.ONECLAW_BROWSER_APPS_DIRS;
      else process.env.ONECLAW_BROWSER_APPS_DIRS = orig.a;
    }
  };
}

test("BROWSER_TARGETS 仅 chrome / edge + isBrowserInstalled 看 Local State", withFakeHome((home) => {
  assert.deepEqual(BROWSER_TARGETS.map((t) => t.id).sort(), ["chrome", "edge"]);
  assert.equal(isBrowserInstalled(chrome), false);
  const ud = path.join(home, chrome.userDataDirMac);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "Local State"), "{}", "utf-8");
  assert.equal(isBrowserInstalled(chrome), true);
}));

test("getDefaultBrowser: 用 path 匹配 .app / .exe；非 Chrome/Edge → null；getInfo reject → null", async () => {
  // mac path 形如 /Applications/Google Chrome.app
  const macChrome = await getDefaultBrowser({
    platform: "darwin",
    getInfo: async () => ({ name: "Google Chrome", path: "/Applications/Google Chrome.app", icon: null }),
  });
  assert.equal(macChrome?.target.id, "chrome");

  // win path 形如 C:\...\msedge.exe
  const winEdge = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Microsoft Edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", icon: null }),
  });
  assert.equal(winEdge?.target.id, "edge");

  // Firefox / Safari 不在白名单 → null
  const firefox = await getDefaultBrowser({
    platform: "darwin",
    getInfo: async () => ({ name: "Firefox", path: "/Applications/Firefox.app", icon: null }),
  });
  assert.equal(firefox, null);

  // API 抛错（罕见）→ null（不挂）
  const errored = await getDefaultBrowser({
    platform: "darwin",
    getInfo: async () => { throw new Error("LS lookup failed"); },
  });
  assert.equal(errored, null);
});

test("getDefaultBrowser: Win 上 Chrome Beta/Dev/Canary 与 Edge Beta/Dev 不会被误认成 stable", async () => {
  // Chrome stable 几种常见安装路径都应识别成功
  const stableA = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Google Chrome", path: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", icon: null }),
  });
  assert.equal(stableA?.target.id, "chrome");
  const stableB = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Google Chrome", path: "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe", icon: null }),
  });
  assert.equal(stableB?.target.id, "chrome");

  // Beta / Dev / Canary 路径段不同，必须 null（旧 reg 实现里 ChromeBetaHTML 也不命中 ChromeHTML）
  const beta = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Google Chrome Beta", path: "C:\\Program Files\\Google\\Chrome Beta\\Application\\chrome.exe", icon: null }),
  });
  assert.equal(beta, null);
  const dev = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Google Chrome Dev", path: "C:\\Program Files\\Google\\Chrome Dev\\Application\\chrome.exe", icon: null }),
  });
  assert.equal(dev, null);
  const canary = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Google Chrome SxS", path: "C:\\Users\\u\\AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe", icon: null }),
  });
  assert.equal(canary, null);

  // Edge stable / Beta / Dev 同样
  const edgeStable = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Microsoft Edge", path: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", icon: null }),
  });
  assert.equal(edgeStable?.target.id, "edge");
  const edgeBeta = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Microsoft Edge Beta", path: "C:\\Program Files (x86)\\Microsoft\\Edge Beta\\Application\\msedge.exe", icon: null }),
  });
  assert.equal(edgeBeta, null);
  const edgeDev = await getDefaultBrowser({
    platform: "win32",
    getInfo: async () => ({ name: "Microsoft Edge Dev", path: "C:\\Program Files (x86)\\Microsoft\\Edge Dev\\Application\\msedge.exe", icon: null }),
  });
  assert.equal(edgeDev, null);
});

test("三模式 apply+detect 往返：webbridge 把 skill 翻回 true", () => {
  const op = applyBrowserModeConfig({}, "openclaw");
  assert.equal(op.skills.entries["kimi-webbridge"].enabled, false);
  assert.equal(detectBrowserMode(op), "openclaw");

  const us = applyBrowserModeConfig(op, "user");
  assert.equal(us.browser.defaultProfile, "user");
  assert.equal(detectBrowserMode(us), "user");

  const wb = applyBrowserModeConfig(us, "webbridge");
  assert.equal(wb.plugins.entries.browser.enabled, false);
  assert.equal(wb.skills.entries["kimi-webbridge"].enabled, true,
    "切到 webbridge 必须把之前关掉的 skill 翻回 true");
  assert.equal(detectBrowserMode(wb), "webbridge");
  assert.equal(detectBrowserMode({ browser: { defaultProfile: "chrome" } }), "user", "老 alias");
});

test("[mac] installExtension 写 External Extensions JSON + 幂等 + isExtensionConfigured", withFakeHome(async (home) => {
  const ud = path.join(home, chrome.userDataDirMac);
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, "Local State"), "{}", "utf-8");

  assert.equal(await installExtension(chrome, SPEC), "installed");
  const json = JSON.parse(fs.readFileSync(path.join(ud, "External Extensions", `${EXT}.json`), "utf-8"));
  assert.equal(json.external_crx, SPEC.crxPath);
  assert.equal(json.external_version, SPEC.crxVersion);
  assert.equal(json.external_update_url, undefined, "走本地协议，禁止 update_url");
  assert.equal(await installExtension(chrome, SPEC), "skipped");
  assert.equal(await isExtensionConfigured(chrome, SPEC), true);
}));

test("[win mock] installExtension reg add path/version，不写 update_url", async () => {
  const reg = new Map<string, string>();
  const exec: RegExecutor = async (a) => {
    const k = `${a[1]}\\${a[3]}`;
    if (a[0] === "query") {
      const v = reg.get(k);
      return v === undefined
        ? { stdout: "", stderr: "x", code: 1 }
        : { stdout: `  ${a[3]}    REG_SZ    ${v}\n`, stderr: "", code: 0 };
    }
    if (a[0] === "add") reg.set(k, a[7] ?? "");
    if (a[0] === "delete") for (const x of [...reg.keys()]) if (x.startsWith(`${a[1]}\\`)) reg.delete(x);
    return { stdout: "", stderr: "", code: 0 };
  };
  const opts = { exec, platform: "win32" as const, skipUserDataCheck: true };
  assert.equal(await installExtension(chrome, SPEC, opts), "installed");
  assert.equal(reg.get(`${chrome.winRegistryKey}\\${EXT}\\path`), SPEC.crxPath);
  assert.equal(reg.get(`${chrome.winRegistryKey}\\${EXT}\\version`), SPEC.crxVersion);
  assert.equal(reg.get(`${chrome.winRegistryKey}\\${EXT}\\update_url`), undefined);
});

test("[mac] cleanExtensionBlocklist 移除 ID 但保留其它字段", withFakeHome(async (home) => {
  const pd = path.join(home, chrome.userDataDirMac, chrome.profileSubdir);
  fs.mkdirSync(pd, { recursive: true });
  const pp = path.join(pd, "Preferences");
  fs.writeFileSync(pp, JSON.stringify({
    extensions: { external_uninstalls: [EXT, "keep1"], some: { x: 1 } }, top: "preserve",
  }));
  assert.equal(await cleanExtensionBlocklist(chrome, EXT), "cleaned");
  const after = JSON.parse(fs.readFileSync(pp, "utf-8"));
  assert.deepEqual(after.extensions.external_uninstalls, ["keep1"]);
  assert.deepEqual(after.extensions.some, { x: 1 });
  assert.equal(after.top, "preserve");
}));

test("[mac] isExtensionPresentInChrome: disable_reasons=[] → true，非空数组 → false", withFakeHome(async (home) => {
  const pd = path.join(home, chrome.userDataDirMac, chrome.profileSubdir);
  fs.mkdirSync(pd, { recursive: true });
  const sp = path.join(pd, "Secure Preferences");
  const write = (dr: unknown) => fs.writeFileSync(sp, JSON.stringify({ extensions: { settings: { [EXT]: { disable_reasons: dr } } } }));
  write([]); assert.equal(await isExtensionPresentInChrome(chrome, EXT), true);
  write(["user_action"]); assert.equal(await isExtensionPresentInChrome(chrome, EXT), false);
}));
