import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  ensureWeixinPluginReady,
  extractWeixinConfig,
  isWeixinPluginBundled,
  persistWeixinLoginSuccess,
  WEIXIN_CHANNEL_ID,
  WEIXIN_PLUGIN_ID,
} from "./weixin-config";

test("persistWeixinLoginSuccess 应同时写入账号凭据并启用微信 channel", (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-weixin-"));
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;

  t.after(() => {
    if (prevStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = prevStateDir;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  const config: Record<string, any> = {
    plugins: {
      entries: {
        [WEIXIN_PLUGIN_ID]: {
          customFlag: true,
        },
      },
    },
    channels: {
      [WEIXIN_CHANNEL_ID]: {
        routeTag: "route-a",
      },
    },
  };

  const normalizedId = persistWeixinLoginSuccess(config, {
    status: "confirmed",
    accountId: "Bot@im.bot",
    botToken: "token-123",
    baseUrl: "https://ilinkai.weixin.qq.com",
    userId: "user-1",
  });

  assert.equal(normalizedId, "bot-im-bot");
  assert.deepEqual(extractWeixinConfig(config), { enabled: true });
  assert.equal(config.plugins.entries[WEIXIN_PLUGIN_ID].enabled, true);
  assert.equal(config.plugins.entries[WEIXIN_PLUGIN_ID].customFlag, true);
  assert.equal(config.channels[WEIXIN_CHANNEL_ID].enabled, true);
  assert.equal(config.channels[WEIXIN_CHANNEL_ID].routeTag, "route-a");

  const indexPath = path.join(stateDir, "openclaw-weixin", "accounts.json");
  const accountPath = path.join(stateDir, "openclaw-weixin", "accounts", "bot-im-bot.json");
  const savedAccount = JSON.parse(fs.readFileSync(accountPath, "utf-8"));

  assert.deepEqual(JSON.parse(fs.readFileSync(indexPath, "utf-8")), ["bot-im-bot"]);
  assert.equal(typeof savedAccount.savedAt, "string");
  assert.deepEqual(savedAccount, {
    token: "token-123",
    savedAt: savedAccount.savedAt,
    baseUrl: "https://ilinkai.weixin.qq.com",
    userId: "user-1",
  });
});

test("ensureWeixinPluginReady 应先执行 reconcile 再检查微信插件目录", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-weixin-"));
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;

  t.after(() => {
    if (prevStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = prevStateDir;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  let reconciled = false;
  assert.equal(isWeixinPluginBundled(), false);

  await ensureWeixinPluginReady(async () => {
    reconciled = true;
    const pluginDir = path.join(stateDir, "extensions", WEIXIN_PLUGIN_ID);
    fs.mkdirSync(path.join(pluginDir, "dist"), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "openclaw.plugin.json"), "{}\n", "utf-8");
    fs.writeFileSync(path.join(pluginDir, "dist", "index.js"), "module.exports = {};\n", "utf-8");
  });

  assert.equal(reconciled, true);
  assert.equal(isWeixinPluginBundled(), true);
});

test("ensureWeixinPluginReady 应在 reconcile 后仍缺插件时拒绝启用微信", async (t) => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-weixin-"));
  const prevStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = stateDir;

  t.after(() => {
    if (prevStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = prevStateDir;
    }
    fs.rmSync(stateDir, { recursive: true, force: true });
  });

  let reconciled = false;

  await assert.rejects(
    ensureWeixinPluginReady(async () => {
      reconciled = true;
    }),
    /微信插件未安装/,
  );

  assert.equal(reconciled, true);
  assert.equal(isWeixinPluginBundled(), false);
});
