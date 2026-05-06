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

test("getDefaultBrowser: mac com.google.chrome / win MSEdgeHTM / Firefox→null", () => {
  assert.equal(getDefaultBrowser({
    platform: "darwin", runReg: () => null,
    readPlist: () => ({ LSHandlers: [{ LSHandlerURLScheme: "https", LSHandlerRoleAll: "com.google.chrome" }] }),
  })?.target.id, "chrome");
  assert.equal(getDefaultBrowser({ platform: "win32", runReg: () => "MSEdgeHTM", readPlist: () => null })?.target.id, "edge");
  assert.equal(getDefaultBrowser({ platform: "win32", runReg: () => "FirefoxURL-x", readPlist: () => null }), null);
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
