import test from "node:test";
import assert from "node:assert/strict";
import {
  isFeishuEnabled,
  migrateLegacyFeishuPluginEntry,
  setFeishuChannelEnabled,
} from "./feishu-config";

test("migrateLegacyFeishuPluginEntry 应把旧插件开关迁移到 channels.feishu.enabled 并移除插件开关", () => {
  const config: Record<string, any> = {
    channels: {
      feishu: {
        enabled: true,
        appId: "cli_a",
        dmPolicy: "pairing",
      },
    },
    plugins: {
      allow: ["openclaw-weixin", "wecom-openclaw-plugin", "kimi", "browser"],
      entries: {
        feishu: { enabled: true },
        kimi: { enabled: true },
      },
    },
  };

  const changed = migrateLegacyFeishuPluginEntry(config);

  assert.equal(changed, true);
  assert.equal(config.channels.feishu.enabled, true);
  assert.equal(config.channels.feishu.appId, "cli_a");
  assert.deepEqual(config.plugins.allow, ["openclaw-weixin", "wecom-openclaw-plugin", "kimi", "browser"]);
  assert.equal(config.plugins.entries.feishu, undefined);
  assert.equal(config.plugins.entries.kimi.enabled, true);
});

test("migrateLegacyFeishuPluginEntry 应以旧插件开关为准，避免用户禁用后被 channels 旧值重新启用", () => {
  const config: Record<string, any> = {
    channels: {
      feishu: {
        enabled: true,
        appId: "cli_disabled",
      },
    },
    plugins: {
      entries: {
        feishu: { enabled: false },
      },
    },
  };

  const changed = migrateLegacyFeishuPluginEntry(config);

  assert.equal(changed, true);
  assert.equal(config.channels.feishu.enabled, false);
  assert.equal(config.channels.feishu.appId, "cli_disabled");
  assert.equal(config.plugins.entries.feishu, undefined);
});

test("setFeishuChannelEnabled 启用时只写 channels 开关并删除遗留插件配置", () => {
  const config: Record<string, any> = {
    channels: {
      feishu: {
        appId: "cli_new",
        appSecret: "secret",
        groupPolicy: "allowlist",
      },
    },
    plugins: {
      allow: ["openclaw-weixin"],
      entries: {
        feishu: { enabled: false, config: { keep: true } },
      },
    },
  };

  const changed = setFeishuChannelEnabled(config, true);

  assert.equal(changed, true);
  assert.equal(config.channels.feishu.enabled, true);
  assert.equal(config.channels.feishu.appSecret, "secret");
  assert.equal(config.plugins.entries.feishu, undefined);
  assert.deepEqual(config.plugins.allow, ["openclaw-weixin"]);
});

test("isFeishuEnabled 读取迁移前配置时优先沿用旧插件开关，迁移后读取 channels 开关", () => {
  const legacyDisabled: Record<string, any> = {
    channels: { feishu: { enabled: true } },
    plugins: { entries: { feishu: { enabled: false } } },
  };
  const migratedEnabled: Record<string, any> = {
    channels: { feishu: { enabled: true } },
    plugins: { allow: ["openclaw-weixin"] },
  };

  assert.equal(isFeishuEnabled(legacyDisabled), false);
  assert.equal(isFeishuEnabled(migratedEnabled), true);
});
