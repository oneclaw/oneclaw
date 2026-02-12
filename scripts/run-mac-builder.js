#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");

// 解析命令行参数：仅接受 --arch 与 --output。
function parseArgs(argv) {
  let arch = "";
  let output = "";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--arch") {
      arch = argv[++i] || "";
      continue;
    }
    if (arg === "--output") {
      output = argv[++i] || "";
      continue;
    }
    throw new Error(`[run-mac-builder] 未知参数: ${arg}`);
  }

  if (arch !== "arm64" && arch !== "x64") {
    throw new Error(`[run-mac-builder] --arch 仅支持 arm64/x64，当前: ${arch || "<empty>"}`);
  }
  if (!output) {
    throw new Error("[run-mac-builder] 缺少 --output 参数");
  }

  return { arch, output };
}

// 解析布尔环境变量，默认 false（兼容旧变量）。
function readBooleanEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultValue;
  const value = String(raw).trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

// 解析签名模式：adhoc / sign / sign+notarize（兼容旧变量 ONECLAW_MAC_SIGN_AND_NOTARIZE）。
function resolveSignMode() {
  const rawMode = (process.env.ONECLAW_MAC_SIGN_MODE || "").trim().toLowerCase();
  if (rawMode) {
    if (rawMode === "adhoc" || rawMode === "sign" || rawMode === "sign+notarize") {
      return rawMode;
    }
    throw new Error(
      `[run-mac-builder] ONECLAW_MAC_SIGN_MODE 仅支持 adhoc/sign/sign+notarize，当前: ${rawMode}`
    );
  }

  return readBooleanEnv("ONECLAW_MAC_SIGN_AND_NOTARIZE", false) ? "sign+notarize" : "adhoc";
}

// 校验必须环境变量。
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[run-mac-builder] 缺少环境变量: ${name}`);
  }
  return value;
}

// 根据签名模式组装 electron-builder 参数。
function buildArgs(arch, output, signMode) {
  const args = [
    "--mac",
    `--${arch}`,
    `--config.directories.output=${output}`,
    "--publish", "never",
  ];

  if (signMode === "sign+notarize") {
    const cscName = requireEnv("CSC_NAME");
    // APPLE_API_KEY 不需要校验：electron-builder 通过 ~/private_keys/AuthKey_{ID}.p8 做公证
    requireEnv("APPLE_API_KEY_ID");
    requireEnv("APPLE_API_ISSUER");
    args.push(`--config.mac.identity=${cscName}`);
    args.push("--config.mac.notarize=true");
    console.log("[run-mac-builder] mode=sign+notarize");
  } else if (signMode === "sign") {
    const cscName = requireEnv("CSC_NAME");
    args.push(`--config.mac.identity=${cscName}`);
    args.push("--config.mac.notarize=false");
    console.log("[run-mac-builder] mode=sign-only");
  } else {
    args.push("--config.mac.identity=-");
    args.push("--config.mac.notarize=false");
    console.log("[run-mac-builder] mode=adhoc");
  }

  return args;
}

// 执行 electron-builder。
function run() {
  const { arch, output } = parseArgs(process.argv.slice(2));
  const signMode = resolveSignMode();
  const args = buildArgs(arch, output, signMode);

  const child = spawn("electron-builder", args, {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (err) => {
    console.error(`[run-mac-builder] 启动失败: ${err.message}`);
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
