import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_MODES,
  isBrowserMode,
  applyBrowserModeConfig,
  type BrowserMode,
} from "./browser-mode-config";

test("BROWSER_MODES 枚举 openclaw / chrome / webbridge", () => {
  assert.deepEqual([...BROWSER_MODES], ["openclaw", "chrome", "webbridge"]);
});

test("isBrowserMode 认识合法值", () => {
  assert.equal(isBrowserMode("openclaw"), true);
  assert.equal(isBrowserMode("chrome"), true);
  assert.equal(isBrowserMode("webbridge"), true);
});

test("isBrowserMode 拒绝非法值", () => {
  assert.equal(isBrowserMode("user"), false);
  assert.equal(isBrowserMode(""), false);
  assert.equal(isBrowserMode(null), false);
  assert.equal(isBrowserMode(undefined), false);
  assert.equal(isBrowserMode(123), false);
  assert.equal(isBrowserMode({}), false);
});

test("BrowserMode 类型可直接用作变量标注", () => {
  const m: BrowserMode = "webbridge";
  assert.equal(m, "webbridge");
});

test("applyBrowserModeConfig(openclaw) 写三字段到空 config", () => {
  const result = applyBrowserModeConfig({}, "openclaw");
  assert.deepEqual(result, {
    browser: { defaultProfile: "openclaw" },
    plugins: { entries: { browser: { enabled: true } } },
    skills: { entries: { "kimi-webbridge": { enabled: false } } },
  });
});

test("applyBrowserModeConfig(openclaw) 不 mutate 入参", () => {
  const before = {};
  const after = applyBrowserModeConfig(before, "openclaw");
  assert.deepEqual(before, {}, "入参应保持不变");
  assert.notEqual(before, after, "返回新对象");
});

test("applyBrowserModeConfig(openclaw) 从 chrome 模式切换：覆盖 defaultProfile", () => {
  const before = {
    browser: { defaultProfile: "chrome" },
    plugins: { entries: { browser: { enabled: true } } },
    skills: { entries: { "kimi-webbridge": { enabled: false } } },
  };
  const after = applyBrowserModeConfig(before, "openclaw");
  assert.equal(after.browser.defaultProfile, "openclaw");
  assert.equal(after.plugins.entries.browser.enabled, true);
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, false);
});

test("applyBrowserModeConfig(openclaw) 从 webbridge 模式切换：插件从 false 翻回 true", () => {
  const before = {
    plugins: { entries: { browser: { enabled: false } } },
  };
  const after = applyBrowserModeConfig(before, "openclaw");
  assert.equal(after.plugins.entries.browser.enabled, true);
  assert.equal(after.browser.defaultProfile, "openclaw");
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, false);
});

test("applyBrowserModeConfig(openclaw) 保留其他字段", () => {
  const before = {
    providers: { moonshot: { apiKey: "sk-xxx" } },
    channels: { imessage: { enabled: true } },
    browser: {
      defaultProfile: "openclaw",
      profiles: { custom: { cdpPort: 9999 } },
    },
    plugins: {
      entries: {
        matrix: { enabled: true },
      },
    },
    skills: {
      entries: {
        "some-other-skill": { enabled: true },
      },
    },
  };
  const after = applyBrowserModeConfig(before, "openclaw");
  assert.deepEqual(after.providers, { moonshot: { apiKey: "sk-xxx" } });
  assert.deepEqual(after.channels, { imessage: { enabled: true } });
  assert.deepEqual(after.browser.profiles, { custom: { cdpPort: 9999 } });
  assert.deepEqual(after.plugins.entries.matrix, { enabled: true });
  assert.deepEqual(after.skills.entries["some-other-skill"], { enabled: true });
  assert.equal(after.browser.defaultProfile, "openclaw");
  assert.equal(after.plugins.entries.browser.enabled, true);
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, false);
});

test("applyBrowserModeConfig(chrome) 写三字段到空 config", () => {
  const result = applyBrowserModeConfig({}, "chrome");
  assert.deepEqual(result, {
    browser: { defaultProfile: "chrome" },
    plugins: { entries: { browser: { enabled: true } } },
    skills: { entries: { "kimi-webbridge": { enabled: false } } },
  });
});

test("applyBrowserModeConfig(chrome) 从 openclaw 切换：只改 defaultProfile", () => {
  const before = applyBrowserModeConfig({}, "openclaw");
  const after = applyBrowserModeConfig(before, "chrome");
  assert.equal(after.browser.defaultProfile, "chrome");
  assert.equal(after.plugins.entries.browser.enabled, true);
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, false);
});

test("applyBrowserModeConfig(chrome) 保留用户自定义 browser.profiles.chrome", () => {
  const before = {
    browser: {
      profiles: {
        chrome: { driver: "existing-session", attachOnly: true },
      },
    },
  };
  const after = applyBrowserModeConfig(before, "chrome");
  assert.equal(after.browser.defaultProfile, "chrome");
  assert.deepEqual(after.browser.profiles, {
    chrome: { driver: "existing-session", attachOnly: true },
  });
});
