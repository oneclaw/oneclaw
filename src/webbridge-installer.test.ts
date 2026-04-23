import test from "node:test";
import assert from "node:assert/strict";
import {
  resolvePlatformBinaryName,
  buildDownloadUrl,
  resolveWebbridgeVersion,
  CDN_BASE_URL,
} from "./webbridge-installer";

test("resolvePlatformBinaryName 映射 darwin-arm64", () => {
  assert.equal(
    resolvePlatformBinaryName("darwin", "arm64"),
    "kimi-webbridge-darwin-arm64",
  );
});

test("resolvePlatformBinaryName 映射 darwin-x64", () => {
  assert.equal(
    resolvePlatformBinaryName("darwin", "x64"),
    "kimi-webbridge-darwin-amd64",
  );
});

test("resolvePlatformBinaryName 映射 win32-x64", () => {
  assert.equal(
    resolvePlatformBinaryName("win32", "x64"),
    "kimi-webbridge-windows-amd64.exe",
  );
});

test("resolvePlatformBinaryName win32-arm64 回退到 amd64（Windows 11 ARM 支持 x64 模拟）", () => {
  assert.equal(
    resolvePlatformBinaryName("win32", "arm64"),
    "kimi-webbridge-windows-amd64.exe",
  );
});

test("resolvePlatformBinaryName 未支持平台抛错", () => {
  assert.throws(
    () => resolvePlatformBinaryName("linux", "x64"),
    /Unsupported platform: linux-x64/,
  );
});

test("CDN_BASE_URL 指向 Moonshot 官方 CDN", () => {
  assert.equal(
    CDN_BASE_URL,
    "https://kimi-web-img.moonshot.cn/webbridge",
  );
});

test("buildDownloadUrl 拼接 version + filename", () => {
  assert.equal(
    buildDownloadUrl("latest", "kimi-webbridge-darwin-arm64"),
    "https://kimi-web-img.moonshot.cn/webbridge/latest/releases/kimi-webbridge-darwin-arm64",
  );
});

test("buildDownloadUrl 支持 pin 到具体版本", () => {
  assert.equal(
    buildDownloadUrl("0.3.0", "kimi-webbridge-windows-amd64.exe"),
    "https://kimi-web-img.moonshot.cn/webbridge/0.3.0/releases/kimi-webbridge-windows-amd64.exe",
  );
});

test("resolveWebbridgeVersion 默认 latest", () => {
  const original = process.env.KIMI_WEBBRIDGE_VERSION;
  delete process.env.KIMI_WEBBRIDGE_VERSION;
  try {
    assert.equal(resolveWebbridgeVersion(), "latest");
  } finally {
    if (original !== undefined) process.env.KIMI_WEBBRIDGE_VERSION = original;
  }
});

test("resolveWebbridgeVersion 读 KIMI_WEBBRIDGE_VERSION env", () => {
  const original = process.env.KIMI_WEBBRIDGE_VERSION;
  process.env.KIMI_WEBBRIDGE_VERSION = "0.3.0";
  try {
    assert.equal(resolveWebbridgeVersion(), "0.3.0");
  } finally {
    if (original === undefined) delete process.env.KIMI_WEBBRIDGE_VERSION;
    else process.env.KIMI_WEBBRIDGE_VERSION = original;
  }
});

test("resolveWebbridgeVersion 接受参数覆盖", () => {
  assert.equal(resolveWebbridgeVersion("1.0.0"), "1.0.0");
});
