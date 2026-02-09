#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ROOT_PKG_PATH = path.join(ROOT, "package.json");
const ROOT_LOCK_PATH = path.join(ROOT, "package-lock.json");
const UPSTREAM_PKG_PATH = path.join(ROOT, "upstream", "openclaw", "package.json");

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

// 将根 package 与 lockfile 版本同步到 upstream/openclaw。
function syncVersion() {
  if (process.env.ONECLAW_SKIP_VERSION_SYNC === "1") {
    console.log("[version:sync] skip by env ONECLAW_SKIP_VERSION_SYNC=1");
    return;
  }

  const upstreamPkg = readJSON(UPSTREAM_PKG_PATH);
  const targetVersion = upstreamPkg.version;
  assertVersion(targetVersion);

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
        `lockfile: ${beforeLockVersion} -> ${rootLock.version}, root package: ${beforeRootPackageVersion} -> ${rootLock?.packages?.[""]?.version})`
    );
    return;
  }

  console.log(`[version:sync] already up to date (${targetVersion})`);
}

try {
  syncVersion();
} catch (err) {
  console.error(`[version:sync] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
