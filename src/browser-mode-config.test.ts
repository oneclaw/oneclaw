import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_MODES,
  isBrowserMode,
  coerceBrowserMode,
  applyBrowserModeConfig,
  detectBrowserMode,
  type BrowserMode,
} from "./browser-mode-config";

test("BROWSER_MODES 枚举 openclaw / user / webbridge", () => {
  assert.deepEqual([...BROWSER_MODES], ["openclaw", "user", "webbridge"]);
});

test("isBrowserMode 认识合法值", () => {
  assert.equal(isBrowserMode("openclaw"), true);
  assert.equal(isBrowserMode("user"), true);
  assert.equal(isBrowserMode("webbridge"), true);
});

test("isBrowserMode 拒绝非法值（包括老 alias 'chrome'）", () => {
  assert.equal(isBrowserMode("chrome"), false);
  assert.equal(isBrowserMode(""), false);
  assert.equal(isBrowserMode(null), false);
  assert.equal(isBrowserMode(undefined), false);
  assert.equal(isBrowserMode(123), false);
  assert.equal(isBrowserMode({}), false);
});

test("coerceBrowserMode 把老 alias 'chrome' 归一化成 'user'", () => {
  assert.equal(coerceBrowserMode("chrome"), "user");
});

test("coerceBrowserMode 直通现行合法值", () => {
  assert.equal(coerceBrowserMode("openclaw"), "openclaw");
  assert.equal(coerceBrowserMode("user"), "user");
  assert.equal(coerceBrowserMode("webbridge"), "webbridge");
});

test("coerceBrowserMode 非法值返回 null", () => {
  assert.equal(coerceBrowserMode(""), null);
  assert.equal(coerceBrowserMode("nope"), null);
  assert.equal(coerceBrowserMode(null), null);
  assert.equal(coerceBrowserMode(undefined), null);
  assert.equal(coerceBrowserMode(42), null);
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

test("applyBrowserModeConfig(openclaw) 从 user 模式切换：覆盖 defaultProfile", () => {
  const before = {
    browser: { defaultProfile: "user" },
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

test("applyBrowserModeConfig(user) 写三字段到空 config（defaultProfile=user）", () => {
  const result = applyBrowserModeConfig({}, "user");
  assert.deepEqual(result, {
    browser: { defaultProfile: "user" },
    plugins: { entries: { browser: { enabled: true } } },
    skills: { entries: { "kimi-webbridge": { enabled: false } } },
  });
});

test("applyBrowserModeConfig(user) 从 openclaw 切换：defaultProfile → user", () => {
  const before = applyBrowserModeConfig({}, "openclaw");
  const after = applyBrowserModeConfig(before, "user");
  assert.equal(after.browser.defaultProfile, "user");
  assert.equal(after.plugins.entries.browser.enabled, true);
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, false);
});

test("applyBrowserModeConfig(user) 清掉旧 driver:extension chrome profile，defaultProfile 归一化为 user", () => {
  const before = {
    browser: {
      profiles: {
        chrome: { driver: "extension", cdpPort: 9222 },
      },
    },
  };
  const after = applyBrowserModeConfig(before, "user");
  assert.equal(after.browser.defaultProfile, "user");
  // 旧 extension relay profile 被 migrate 删掉
  assert.equal(after.browser.profiles, undefined);
});

test("applyBrowserModeConfig(webbridge) 空 config 写 browser.enabled=false + skill.enabled=true", () => {
  const result = applyBrowserModeConfig({}, "webbridge");
  assert.deepEqual(result, {
    plugins: { entries: { browser: { enabled: false } } },
    skills: { entries: { "kimi-webbridge": { enabled: true } } },
  });
  assert.equal(
    result.browser,
    undefined,
    "不应写 browser.defaultProfile（保留默认或老值）",
  );
});

test("applyBrowserModeConfig(webbridge) 保留原有 browser.defaultProfile", () => {
  const before = {
    browser: { defaultProfile: "openclaw" },
  };
  const after = applyBrowserModeConfig(before, "webbridge");
  assert.equal(
    after.browser.defaultProfile,
    "openclaw",
    "原有 defaultProfile 应保留（插件关了反正不 resolve）",
  );
  assert.equal(after.plugins.entries.browser.enabled, false);
});

test("applyBrowserModeConfig(webbridge) 从 openclaw 切过来：browser 关 + skill 翻回 true", () => {
  const before = applyBrowserModeConfig({}, "openclaw");
  const after = applyBrowserModeConfig(before, "webbridge");
  assert.equal(after.plugins.entries.browser.enabled, false);
  assert.equal(after.browser.defaultProfile, "openclaw");
  // openclaw 模式把 skill 关了；切到 webbridge 必须翻回 true，否则 webbridge skill 不会启动
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, true);
});

test("applyBrowserModeConfig(webbridge) 保留其他字段", () => {
  const before = {
    providers: { moonshot: { apiKey: "sk-xxx" } },
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
  const after = applyBrowserModeConfig(before, "webbridge");
  assert.deepEqual(after.providers, { moonshot: { apiKey: "sk-xxx" } });
  assert.deepEqual(after.plugins.entries.matrix, { enabled: true });
  assert.deepEqual(after.skills.entries["some-other-skill"], { enabled: true });
  assert.equal(after.plugins.entries.browser.enabled, false);
  assert.equal(after.skills.entries["kimi-webbridge"].enabled, true);
});

test("detectBrowserMode 空 config → openclaw", () => {
  assert.equal(detectBrowserMode({}), "openclaw");
});

test("detectBrowserMode plugins.entries.browser.enabled=false → webbridge", () => {
  const cfg = { plugins: { entries: { browser: { enabled: false } } } };
  assert.equal(detectBrowserMode(cfg), "webbridge");
});

test("detectBrowserMode defaultProfile=openclaw + browser.enabled=true → openclaw", () => {
  const cfg = applyBrowserModeConfig({}, "openclaw");
  assert.equal(detectBrowserMode(cfg), "openclaw");
});

test("detectBrowserMode defaultProfile=user + browser.enabled=true → user", () => {
  const cfg = applyBrowserModeConfig({}, "user");
  assert.equal(cfg.browser.defaultProfile, "user");
  assert.equal(detectBrowserMode(cfg), "user");
});

test("detectBrowserMode 老配置 defaultProfile=chrome（旧名） → user 模式", () => {
  const cfg = { browser: { defaultProfile: "chrome" } };
  assert.equal(detectBrowserMode(cfg), "user");
});

test("detectBrowserMode 老配置 defaultProfile=chrome-relay → user 模式", () => {
  const cfg = { browser: { defaultProfile: "chrome-relay" } };
  assert.equal(detectBrowserMode(cfg), "user");
});

test("detectBrowserMode webbridge 模式 apply 后能往返", () => {
  const cfg = applyBrowserModeConfig({}, "webbridge");
  assert.equal(detectBrowserMode(cfg), "webbridge");
});

test("detectBrowserMode webbridge 优先级高于 user profile", () => {
  const cfg = applyBrowserModeConfig(
    applyBrowserModeConfig({}, "user"),
    "webbridge",
  );
  assert.equal(detectBrowserMode(cfg), "webbridge");
});

test("detectBrowserMode 未知 defaultProfile 当作 openclaw", () => {
  const cfg = { browser: { defaultProfile: "some-custom" } };
  assert.equal(detectBrowserMode(cfg), "openclaw");
});
