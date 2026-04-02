#!/usr/bin/env node
/**
 * ensure-dev-resources.js
 *
 * predev 阶段的轻量检查，确保 dev 环境可以正常启动：
 * 1. 当前平台的 gateway 资源（Node.js runtime + openclaw）是否已打包
 * 2. dev:isolated 模式下，状态目录是否已初始化
 *
 * 已有资源时秒过，不会重复下载。
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const platform = process.platform;
const arch = process.arch;
const targetId = `${platform}-${arch}`;

// ── 1. 检查 gateway 资源 ──

const nodeBinName = platform === "win32" ? "node.exe" : "node";
const nodeBinPath = path.join(ROOT, "resources", "targets", targetId, "runtime", nodeBinName);

if (fs.existsSync(nodeBinPath)) {
  console.log(`[dev] resources ready (${targetId})`);
} else {
  console.log(`[dev] resources missing for ${targetId}, running package:resources...`);
  try {
    execSync("npm run package:resources", {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, ONECLAW_TARGET: targetId },
    });
    console.log(`[dev] resources packaged successfully`);
  } catch (err) {
    console.error(`[dev] package:resources failed, gateway will not start`);
    process.exit(1);
  }
}

// ── 2. dev:isolated 状态目录初始化 ──

const stateDir = process.env.OPENCLAW_STATE_DIR;
if (stateDir) {
  const isolatedConfig = path.join(stateDir, "oneclaw.config.json");
  if (!fs.existsSync(isolatedConfig)) {
    fs.mkdirSync(stateDir, { recursive: true });

    const home = platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
    const mainStateDir = path.join(home || "", ".openclaw");
    const mainConfig = path.join(mainStateDir, "oneclaw.config.json");
    const mainOpenclaw = path.join(mainStateDir, "openclaw.json");

    let source = "scratch";

    // 优先从主状态目录复制
    if (fs.existsSync(mainConfig)) {
      fs.copyFileSync(mainConfig, isolatedConfig);
      source = "~/.openclaw/oneclaw.config.json";
    } else {
      // 主目录也没有 → 创建最小配置跳过 setup
      const minimal = { setupCompletedAt: new Date().toISOString() };
      fs.writeFileSync(isolatedConfig, JSON.stringify(minimal, null, 2) + "\n");
    }

    // 复制 openclaw.json（provider 配置等）
    const isolatedOpenclaw = path.join(stateDir, "openclaw.json");
    if (!fs.existsSync(isolatedOpenclaw) && fs.existsSync(mainOpenclaw)) {
      fs.copyFileSync(mainOpenclaw, isolatedOpenclaw);
    }

    console.log(`[dev] isolated state initialized (from ${source})`);
  }
}
