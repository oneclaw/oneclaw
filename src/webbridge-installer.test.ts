import test from "node:test";
import assert from "node:assert/strict";
import { resolvePlatformBinaryName } from "./webbridge-installer";

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
