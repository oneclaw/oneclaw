import test from "node:test";
import assert from "node:assert/strict";
import {
  migrateBrowserProfileForCurrentGateway,
  normalizeRequestedBrowserProfileForSave,
} from "./browser-profile-config.ts";

test("Chrome 模式保存时应将缺失的 legacy chrome-relay 映射到 user", () => {
  const config = { browser: { defaultProfile: "openclaw" } };

  assert.equal(normalizeRequestedBrowserProfileForSave(config, "chrome-relay"), "user");
  assert.equal(normalizeRequestedBrowserProfileForSave(config, "chrome"), "user");
});

test("已有可用自定义 profile 时不应改写用户显式 profile", () => {
  const config = {
    browser: {
      profiles: {
        "chrome-relay": { cdpUrl: "http://127.0.0.1:18801", color: "#00AA00" },
      },
    },
  };

  assert.equal(normalizeRequestedBrowserProfileForSave(config, "chrome-relay"), "chrome-relay");
});

test("启动迁移应修复缺失的 chrome-relay 默认 profile", () => {
  const config = { browser: { defaultProfile: "chrome-relay" } };

  assert.equal(migrateBrowserProfileForCurrentGateway(config), true);
  assert.equal(config.browser.defaultProfile, "user");
});

test("启动迁移应移除旧 extension driver profile 并切到 user", () => {
  const config = {
    browser: {
      defaultProfile: "chrome-relay",
      profiles: {
        chrome: { driver: "extension", cdpUrl: "http://127.0.0.1:18790", color: "#00AA00" },
        "chrome-relay": { driver: "extension", cdpUrl: "http://127.0.0.1:18791", color: "#00AA00" },
      },
    },
  };

  assert.equal(migrateBrowserProfileForCurrentGateway(config), true);
  assert.equal(config.browser.defaultProfile, "user");
  assert.equal("profiles" in config.browser, false);
});
