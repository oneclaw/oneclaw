import test from "node:test";
import assert from "node:assert/strict";
import * as path from "path";
import {
  resolveWebbridgeDataDir,
  resolveWebbridgeBinaryPath,
} from "./constants";

test("resolveWebbridgeDataDir 应指向 HOME/.kimi-webbridge", () => {
  const dir = resolveWebbridgeDataDir();
  const home = process.env.HOME || process.env.USERPROFILE || "";
  assert.equal(dir, path.join(home, ".kimi-webbridge"));
});

test("resolveWebbridgeBinaryPath 在非 Windows 下应指向 bin/kimi-webbridge", () => {
  if (process.platform === "win32") return;
  const p = resolveWebbridgeBinaryPath();
  assert.ok(p.endsWith("/.kimi-webbridge/bin/kimi-webbridge"));
});
