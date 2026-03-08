import test from "node:test";
import assert from "node:assert/strict";
import {
  extractDingtalkConfig,
  saveDingtalkConfig,
  DEFAULT_DINGTALK_SESSION_TIMEOUT_MS,
} from "./dingtalk-config";

test("saveDingtalkConfig 启用时应写入凭据并补齐 gateway token 与 HTTP 端点", () => {
  // 模拟已有高级配置，确保设置页保存不会把插件自定义字段误删。
  const config: Record<string, any> = {
    plugins: {
      entries: {
        "dingtalk-connector": {
          enabled: false,
          customFlag: true,
        },
      },
    },
    channels: {
      "dingtalk-connector": {
        allowFrom: ["USER_A"],
        ackText: "处理中",
        gatewayPassword: "legacy-password",
      },
    },
    gateway: {
      auth: {
        token: "persisted-token",
      },
      controlUi: {
        allowedOrigins: ["https://control.example.com"],
      },
      http: {
        endpoints: {
          chatCompletions: {
            customFlag: true,
            enabled: false,
          },
        },
      },
    },
  };

  saveDingtalkConfig(config, {
    enabled: true,
    clientId: "ding123",
    clientSecret: "secret-1",
    sessionTimeout: 900000,
  });

  assert.equal(config.plugins.entries["dingtalk-connector"].enabled, true);
  assert.equal(config.plugins.entries["dingtalk-connector"].customFlag, true);
  assert.equal(config.channels["dingtalk-connector"].enabled, true);
  assert.equal(config.channels["dingtalk-connector"].clientId, "ding123");
  assert.equal(config.channels["dingtalk-connector"].clientSecret, "secret-1");
  assert.equal(config.channels["dingtalk-connector"].gatewayToken, "persisted-token");
  assert.equal(config.channels["dingtalk-connector"].sessionTimeout, 900000);
  assert.deepEqual(config.channels["dingtalk-connector"].allowFrom, ["USER_A"]);
  assert.equal(config.channels["dingtalk-connector"].ackText, "处理中");
  assert.equal(config.channels["dingtalk-connector"].gatewayPassword, "legacy-password");
  assert.equal(config.gateway.auth.mode, "token");
  assert.equal(config.gateway.http.endpoints.chatCompletions.enabled, true);
  assert.equal(config.gateway.http.endpoints.chatCompletions.customFlag, true);
  assert.ok(config.gateway.controlUi.allowedOrigins.includes("null"));
  assert.ok(config.gateway.controlUi.allowedOrigins.includes("https://control.example.com"));
});

test("saveDingtalkConfig 禁用时应保留凭据并仅关闭开关", () => {
  // 禁用不应抹掉用户已保存的钉钉凭据，便于再次启用。
  const config: Record<string, any> = {
    plugins: {
      entries: {
        "dingtalk-connector": { enabled: true },
      },
    },
    channels: {
      "dingtalk-connector": {
        enabled: true,
        clientId: "ding456",
        clientSecret: "secret-2",
        gatewayToken: "token-2",
      },
    },
  };

  saveDingtalkConfig(config, { enabled: false });

  assert.equal(config.plugins.entries["dingtalk-connector"].enabled, false);
  assert.equal(config.channels["dingtalk-connector"].enabled, false);
  assert.equal(config.channels["dingtalk-connector"].clientId, "ding456");
  assert.equal(config.channels["dingtalk-connector"].clientSecret, "secret-2");
  assert.equal(config.channels["dingtalk-connector"].gatewayToken, "token-2");
});

test("extractDingtalkConfig 应回显基础字段并兜底默认超时", () => {
  // 未显式配置超时时，设置页默认展示 30 分钟。
  const extracted = extractDingtalkConfig({
    plugins: {
      entries: {
        "dingtalk-connector": { enabled: true },
      },
    },
    channels: {
      "dingtalk-connector": {
        clientId: "ding789",
        clientSecret: "secret-3",
      },
    },
  });

  assert.deepEqual(extracted, {
    enabled: true,
    clientId: "ding789",
    clientSecret: "secret-3",
    sessionTimeout: DEFAULT_DINGTALK_SESSION_TIMEOUT_MS,
  });
});
