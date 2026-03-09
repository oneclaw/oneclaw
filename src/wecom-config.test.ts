import test from "node:test";
import assert from "node:assert/strict";
import { extractWecomConfig, saveWecomConfig } from "./wecom-config";

test("saveWecomConfig 启用时应写入凭据并保留高级字段", () => {
  // 模拟已有高级配置，确保设置页保存不会把用户手写字段抹掉。
  const config: Record<string, any> = {
    plugins: {
      entries: {
        "wecom-openclaw-plugin": {
          enabled: false,
          customFlag: true,
        },
      },
    },
    channels: {
      wecom: {
        allowFrom: ["USER_A"],
        groupAllowFrom: ["room-alpha"],
        websocketUrl: "wss://custom.work.weixin.qq.com",
        sendThinkingMessage: false,
      },
    },
  };

  saveWecomConfig(config, {
    enabled: true,
    botId: "bot-123",
    secret: "secret-1",
    dmPolicy: "open",
    groupPolicy: "allowlist",
    groupAllowFrom: ["room-beta", "room-gamma"],
  });

  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].enabled, true);
  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].customFlag, true);
  assert.equal(config.channels.wecom.enabled, true);
  assert.equal(config.channels.wecom.botId, "bot-123");
  assert.equal(config.channels.wecom.secret, "secret-1");
  assert.equal(config.channels.wecom.dmPolicy, "open");
  assert.equal(config.channels.wecom.groupPolicy, "allowlist");
  assert.deepEqual(config.channels.wecom.groupAllowFrom, ["room-beta", "room-gamma"]);
  assert.deepEqual(config.channels.wecom.allowFrom, ["*"]);
  assert.equal(config.channels.wecom.websocketUrl, "wss://custom.work.weixin.qq.com");
  assert.equal(config.channels.wecom.sendThinkingMessage, false);
});

test("saveWecomConfig 禁用时应保留凭据并仅关闭开关", () => {
  // 禁用不应删掉 Bot ID / Secret，避免用户再次启用时重新填写。
  const config: Record<string, any> = {
    plugins: {
      entries: {
        "wecom-openclaw-plugin": { enabled: true },
      },
    },
    channels: {
      wecom: {
        enabled: true,
        botId: "bot-456",
        secret: "secret-2",
        dmPolicy: "pairing",
      },
    },
  };

  saveWecomConfig(config, { enabled: false });

  assert.equal(config.plugins.entries["wecom-openclaw-plugin"].enabled, false);
  assert.equal(config.channels.wecom.enabled, false);
  assert.equal(config.channels.wecom.botId, "bot-456");
  assert.equal(config.channels.wecom.secret, "secret-2");
  assert.equal(config.channels.wecom.dmPolicy, "pairing");
});

test("extractWecomConfig 应回显基础字段并提供策略默认值", () => {
  // 未显式配置策略时，设置页应展示插件的默认策略。
  const extracted = extractWecomConfig({
    plugins: {
      entries: {
        "wecom-openclaw-plugin": { enabled: true },
      },
    },
    channels: {
      wecom: {
        botId: "bot-789",
        secret: "secret-3",
      },
    },
  });

  assert.deepEqual(extracted, {
    enabled: true,
    botId: "bot-789",
    secret: "secret-3",
    dmPolicy: "pairing",
    groupPolicy: "open",
    groupAllowFrom: [],
  });
});
