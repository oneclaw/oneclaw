#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// 读取 .env，支持值中包含空格与括号（例如 CSC_NAME）
function loadEnvFile(envPath) {
  const result = {};
  if (!fs.existsSync(envPath)) return result;

  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = rawLine.indexOf("=");
    if (idx <= 0) continue;

    const key = rawLine.slice(0, idx).trim();
    let value = rawLine.slice(idx + 1).trim();
    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }
  return result;
}

// 运行目标命令，并把 .env 注入子进程环境变量
function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("[run-with-env] 用法: node scripts/run-with-env.js <command> [...args]");
    process.exit(1);
  }

  const envFromFile = loadEnvFile(path.resolve(process.cwd(), ".env"));
  // 变量优先级：命令行/当前 shell > .env 默认值
  const env = { ...envFromFile, ...process.env };
  const command = args[0];
  const commandArgs = args.slice(1);

  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    env,
  });

  child.on("error", (error) => {
    console.error(`[run-with-env] 启动命令失败: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

run();
