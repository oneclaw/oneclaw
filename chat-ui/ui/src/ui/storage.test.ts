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
