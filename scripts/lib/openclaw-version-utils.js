"use strict";

const { execFileSync } = require("child_process");

// 归一化版本文本，统一移除可选的 v 前缀。
function normalizeSemverText(version) {
  const raw = String(version || "").trim();
  if (!raw) return "";
  if (/^v\d+\.\d+\.\d+/i.test(raw)) return raw.slice(1);
  return raw;
}

// 解析 semver（支持 pre-release，忽略 build metadata）。
function parseSemver(version) {
  const normalized = normalizeSemverText(version).split("+", 1)[0];
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

// 比较 semver：a>b 返回 1，a<b 返回 -1，相等返回 0，不可比较返回 null。
function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return null;

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;

  const aPre = va.prerelease;
  const bPre = vb.prerelease;
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1;
  if (bPre.length === 0) return -1;

  const len = Math.max(aPre.length, bPre.length);
  for (let i = 0; i < len; i += 1) {
    const ai = aPre[i];
    const bi = bPre[i];
    if (ai == null) return -1;
    if (bi == null) return 1;
    if (ai === bi) continue;

    const aNum = /^\d+$/.test(ai);
    const bNum = /^\d+$/.test(bi);
    if (aNum && bNum) {
      const av = Number.parseInt(ai, 10);
      const bv = Number.parseInt(bi, 10);
      if (av !== bv) return av > bv ? 1 : -1;
      continue;
    }
    if (aNum !== bNum) return aNum ? -1 : 1;
    return ai > bi ? 1 : -1;
  }
  return 0;
}

// 查询 npm registry 上某个包的最新版本号，失败时返回空字符串。
function readRemoteLatestVersion(packageName, options = {}) {
  const cwd = typeof options.cwd === "string" && options.cwd ? options.cwd : process.cwd();
  const env = options.env && typeof options.env === "object" ? options.env : process.env;
  const logError = typeof options.logError === "function" ? options.logError : null;

  try {
    // Windows 上 npm 是 npm.cmd，execFileSync 需要 shell 才能找到
    const out = execFileSync("npm", ["view", packageName, "version", "--json"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      encoding: "utf-8",
      shell: true,
    });
    const text = String(out || "").trim();
    if (!text) return "";

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    const version =
      typeof parsed === "string" || typeof parsed === "number"
        ? String(parsed).trim()
        : Array.isArray(parsed)
          ? String(parsed[parsed.length - 1] || "").trim()
          : parsed && typeof parsed.version === "string"
            ? parsed.version.trim()
            : "";

    return normalizeSemverText(version);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (logError) {
      logError(`远端版本检查失败（npm view ${packageName} version）: ${message}`);
    }
    return "";
  }
}

module.exports = {
  normalizeSemverText,
  compareSemver,
  readRemoteLatestVersion,
};
