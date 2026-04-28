import test from "node:test";
import assert from "node:assert/strict";
import { parseUiSettings } from "./storage.ts";

test("file 协议下应优先信任主进程注入的 gatewayUrl，覆盖旧缓存", () => {
  const settings = parseUiSettings(
    JSON.stringify({
      gatewayUrl: "ws://127.0.0.1:19466",
      token: "cached-token",
    }),
    {
      protocol: "file:",
      host: "",
      search: "?gatewayUrl=ws%3A%2F%2F127.0.0.1%3A18789",
      hash: "",
    },
  );

  assert.equal(settings.gatewayUrl, "ws://127.0.0.1:18789");
  assert.equal(settings.token, "cached-token");
});

test("网页场景不应静默信任 query 中的 gatewayUrl，仍应保留原配置", () => {
  const settings = parseUiSettings(
    JSON.stringify({
      gatewayUrl: "wss://persisted.example/ws",
    }),
    {
      protocol: "https:",
      host: "control.example",
      search: "?gatewayUrl=wss%3A%2F%2Foverride.example%2Fws",
      hash: "",
    },
  );

  assert.equal(settings.gatewayUrl, "wss://persisted.example/ws");
});

test("file 协议下应从 URL fragment 读取首屏视图，确保 Setup 直接首帧生效", () => {
  const settings = parseUiSettings(null, {
    protocol: "file:",
    host: "",
    search: "",
    hash: "#view=setup",
  });

  assert.equal(settings.oneclawView, "setup");
});

test("网页场景不应信任 URL 注入的 oneclawView", () => {
  const settings = parseUiSettings(null, {
    protocol: "https:",
    host: "control.example",
    search: "",
    hash: "#view=setup",
  });

  assert.equal(settings.oneclawView, "chat");
});
