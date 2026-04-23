import test from "node:test";
import assert from "node:assert/strict";
import {
  BROWSER_MODES,
  isBrowserMode,
  type BrowserMode,
} from "./browser-mode-config";

test("BROWSER_MODES 枚举 openclaw / chrome / webbridge", () => {
  assert.deepEqual([...BROWSER_MODES], ["openclaw", "chrome", "webbridge"]);
});

test("isBrowserMode 认识合法值", () => {
  assert.equal(isBrowserMode("openclaw"), true);
  assert.equal(isBrowserMode("chrome"), true);
  assert.equal(isBrowserMode("webbridge"), true);
});

test("isBrowserMode 拒绝非法值", () => {
  assert.equal(isBrowserMode("user"), false);
  assert.equal(isBrowserMode(""), false);
  assert.equal(isBrowserMode(null), false);
  assert.equal(isBrowserMode(undefined), false);
  assert.equal(isBrowserMode(123), false);
  assert.equal(isBrowserMode({}), false);
});

test("BrowserMode 类型可直接用作变量标注", () => {
  const m: BrowserMode = "webbridge";
  assert.equal(m, "webbridge");
});
