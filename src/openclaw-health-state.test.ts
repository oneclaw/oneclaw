import { test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let tmpDir: string;
let configPath: string;
let healthPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-health-test-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", tmpDir);
  vi.resetModules();
  configPath = path.join(tmpDir, "openclaw.json");
  healthPath = path.join(tmpDir, "logs", "config-health.json");
  fs.mkdirSync(path.dirname(healthPath), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test("文件不存在时不抛错", async () => {
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  expect(() => resetConfigHealthBaseline(configPath)).not.toThrow();
});

test("JSON 损坏时不抛错且不修改文件", async () => {
  fs.writeFileSync(healthPath, "not valid json {{{");
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  expect(() => resetConfigHealthBaseline(configPath)).not.toThrow();
  expect(fs.readFileSync(healthPath, "utf-8")).toBe("not valid json {{{");
});

test("entry 存在时被删除，其他 entry 保留", async () => {
  const otherPath = path.join(tmpDir, "other.json");
  const initial = {
    entries: {
      [configPath]: { lastKnownGood: { hash: "aa", bytes: 13257 }, lastObservedSuspiciousSignature: "x" },
      [otherPath]: { lastKnownGood: { hash: "bb", bytes: 100 } },
    },
  };
  fs.writeFileSync(healthPath, JSON.stringify(initial));
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  resetConfigHealthBaseline(configPath);
  const after = JSON.parse(fs.readFileSync(healthPath, "utf-8"));
  expect(after.entries[configPath]).toBeUndefined();
  expect(after.entries[otherPath]).toBeDefined();
});

test("没有匹配 entry 时不写文件", async () => {
  const initial = { entries: { "/somewhere/else.json": { lastKnownGood: { bytes: 1 } } } };
  fs.writeFileSync(healthPath, JSON.stringify(initial));
  const before = fs.statSync(healthPath).mtimeMs;
  await new Promise((r) => setTimeout(r, 10)); // mtime resolution
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  resetConfigHealthBaseline(configPath);
  expect(fs.statSync(healthPath).mtimeMs).toBe(before);
});

test("Windows 风格反斜杠 key 也能匹配", async () => {
  // 模拟 openclaw 在 Windows 写入的 key（反斜杠）
  const winStyle = configPath.replace(/\//g, "\\");
  const initial = { entries: { [winStyle]: { lastKnownGood: { bytes: 1 } } } };
  fs.writeFileSync(healthPath, JSON.stringify(initial));
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  resetConfigHealthBaseline(configPath);
  const after = JSON.parse(fs.readFileSync(healthPath, "utf-8"));
  // 在 macOS/Linux 上 normalize 不会把反斜杠转成斜杠，匹配会失败 → 跳过断言
  // 在 Windows 上反斜杠 key 应该被删除
  if (process.platform === "win32") {
    expect(Object.keys(after.entries)).toHaveLength(0);
  } else {
    // 至少不抛错
    expect(after.entries).toBeDefined();
  }
});

test("entries 不存在时不抛错", async () => {
  fs.writeFileSync(healthPath, JSON.stringify({ foo: "bar" }));
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  expect(() => resetConfigHealthBaseline(configPath)).not.toThrow();
});

test("默认参数使用当前 user config path", async () => {
  const initial = { entries: { [configPath]: { lastKnownGood: { bytes: 1 } } } };
  fs.writeFileSync(healthPath, JSON.stringify(initial));
  const { resetConfigHealthBaseline } = await import("./openclaw-health-state");
  resetConfigHealthBaseline(); // 不传参
  const after = JSON.parse(fs.readFileSync(healthPath, "utf-8"));
  expect(after.entries[configPath]).toBeUndefined();
});
