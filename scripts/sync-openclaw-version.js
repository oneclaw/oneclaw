#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  normalizeSemverText,
  readRemoteLatestVersion,
} = require("./lib/openclaw-version-utils");

const ROOT = path.resolve(__dirname, "..");
const ROOT_PKG_PATH = path.join(ROOT, "package.json");
const ROOT_LOCK_PATH = path.join(ROOT, "package-lock.json");
const OPENCLAW_PACKAGE_NAME = "openclaw";

// 读取 JSON 文件并做基础存在性校验。
function readJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

// 以稳定缩进写回 JSON，保持仓库可读性。
function writeJSON(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

// 读取 bool 环境变量（支持 true/false/1/0/yes/no/on/off）。
function readEnvBool(name, fallback) {
  const raw = String(process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

// 检查版本号格式，避免写入非法值导致打包失败。
function assertVersion(version) {
  if (typeof version !== "string" || !version.trim()) {
    throw new Error(`版本号无效: ${String(version)}`);
  }
  // OpenClaw 当前采用日期版本格式（如 2026.2.6 或 2026.2.6-beta.1）
  const ok = /^\d{4}\.\d{1,2}\.\d{1,2}(?:[-.][0-9A-Za-z.-]+)?$/.test(version);
  if (!ok) {
    throw new Error(`版本号格式不符合 OpenClaw 规则: ${version}`);
  }
}

// 解析目标版本：从 npm registry 查询 latest，离线时回退当前根版本。
function resolveTargetVersion() {
  const rootPkg = readJSON(ROOT_PKG_PATH);
  const currentVersion = normalizeSemverText(String(rootPkg.version || ""));

  // 离线开发：禁用远端查询时直接用根 package.json 当前值
  if (!readEnvBool("ONECLAW_CHECK_REMOTE_OPENCLAW", true)) {
    if (!currentVersion) {
      throw new Error("根 package.json 缺少版本号，且已禁用远端版本检查");
    }
    return { targetVersion: currentVersion, source: "current" };
  }

  const remoteVersion = readRemoteLatestVersion(OPENCLAW_PACKAGE_NAME, {
    cwd: ROOT,
    env: process.env,
    logError(message) {
      console.warn(`[version:sync] ${message}`);
    },
  });

  if (!remoteVersion) {
    if (!currentVersion) {
      throw new Error("无法获取远端版本，且根 package.json 缺少版本号");
    }
    console.warn("[version:sync] 远端版本查询失败，保留当前版本");
    return { targetVersion: currentVersion, source: "current" };
  }

  assertVersion(remoteVersion);
  return { targetVersion: remoteVersion, source: "remote" };
}

// 将根 package 与 lockfile 版本同步到 npm latest。
function syncVersion() {
  if (process.env.ONECLAW_SKIP_VERSION_SYNC === "1") {
    console.log("[version:sync] skip by env ONECLAW_SKIP_VERSION_SYNC=1");
    return;
  }

  const resolved = resolveTargetVersion();
  const targetVersion = resolved.targetVersion;

  const rootPkg = readJSON(ROOT_PKG_PATH);
  const rootLock = readJSON(ROOT_LOCK_PATH);

  const beforePkgVersion = rootPkg.version;
  const beforeLockVersion = rootLock.version;
  const beforeRootPackageVersion = rootLock?.packages?.[""]?.version;

  let changed = false;

  if (rootPkg.version !== targetVersion) {
    rootPkg.version = targetVersion;
    changed = true;
  }

  if (rootLock.version !== targetVersion) {
    rootLock.version = targetVersion;
    changed = true;
  }

  if (rootLock?.packages?.[""] && rootLock.packages[""].version !== targetVersion) {
    rootLock.packages[""].version = targetVersion;
    changed = true;
  }

  if (changed) {
    writeJSON(ROOT_PKG_PATH, rootPkg);
    writeJSON(ROOT_LOCK_PATH, rootLock);
    console.log(
      `[version:sync] updated to ${targetVersion} (package.json: ${beforePkgVersion} -> ${rootPkg.version}, ` +
        `lockfile: ${beforeLockVersion} -> ${rootLock.version}, root package: ${beforeRootPackageVersion} -> ${rootLock?.packages?.[""]?.version}, ` +
        `source=${resolved.source})`
    );
    return;
  }

  console.log(
    `[version:sync] already up to date (${targetVersion}, source=${resolved.source})`
  );
}

try {
  syncVersion();
} catch (err) {
  console.error(`[version:sync] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
