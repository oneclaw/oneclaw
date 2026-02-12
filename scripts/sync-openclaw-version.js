#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const {
  normalizeSemverText,
  compareSemver,
  readRemoteLatestVersion,
} = require("./lib/openclaw-version-utils");

const ROOT = path.resolve(__dirname, "..");
const ROOT_PKG_PATH = path.join(ROOT, "package.json");
const ROOT_LOCK_PATH = path.join(ROOT, "package-lock.json");
const UPSTREAM_PKG_PATH = path.join(ROOT, "upstream", "openclaw", "package.json");
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

// 解析目标版本：默认使用本地 upstream；若远端更高则自动跟随远端版本。
function resolveTargetVersion() {
  const upstreamPkg = readJSON(UPSTREAM_PKG_PATH);
  const localVersion = normalizeSemverText(String(upstreamPkg.version || ""));
  assertVersion(localVersion);

  if (!readEnvBool("ONECLAW_CHECK_REMOTE_OPENCLAW", true)) {
    return {
      targetVersion: localVersion,
      source: "local",
      localVersion,
      remoteVersion: "",
    };
  }

  const remoteVersion = readRemoteLatestVersion(OPENCLAW_PACKAGE_NAME, {
    cwd: ROOT,
    env: process.env,
    logError(message) {
      console.warn(`[version:sync] ${message}`);
    },
  });
  if (!remoteVersion) {
    return {
      targetVersion: localVersion,
      source: "local",
      localVersion,
      remoteVersion: "",
    };
  }

  assertVersion(remoteVersion);
  const cmp = compareSemver(remoteVersion, localVersion);
  if (cmp == null) {
    console.warn(
      `[version:sync] 版本号不可比较（local=${localVersion}, remote=${remoteVersion}），回退本地版本`
    );
    return {
      targetVersion: localVersion,
      source: "local",
      localVersion,
      remoteVersion,
    };
  }

  if (cmp > 0) {
    return {
      targetVersion: remoteVersion,
      source: "remote",
      localVersion,
      remoteVersion,
    };
  }

  return {
    targetVersion: localVersion,
    source: "local",
    localVersion,
    remoteVersion,
  };
}

// 将根 package 与 lockfile 版本同步到 upstream/openclaw。
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
        `source=${resolved.source}, local=${resolved.localVersion || "unknown"}, remote=${resolved.remoteVersion || "n/a"})`
    );
    return;
  }

  console.log(
    `[version:sync] already up to date (${targetVersion}, source=${resolved.source}, local=${resolved.localVersion || "unknown"}, remote=${resolved.remoteVersion || "n/a"})`
  );
}

try {
  syncVersion();
} catch (err) {
  console.error(`[version:sync] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
