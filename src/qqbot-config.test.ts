import test from "node:test";
import assert from "node:assert/strict";
import { extractQqbotConfig, saveQqbotConfig } from "./qqbot-config";

test("saveQqbotConfig 启用时应写入插件开关并保留 allowFrom", () => {
  // 模拟已有高级配置，确保设置页保存不会把其它字段误删。
  const config: Record<string, any> = {
    plugins: {
      entries: {
        qqbot: {
          enabled: false,
          customFlag: true,
        },
      },
    },
    channels: {
      qqbot: {
        allowFrom: ["USER_A"],
        systemPrompt: "keep-me",
        clientSecretFile: "/tmp/old-secret",
      },
    },
  };

  saveQqbotConfig(config, {
    enabled: true,
    appId: "1024",
    clientSecret: "secret-1",
    markdownSupport: false,
  });

  assert.equal(config.plugins.entries.qqbot.enabled, true);
  assert.equal(config.plugins.entries.qqbot.customFlag, true);
  assert.equal(config.channels.qqbot.enabled, true);
  assert.equal(config.channels.qqbot.appId, "1024");
  assert.equal(config.channels.qqbot.clientSecret, "secret-1");
  assert.equal(config.channels.qqbot.markdownSupport, false);
  assert.deepEqual(config.channels.qqbot.allowFrom, ["USER_A"]);
  assert.equal(config.channels.qqbot.systemPrompt, "keep-me");
  assert.equal("clientSecretFile" in config.channels.qqbot, false);
});

test("saveQqbotConfig 禁用时应保留凭据并仅关闭开关", () => {
  // 禁用不应抹掉用户已保存的 QQ 凭据，便于再次启用。
  const config: Record<string, any> = {
    plugins: {
      entries: {
        qqbot: { enabled: true },
      },
    },
    channels: {
      qqbot: {
        enabled: true,
        appId: "2048",
        clientSecret: "secret-2",
      },
    },
  };

  saveQqbotConfig(config, { enabled: false });

  assert.equal(config.plugins.entries.qqbot.enabled, false);
  assert.equal(config.channels.qqbot.enabled, false);
  assert.equal(config.channels.qqbot.appId, "2048");
  assert.equal(config.channels.qqbot.clientSecret, "secret-2");
});

test("extractQqbotConfig 应回显基础字段并兜底 markdownSupport 默认值", () => {
  // 未显式关闭 markdown 时，设置页默认展示为开启。
  const extracted = extractQqbotConfig({
    plugins: {
      entries: {
        qqbot: { enabled: true },
      },
    },
    channels: {
      qqbot: {
        appId: "4096",
        clientSecret: "secret-3",
      },
    },
  });

  assert.deepEqual(extracted, {
    enabled: true,
    appId: "4096",
    clientSecret: "secret-3",
    markdownSupport: true,
  });
});
