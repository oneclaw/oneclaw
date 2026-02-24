import test from "node:test";
import assert from "node:assert/strict";
import { isSetupCompleteFromConfig } from "./setup-completion";

test("存在 wizard.lastRunAt 时应判定 Setup 已完成", () => {
  const config = {
    wizard: {
      lastRunAt: "2026-02-24T12:00:00.000Z",
    },
  };

  assert.equal(isSetupCompleteFromConfig(config), true);
});

test("存在 wizard 但无 lastRunAt（仅 pending）时不应判定完成", () => {
  const config = {
    wizard: {
      pendingAt: "2026-02-24T12:00:00.000Z",
    },
    models: {
      providers: {
        moonshot: { apiKey: "sk-xxx" },
      },
    },
  };

  assert.equal(isSetupCompleteFromConfig(config), false);
});

test("无 wizard.lastRunAt 时不应判定 Setup 已完成", () => {
  const config = {
    models: {
      providers: {
        anthropic: { apiKey: "sk-ant-xxx" },
      },
    },
  };

  assert.equal(isSetupCompleteFromConfig(config), false);
});
