import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPosixWrapperForPaths,
  buildWinWrapperForPaths,
  buildWinPathEnvScript,
} from "./cli-integration";

test("POSIX wrapper 应显式注入 OPENCLAW_NO_RESPAWN=1", () => {
  const script = buildPosixWrapperForPaths("/Applications/OneClaw/node", "/Applications/OneClaw/openclaw.mjs");

  assert.ok(script.includes("OPENCLAW_NO_RESPAWN=1"));
  assert.ok(script.includes('exec "$APP_NODE" "$APP_ENTRY" "$@"'));
});

test("Windows wrapper 应显式注入 OPENCLAW_NO_RESPAWN=1", () => {
  const script = buildWinWrapperForPaths("C:\\OneClaw\\node.exe", "C:\\OneClaw\\openclaw.mjs");

  assert.ok(script.includes('set "OPENCLAW_NO_RESPAWN=1"'));
  assert.ok(script.includes('"%APP_NODE%" "%APP_ENTRY%" %*'));
});

test("Windows PATH 脚本中的 try/catch 不能被分号打断", () => {
  const script = buildWinPathEnvScript("add", "C:\\Users\\admin\\AppData\\Local\\OneClaw\\bin");
  assert.equal(/}\s*;\s*catch\s*{/.test(script), false);
  assert.ok(/try\s*{[\s\S]*catch\s*{/.test(script));
});
