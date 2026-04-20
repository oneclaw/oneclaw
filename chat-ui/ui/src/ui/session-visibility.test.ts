import assert from "node:assert/strict";
import {
  hasVisibleSession,
  resolveVisibleSessionFallback,
  resolveVisibleSessionSelection,
} from "./session-visibility.ts";

function testFallbackPrefersFirstVisibleSessionWhenMainIsHidden() {
  const hello = {
    snapshot: {
      sessionDefaults: {
        mainSessionKey: "main",
      },
    },
  } as any;
  const sessions = {
    sessions: [{ key: "foo" }, { key: "bar" }],
  } as any;

  assert.equal(hasVisibleSession(sessions, "main"), false);
  assert.equal(resolveVisibleSessionFallback(hello, sessions), "foo");
  assert.equal(resolveVisibleSessionSelection("main", hello, sessions), "foo");
}

function testFallbackStillUsesMainWhenItIsVisible() {
  const hello = {
    snapshot: {
      sessionDefaults: {
        mainSessionKey: "main",
      },
    },
  } as any;
  const sessions = {
    sessions: [{ key: "main" }, { key: "foo" }],
  } as any;

  assert.equal(resolveVisibleSessionFallback(hello, sessions), "main");
}

function main() {
  testFallbackPrefersFirstVisibleSessionWhenMainIsHidden();
  testFallbackStillUsesMainWhenItIsVisible();
  console.log("session visibility tests passed");
}

main();
