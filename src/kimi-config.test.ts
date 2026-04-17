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

test("resolveKimiBridgeURL override 非空时返回 override", async () => {
  const { resolveKimiBridgeURL } = await import("./kimi-config");
  expect(resolveKimiBridgeURL("wss://kimi-file.msdev.cc/api-claw/bots/agent-ws"))
    .toBe("wss://kimi-file.msdev.cc/api-claw/bots/agent-ws");
});

test("resolveKimiBridgeURL 空/undefined override 回退到生产默认", async () => {
  const { resolveKimiBridgeURL, DEFAULT_KIMI_BRIDGE_WS_URL } = await import("./kimi-config");
  expect(resolveKimiBridgeURL()).toBe(DEFAULT_KIMI_BRIDGE_WS_URL);
  expect(resolveKimiBridgeURL("")).toBe(DEFAULT_KIMI_BRIDGE_WS_URL);
  expect(resolveKimiBridgeURL("   ")).toBe(DEFAULT_KIMI_BRIDGE_WS_URL);
});

test("parseKimiInstallCommand 从完整 install 命令抽出三项", async () => {
  const { parseKimiInstallCommand } = await import("./kimi-config");
  const cmd =
    "bash <(curl -fsSL https://kimi-img.moonshot.cn/pub/claw/scripts/claw_install.sh) " +
    "--bot-token km_b_dev_6NdVn5jeCBg6dzCSWGJLUJ2jOH4bAbk8 " +
    "--ws-url wss://kimi-file.msdev.cc/api-claw/bots/agent-ws " +
    "--kimiapi-host https://kimi-file.msdev.cc/api-claw";
  const r = parseKimiInstallCommand(cmd);
  expect(r.botToken).toBe("km_b_dev_6NdVn5jeCBg6dzCSWGJLUJ2jOH4bAbk8");
  expect(r.wsURL).toBe("wss://kimi-file.msdev.cc/api-claw/bots/agent-ws");
  expect(r.kimiapiHost).toBe("https://kimi-file.msdev.cc/api-claw");
});

test("parseKimiInstallCommand 纯 token 字符串时只填 botToken", async () => {
  const { parseKimiInstallCommand } = await import("./kimi-config");
  const r = parseKimiInstallCommand("km_b_prod_abc123");
  expect(r.botToken).toBe("km_b_prod_abc123");
  expect(r.wsURL).toBe("");
  expect(r.kimiapiHost).toBe("");
});

test("parseKimiInstallCommand 只有 --bot-token 时 wsURL/kimiapiHost 为空", async () => {
  const { parseKimiInstallCommand } = await import("./kimi-config");
  const r = parseKimiInstallCommand("install.sh --bot-token km_b_prod_xxx");
  expect(r.botToken).toBe("km_b_prod_xxx");
  expect(r.wsURL).toBe("");
  expect(r.kimiapiHost).toBe("");
});

test("parseKimiInstallCommand 空输入返回三空串", async () => {
  const { parseKimiInstallCommand } = await import("./kimi-config");
  expect(parseKimiInstallCommand("")).toEqual({ botToken: "", wsURL: "", kimiapiHost: "" });
  expect(parseKimiInstallCommand("   ")).toEqual({ botToken: "", wsURL: "", kimiapiHost: "" });
});

test("saveKimiPluginConfig 省略 wsURL 时写入生产默认到 bridge.url", async () => {
  const { saveKimiPluginConfig, DEFAULT_KIMI_BRIDGE_WS_URL } = await import("./kimi-config");
  const config: any = {};
  saveKimiPluginConfig(config, { botToken: "km_b_dev_xxx", gatewayToken: "gw" });
  expect(config.plugins.entries["kimi-claw"].config.bridge.url).toBe(DEFAULT_KIMI_BRIDGE_WS_URL);
});

test("saveKimiPluginConfig 传入 wsURL override 时原样写入", async () => {
  const { saveKimiPluginConfig } = await import("./kimi-config");
  const config: any = {};
  const custom = "wss://kimi-file.msdev.cc/api-claw/bots/agent-ws";
  saveKimiPluginConfig(config, { botToken: "km_b_dev_xxx", gatewayToken: "gw", wsURL: custom });
  expect(config.plugins.entries["kimi-claw"].config.bridge.url).toBe(custom);
});

test("saveKimiPluginConfig kimiapiHost 非空时写入 bridge.kimiapiHost", async () => {
  const { saveKimiPluginConfig } = await import("./kimi-config");
  const config: any = {};
  saveKimiPluginConfig(config, {
    botToken: "km_b_dev_xxx",
    gatewayToken: "gw",
    kimiapiHost: "https://kimi-file.msdev.cc/api-claw",
  });
  expect(config.plugins.entries["kimi-claw"].config.bridge.kimiapiHost).toBe(
    "https://kimi-file.msdev.cc/api-claw",
  );
});

test("saveKimiPluginConfig kimiapiHost 省略时不写 bridge.kimiapiHost（走插件默认）", async () => {
  const { saveKimiPluginConfig } = await import("./kimi-config");
  const config: any = {};
  saveKimiPluginConfig(config, { botToken: "km_b_prod_xxx", gatewayToken: "gw" });
  expect(config.plugins.entries["kimi-claw"].config.bridge.kimiapiHost).toBeUndefined();
});

test("saveKimiPluginConfig kimiapiHost 传空串时清除存量字段", async () => {
  const { saveKimiPluginConfig } = await import("./kimi-config");
  const config: any = {
    plugins: {
      entries: {
        "kimi-claw": {
          config: { bridge: { kimiapiHost: "https://kimi-file.msdev.cc/api-claw" } },
        },
      },
    },
  };
  saveKimiPluginConfig(config, {
    botToken: "km_b_prod_xxx",
    gatewayToken: "gw",
    kimiapiHost: "",
  });
  expect(config.plugins.entries["kimi-claw"].config.bridge.kimiapiHost).toBeUndefined();
});

test("extractKimiConfig 优先返回 bridge.kimiapiHost（权威）而非 kimi-search 反推", async () => {
  const { extractKimiConfig } = await import("./kimi-config");
  const config = {
    plugins: {
      entries: {
        "kimi-claw": {
          enabled: true,
          config: {
            bridge: {
              token: "t",
              url: "wss://x",
              kimiapiHost: "https://kimi-file.msdev.cc/api-claw",
            },
          },
        },
        "kimi-search": {
          enabled: true,
          config: {
            search: { baseUrl: "https://other.example.com/search" },
            fetch: { baseUrl: "https://other.example.com/fetch" },
          },
        },
      },
    },
  };
  const r = extractKimiConfig(config);
  expect(r.kimiapiHost).toBe("https://kimi-file.msdev.cc/api-claw");
});

test("extractKimiConfig 回显 kimiapiHost 来自 kimi-search serviceBaseUrl", async () => {
  const { extractKimiConfig } = await import("./kimi-config");
  const config = {
    plugins: {
      entries: {
        "kimi-claw": {
          enabled: true,
          config: { bridge: { token: "t", url: "wss://x" } },
        },
        "kimi-search": {
          enabled: true,
          config: {
            search: { baseUrl: "https://kimi-file.msdev.cc/api-claw/search" },
            fetch: { baseUrl: "https://kimi-file.msdev.cc/api-claw/fetch" },
          },
        },
      },
    },
  };
  const r = extractKimiConfig(config);
  expect(r.botToken).toBe("t");
  expect(r.wsURL).toBe("wss://x");
  expect(r.kimiapiHost).toBe("https://kimi-file.msdev.cc/api-claw");
});
