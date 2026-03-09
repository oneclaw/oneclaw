import { test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

vi.mock("electron", () => ({
  app: { getVersion: () => "2026.3.10" },
}));

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-config-test-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", tmpDir);
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test("readOneclawConfig 无文件时返回 null", async () => {
  const { readOneclawConfig } = await import("./oneclaw-config");
  expect(readOneclawConfig()).toBeNull();
});

test("writeOneclawConfig + readOneclawConfig 往返一致", async () => {
  const { readOneclawConfig, writeOneclawConfig } = await import("./oneclaw-config");
  const config = {
    deviceId: "test-uuid",
    setupCompletedAt: "2026-03-10T00:00:00.000Z",
  };
  writeOneclawConfig(config);
  expect(readOneclawConfig()).toEqual(config);
});

test("detectOwnership 无任何文件时返回 fresh", async () => {
  const { detectOwnership } = await import("./oneclaw-config");
  expect(detectOwnership()).toBe("fresh");
});

test("detectOwnership 有 oneclaw.config.json + setupCompletedAt 时返回 oneclaw", async () => {
  const { writeOneclawConfig, detectOwnership } = await import("./oneclaw-config");
  writeOneclawConfig({
    deviceId: "id",
    setupCompletedAt: "2026-03-10T00:00:00.000Z",
  });
  expect(detectOwnership()).toBe("oneclaw");
});

test("detectOwnership 有 setup-baseline 文件时返回 legacy-oneclaw", async () => {
  const { detectOwnership } = await import("./oneclaw-config");
  fs.writeFileSync(path.join(tmpDir, "openclaw-setup-baseline.json"), "{}", "utf-8");
  expect(detectOwnership()).toBe("legacy-oneclaw");
});

test("detectOwnership 有 .device-id 但无 OneClaw 独有文件时返回 external-openclaw", async () => {
  const { detectOwnership } = await import("./oneclaw-config");
  fs.writeFileSync(path.join(tmpDir, ".device-id"), "some-uuid", "utf-8");
  fs.writeFileSync(path.join(tmpDir, "openclaw.json"), "{}", "utf-8");
  expect(detectOwnership()).toBe("external-openclaw");
});

test("detectOwnership 有 openclaw.json 无 .device-id 无 oneclaw.config.json 时返回 external-openclaw", async () => {
  const { detectOwnership } = await import("./oneclaw-config");
  fs.writeFileSync(path.join(tmpDir, "openclaw.json"), "{}", "utf-8");
  expect(detectOwnership()).toBe("external-openclaw");
});

test("migrateFromLegacy 从 .device-id 和 wizard.lastRunAt 迁移", async () => {
  const { migrateFromLegacy, readOneclawConfig } = await import("./oneclaw-config");
  fs.writeFileSync(path.join(tmpDir, ".device-id"), "legacy-uuid", "utf-8");
  fs.writeFileSync(
    path.join(tmpDir, "openclaw.json"),
    JSON.stringify({ wizard: { lastRunAt: "2026-01-01T00:00:00.000Z" } }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(tmpDir, "skill-store.json"),
    JSON.stringify({ registryUrl: "https://custom.registry" }),
    "utf-8",
  );

  const result = migrateFromLegacy();
  expect(result.deviceId).toBe("legacy-uuid");
  expect(result.setupCompletedAt).toBe("2026-01-01T00:00:00.000Z");
  expect(result.skillStore?.registryUrl).toBe("https://custom.registry");

  const saved = readOneclawConfig();
  expect(saved?.deviceId).toBe("legacy-uuid");
});

test("markSetupComplete 写入 setupCompletedAt", async () => {
  const { markSetupComplete, readOneclawConfig } = await import("./oneclaw-config");
  markSetupComplete();
  const config = readOneclawConfig();
  expect(config?.setupCompletedAt).toBeTruthy();
  expect(typeof config?.setupCompletedAt).toBe("string");
});
