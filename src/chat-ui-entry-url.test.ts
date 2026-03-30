import test from "node:test";
import assert from "node:assert/strict";
import { buildChatUiEntryUrl } from "./chat-ui-entry-url";

test("buildChatUiEntryUrl 应在首次加载时携带 gatewayUrl 和 token，避免二次 reload", () => {
  const url = buildChatUiEntryUrl("/tmp/chat-ui/index.html", {
    port: 18789,
    token: "secret-token",
  });

  assert.match(url, /^file:/);
  assert.match(url, /gatewayUrl=ws%3A%2F%2F127\.0\.0\.1%3A18789/);
  assert.match(url, /token=secret-token/);
});

test("buildChatUiEntryUrl 在无 token 时也应保留 gatewayUrl，但不应附带空 token", () => {
  const url = buildChatUiEntryUrl("/tmp/chat-ui/index.html", { port: 18789 });
  assert.doesNotMatch(url, /token=/);
  assert.match(url, /gatewayUrl=ws%3A%2F%2F127\.0\.0\.1%3A18789/);
});
