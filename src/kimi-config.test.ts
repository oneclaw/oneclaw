import { test, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-kimi-test-"));
  vi.stubEnv("OPENCLAW_STATE_DIR", tmpDir);
  vi.resetModules();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

test("ensureKimiPluginDeviceId 给缺失 deviceId 的 bridge 补上稳定 UUID", async () => {
  const { ensureKimiPluginDeviceId } = await import("./kimi-config");
  const config = {
    plugins: {
      entries: {
        "kimi-claw": {
          enabled: true,
          config: {
            bridge: { mode: "acp", url: "wss://x", token: "t" },
          },
        },
      },
    },
  };
  expect(ensureKimiPluginDeviceId(config)).toBe(true);
  const id = config.plugins.entries["kimi-claw"].config.bridge.deviceId;
  expect(typeof id).toBe("string");
  expect(id.length).toBeGreaterThan(0);
});

test("ensureKimiPluginDeviceId 对已有非空 deviceId 幂等不覆盖", async () => {
  const { ensureKimiPluginDeviceId } = await import("./kimi-config");
  const config = {
    plugins: {
      entries: {
        "kimi-claw": {
          enabled: true,
          config: {
            bridge: { mode: "acp", url: "wss://x", token: "t", deviceId: "existing-id" },
          },
        },
      },
    },
  };
  expect(ensureKimiPluginDeviceId(config)).toBe(false);
  expect(config.plugins.entries["kimi-claw"].config.bridge.deviceId).toBe("existing-id");
});

test("ensureKimiPluginDeviceId 同一机器上两次调用返回同一 UUID", async () => {
  const { ensureKimiPluginDeviceId } = await import("./kimi-config");
  const c1: any = { plugins: { entries: { "kimi-claw": { config: { bridge: {} } } } } };
  const c2: any = { plugins: { entries: { "kimi-claw": { config: { bridge: {} } } } } };
  expect(ensureKimiPluginDeviceId(c1)).toBe(true);
  expect(ensureKimiPluginDeviceId(c2)).toBe(true);
  expect(c1.plugins.entries["kimi-claw"].config.bridge.deviceId)
    .toBe(c2.plugins.entries["kimi-claw"].config.bridge.deviceId);
});

test("ensureKimiPluginDeviceId 不动未启用 kimi-claw 的配置", async () => {
  const { ensureKimiPluginDeviceId } = await import("./kimi-config");
  const config: any = { plugins: { entries: {} } };
  expect(ensureKimiPluginDeviceId(config)).toBe(false);
  expect(Object.keys(config.plugins.entries)).toHaveLength(0);
});

test("ensureKimiPluginDeviceId 空字符串 deviceId 视为缺失，重新填写", async () => {
  const { ensureKimiPluginDeviceId } = await import("./kimi-config");
  const config: any = {
    plugins: {
      entries: {
        "kimi-claw": { config: { bridge: { deviceId: "   " } } },
      },
    },
  };
  expect(ensureKimiPluginDeviceId(config)).toBe(true);
  expect(config.plugins.entries["kimi-claw"].config.bridge.deviceId).not.toBe("   ");
});

test("saveKimiPluginConfig 在 bridge 里写入 deviceId", async () => {
  const { saveKimiPluginConfig } = await import("./kimi-config");
  const config: any = {};
  saveKimiPluginConfig(config, { botToken: "tok", gatewayToken: "gw", wsURL: "wss://x" });
  const bridge = config.plugins.entries["kimi-claw"].config.bridge;
  expect(typeof bridge.deviceId).toBe("string");
  expect(bridge.deviceId.length).toBeGreaterThan(0);
  expect(bridge.mode).toBe("acp");
  expect(bridge.token).toBe("tok");
});
