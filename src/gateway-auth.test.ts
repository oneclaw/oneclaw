import test from "node:test";
import assert from "node:assert/strict";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";

test("ensureGatewayAuthTokenInConfig 应为 Electron file:// 场景补全 null origin 白名单", () => {
  // 模拟首次初始化配置：仅有最小 gateway 配置。
  const config: Record<string, any> = {
    gateway: {
      mode: "local",
      auth: {
        mode: "token",
      },
    },
  };

  ensureGatewayAuthTokenInConfig(config);

  assert.ok(Array.isArray(config.gateway.controlUi?.allowedOrigins));
  assert.ok(config.gateway.controlUi.allowedOrigins.includes("null"));
});

test("ensureGatewayAuthTokenInConfig 不应覆盖用户已有 allowedOrigins", () => {
  // 用户已配置自定义来源时，函数只做补全不做破坏性覆盖。
  const config: Record<string, any> = {
    gateway: {
      controlUi: {
        allowedOrigins: ["https://control.example.com"],
      },
      auth: {
        mode: "token",
        token: "fixed-token",
      },
    },
  };

  ensureGatewayAuthTokenInConfig(config);

  assert.ok(config.gateway.controlUi.allowedOrigins.includes("https://control.example.com"));
  assert.ok(config.gateway.controlUi.allowedOrigins.includes("null"));
});
