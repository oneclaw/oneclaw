import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultBrowser } from "./default-browser-detector";

test("Win + ChromeHTML → chrome", () => {
  const r = getDefaultBrowser({
    platform: "win32",
    runReg: () => "ChromeHTML",
    readPlist: () => null,
  });
  assert.equal(r?.target.id, "chrome");
});

test("Win + MSEdgeHTM → edge", () => {
  const r = getDefaultBrowser({
    platform: "win32",
    runReg: () => "MSEdgeHTM",
    readPlist: () => null,
  });
  assert.equal(r?.target.id, "edge");
});

test("Win + MSEdgeMHT (Edge legacy) → edge", () => {
  const r = getDefaultBrowser({
    platform: "win32",
    runReg: () => "MSEdgeMHT",
    readPlist: () => null,
  });
  assert.equal(r?.target.id, "edge");
});

test("Win + FirefoxURL-... → null", () => {
  const r = getDefaultBrowser({
    platform: "win32",
    runReg: () => "FirefoxURL-308046B0AF4A39CB",
    readPlist: () => null,
  });
  assert.equal(r, null);
});

test("Win + reg 报错 → null（不抛）", () => {
  const r = getDefaultBrowser({
    platform: "win32",
    runReg: () => {
      throw new Error("reg failed");
    },
    readPlist: () => null,
  });
  assert.equal(r, null);
});

test("Win + reg 返 null（key 缺）→ null", () => {
  const r = getDefaultBrowser({
    platform: "win32",
    runReg: () => null,
    readPlist: () => null,
  });
  assert.equal(r, null);
});

test("Mac + com.google.chrome → chrome", () => {
  const r = getDefaultBrowser({
    platform: "darwin",
    runReg: () => null,
    readPlist: () => ({
      LSHandlers: [
        { LSHandlerURLScheme: "https", LSHandlerRoleAll: "com.google.chrome" },
      ],
    }),
  });
  assert.equal(r?.target.id, "chrome");
});

test("Mac + com.microsoft.edgemac → edge", () => {
  const r = getDefaultBrowser({
    platform: "darwin",
    runReg: () => null,
    readPlist: () => ({
      LSHandlers: [
        {
          LSHandlerURLScheme: "https",
          LSHandlerRoleAll: "com.microsoft.edgemac",
        },
      ],
    }),
  });
  assert.equal(r?.target.id, "edge");
});

test("Mac + com.apple.safari → null", () => {
  const r = getDefaultBrowser({
    platform: "darwin",
    runReg: () => null,
    readPlist: () => ({
      LSHandlers: [
        { LSHandlerURLScheme: "https", LSHandlerRoleAll: "com.apple.safari" },
      ],
    }),
  });
  assert.equal(r, null);
});

test("Mac plist 缺 https handler → null", () => {
  const r = getDefaultBrowser({
    platform: "darwin",
    runReg: () => null,
    readPlist: () => ({ LSHandlers: [] }),
  });
  assert.equal(r, null);
});

test("Mac plist 整体 null → null", () => {
  const r = getDefaultBrowser({
    platform: "darwin",
    runReg: () => null,
    readPlist: () => null,
  });
  assert.equal(r, null);
});

test("Linux → null（不支持）", () => {
  const r = getDefaultBrowser({
    platform: "linux",
    runReg: () => "ChromeHTML",
    readPlist: () => null,
  });
  assert.equal(r, null);
});

test("Mac + 大小写不一致 bundle id (Com.Google.Chrome) → chrome", () => {
  const r = getDefaultBrowser({
    platform: "darwin",
    runReg: () => null,
    readPlist: () => ({
      LSHandlers: [
        { LSHandlerURLScheme: "https", LSHandlerRoleAll: "Com.Google.Chrome" },
      ],
    }),
  });
  assert.equal(r?.target.id, "chrome");
});
