/**
 * package-resources.js
 *
 * OneClaw Electron 应用资源打包脚本
 * 负责下载 Node.js 运行时、安装 openclaw 生产依赖、生成统一入口
 *
 * 用法: node scripts/package-resources.js [--platform darwin|win32] [--arch arm64|x64] [--locale en|cn]
 */

"use strict";

const fs = require("fs");
const path = require("path");
const https = require("https");
const { execSync, execFileSync } = require("child_process");

// ─── 项目根目录 ───
const ROOT = path.resolve(__dirname, "..");
const TARGETS_ROOT = path.join(ROOT, "resources", "targets");

// 计算目标产物的唯一标识
function getTargetId(platform, arch) {
  return `${platform}-${arch}`;
}

// 计算目标产物的目录集合
function getTargetPaths(platform, arch) {
  const targetId = getTargetId(platform, arch);
  const targetBase = path.join(TARGETS_ROOT, targetId);
  return {
    targetId,
    targetBase,
    runtimeDir: path.join(targetBase, "runtime"),
    gatewayDir: path.join(targetBase, "gateway"),
    iconPath: path.join(targetBase, "app-icon.png"),
    analyticsConfigPath: path.join(targetBase, "analytics-config.json"),
  };
}

// ─── 参数解析 ───
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    platform: process.platform,
    arch: process.platform === "win32" ? "x64" : "arm64",
    locale: "en",
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--platform" && args[i + 1]) {
      opts.platform = args[++i];
    } else if (args[i] === "--arch" && args[i + 1]) {
      opts.arch = args[++i];
    }
  }

  // 参数校验
  if (!["darwin", "win32"].includes(opts.platform)) {
    die(`不支持的平台: ${opts.platform}，仅支持 darwin | win32`);
  }
  if (!["arm64", "x64"].includes(opts.arch)) {
    die(`不支持的架构: ${opts.arch}，仅支持 arm64 | x64`);
  }
  return opts;
}

// ─── 工具函数 ───

function die(msg) {
  console.error(`\n[错误] ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[资源打包] ${msg}`);
}

// 确保目录存在
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// 递归删除目录
function rmDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 安全删除单个文件（忽略不存在或权限瞬时错误）
function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // 忽略清理异常，保留原始错误上下文
  }
}

// HTTPS GET，返回 Promise<Buffer>
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const request = (url) => {
      https
        .get(url, (res) => {
          // 处理重定向
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} — ${url}`));
            return;
          }
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve(Buffer.concat(chunks)));
          res.on("error", reject);
        })
        .on("error", reject);
    };
    request(url);
  });
}

// 带进度的文件下载
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (url) => {
      https
        .get(url, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            request(res.headers.location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} — ${url}`));
            return;
          }

          const totalBytes = parseInt(res.headers["content-length"], 10) || 0;
          let downloaded = 0;
          const file = fs.createWriteStream(dest);
          let settled = false;

          res.on("data", (chunk) => {
            downloaded += chunk.length;
            if (totalBytes > 0) {
              const pct = ((downloaded / totalBytes) * 100).toFixed(1);
              const mb = (downloaded / 1024 / 1024).toFixed(1);
              process.stdout.write(`\r  下载进度: ${mb} MB (${pct}%)`);
            }
          });

          const fail = (err) => {
            if (settled) return;
            settled = true;
            res.destroy();
            file.destroy();
            safeUnlink(dest);
            reject(err);
          };

          res.on("error", fail);
          file.on("error", fail);

          // 确保写入句柄真正 flush + close 后再返回，避免拿到半截压缩包
          file.on("finish", () => {
            file.close((closeErr) => {
              if (settled) return;
              settled = true;
              if (closeErr) {
                safeUnlink(dest);
                reject(closeErr);
                return;
              }
              if (totalBytes > 0) process.stdout.write("\n");
              resolve();
            });
          });

          res.pipe(file);
        })
        .on("error", (err) => {
          safeUnlink(dest);
          reject(err);
        });
    };
    request(url);
  });
}

// 依次尝试多个下载源，直到成功
async function downloadFileWithFallback(urls, dest) {
  const errors = [];
  for (const url of urls) {
    try {
      await downloadFile(url, dest);
      return;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${url} -> ${message}`);
      safeUnlink(dest);
    }
  }
  throw new Error(`全部下载源失败:\n${errors.join("\n")}`);
}

// 快速校验 zip 的 EOCD 签名，提前识别损坏缓存包
function assertZipHasCentralDirectory(zipPath) {
  const stat = fs.statSync(zipPath);
  if (stat.size < 22) {
    throw new Error(`zip 文件过小: ${zipPath}`);
  }
  const readSize = Math.min(stat.size, 128 * 1024);
  const buf = Buffer.alloc(readSize);
  const fd = fs.openSync(zipPath, "r");
  try {
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
  } finally {
    fs.closeSync(fd);
  }
  const eocdSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  if (buf.lastIndexOf(eocdSig) === -1) {
    throw new Error(`zip 缺少 End-of-central-directory 签名: ${zipPath}`);
  }
}

// ─── Step 1: 下载 Node.js 22 发行包 ───

// 获取 Node.js 22.x 最新版本号（带 24h 缓存）
async function getLatestNode22Version() {
  const cacheDir = path.join(ROOT, ".cache", "node");
  const cachePath = path.join(cacheDir, "versions.json");
  ensureDir(cacheDir);

  // 检查缓存是否有效（24小时）
  if (fs.existsSync(cachePath)) {
    const stat = fs.statSync(cachePath);
    const ageMs = Date.now() - stat.mtimeMs;
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (ageMs < ONE_DAY) {
      log("使用缓存的 Node.js 版本列表");
      const versions = JSON.parse(fs.readFileSync(cachePath, "utf-8"));
      return pickV22(versions);
    }
  }

  log("正在获取 Node.js 版本列表...");
  const buf = await httpGet("https://nodejs.org/dist/index.json");
  fs.writeFileSync(cachePath, buf);
  const versions = JSON.parse(buf.toString());
  return pickV22(versions);
}

// 从版本列表中取 v22.x 最新版
function pickV22(versions) {
  const v22 = versions.find((v) => v.version.startsWith("v22."));
  if (!v22) die("未找到 Node.js v22.x 版本");
  return v22.version.slice(1); // 去掉前缀 "v"
}

// 下载并解压 Node.js 运行时到目标目录
async function downloadAndExtractNode(version, platform, arch, runtimeDir) {
  const cacheDir = path.join(ROOT, ".cache", "node");
  ensureDir(cacheDir);

  // 增量检测：版本戳文件记录已解压的版本+架构
  const stampFile = path.join(runtimeDir, ".node-stamp");
  const stampValue = `${version}-${platform}-${arch}`;
  if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, "utf-8").trim() === stampValue) {
    log(`runtime 已是 ${stampValue}，跳过解压`);
    return;
  }

  // 构造文件名和 URL
  const ext = platform === "darwin" ? "tar.gz" : "zip";
  const filename = `node-v${version}-${platform === "win32" ? "win" : "darwin"}-${arch}.${ext}`;
  const downloadUrls = [
    `https://nodejs.org/dist/v${version}/${filename}`,
    `https://npmmirror.com/mirrors/node/v${version}/${filename}`,
  ];
  const cachedFile = path.join(cacheDir, filename);

  // 下载（如果缓存中没有）
  if (fs.existsSync(cachedFile)) {
    log(`使用缓存: ${filename}`);
  } else {
    log(`正在下载 ${filename} ...`);
    await downloadFileWithFallback(downloadUrls, cachedFile);
    log(`下载完成: ${filename}`);
  }

  // 先尝试使用缓存包解压；若缓存损坏则删除后重下并重试一次
  try {
    extractNodeRuntimeArchive(cachedFile, runtimeDir, version, platform, arch);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`检测到运行时缓存可能损坏，准备重下: ${filename}`);
    log(`解压失败原因: ${message}`);
    rmDir(runtimeDir);
    safeUnlink(cachedFile);
    log(`重新下载 ${filename} ...`);
    await downloadFileWithFallback(downloadUrls, cachedFile);
    log(`重新下载完成: ${filename}`);
    extractNodeRuntimeArchive(cachedFile, runtimeDir, version, platform, arch);
  }

  // 写入版本戳
  fs.writeFileSync(stampFile, stampValue);
}

// 清理目标目录并解压 Node.js 运行时压缩包
function extractNodeRuntimeArchive(cachedFile, runtimeDir, version, platform, arch) {
  rmDir(runtimeDir);
  ensureDir(runtimeDir);
  const targetId = getTargetId(platform, arch);
  if (platform === "darwin") {
    extractDarwin(cachedFile, runtimeDir, version, arch, targetId);
  } else {
    assertZipHasCentralDirectory(cachedFile);
    extractWin32(cachedFile, runtimeDir, version, arch, targetId);
  }
}

// 生成并发安全的临时解压目录
function createExtractTmpDir(cacheDir, targetId) {
  const tmpDir = path.join(cacheDir, `_extract_tmp_${targetId}_${process.pid}_${Date.now()}`);
  rmDir(tmpDir);
  ensureDir(tmpDir);
  return tmpDir;
}

// macOS: 从 tar.gz 中提取 node 二进制和 npm
function extractDarwin(tarPath, runtimeDir, version, arch, targetId) {
  log("正在解压 macOS Node.js 运行时...");
  const prefix = `node-v${version}-darwin-${arch}`;

  // 创建临时解压目录
  const tmpDir = createExtractTmpDir(path.dirname(tarPath), targetId);

  execSync(`tar xzf "${tarPath}" -C "${tmpDir}"`, { stdio: "inherit" });

  const srcBase = path.join(tmpDir, prefix);

  // 拷贝 bin/node
  fs.copyFileSync(path.join(srcBase, "bin", "node"), path.join(runtimeDir, "node"));

  // 生成 npm/npx 包装脚本（原始 bin/npm 是符号链接，路径解析不正确）
  fs.writeFileSync(
    path.join(runtimeDir, "npm"),
    '#!/bin/sh\ndir="$(cd "$(dirname "$0")" && pwd)"\n"$dir/node" "$dir/vendor/npm/bin/npm-cli.js" "$@"\n'
  );
  fs.writeFileSync(
    path.join(runtimeDir, "npx"),
    '#!/bin/sh\ndir="$(cd "$(dirname "$0")" && pwd)"\n"$dir/node" "$dir/vendor/npm/bin/npx-cli.js" "$@"\n'
  );


  // 拷贝 lib/node_modules/npm/ 到 vendor/npm/（避免 electron-builder 过滤 node_modules）
  const npmModSrc = path.join(srcBase, "lib", "node_modules", "npm");
  const npmModDest = path.join(runtimeDir, "vendor", "npm");
  ensureDir(path.join(runtimeDir, "vendor"));
  copyDirSync(npmModSrc, npmModDest);

  // 设置可执行权限
  fs.chmodSync(path.join(runtimeDir, "node"), 0o755);
  fs.chmodSync(path.join(runtimeDir, "npm"), 0o755);
  fs.chmodSync(path.join(runtimeDir, "npx"), 0o755);

  // 清理临时目录
  rmDir(tmpDir);
  log("macOS 运行时提取完成");
}

// Windows: 从 zip 中提取 node.exe 和 npm
function extractWin32(zipPath, runtimeDir, version, arch, targetId) {
  log("正在解压 Windows Node.js 运行时...");
  const prefix = `node-v${version}-win-${arch}`;

  // 创建临时解压目录
  const tmpDir = createExtractTmpDir(path.dirname(zipPath), targetId);

  // 判断宿主平台选择解压方式
  if (process.platform === "win32") {
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Force -Path '${zipPath}' -DestinationPath '${tmpDir}'"`,
      { stdio: "inherit" }
    );
  } else {
    // 非 Windows 宿主（交叉打包场景），用 unzip
    execSync(`unzip -o -q "${zipPath}" -d "${tmpDir}"`, { stdio: "inherit" });
  }

  const srcBase = path.join(tmpDir, prefix);

  // 拷贝 node.exe, npm.cmd, npx.cmd
  fs.copyFileSync(path.join(srcBase, "node.exe"), path.join(runtimeDir, "node.exe"));
  fs.copyFileSync(path.join(srcBase, "npm.cmd"), path.join(runtimeDir, "npm.cmd"));
  fs.copyFileSync(path.join(srcBase, "npx.cmd"), path.join(runtimeDir, "npx.cmd"));

  // 拷贝 node_modules/npm/ 整个目录
  const npmModSrc = path.join(srcBase, "node_modules", "npm");
  const npmModDest = path.join(runtimeDir, "node_modules", "npm");
  ensureDir(path.join(runtimeDir, "node_modules"));
  copyDirSync(npmModSrc, npmModDest);

  // 清理临时目录
  rmDir(tmpDir);
  log("Windows 运行时提取完成");
}

// 递归拷贝目录
function copyDirSync(src, dest) {
  ensureDir(dest);
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ─── Step 1.5: 写入 .npmrc ───
function writeNpmrc(runtimeDir) {
  const npmrcPath = path.join(runtimeDir, ".npmrc");
  const content = [
    "registry=https://registry.npmmirror.com",
    "disturl=https://npmmirror.com/mirrors/node",
    "",
  ].join("\n");
  fs.writeFileSync(npmrcPath, content);
  log("已写入 .npmrc（使用 npmmirror 镜像源）");
}

// ─── Step 1.8: 生成埋点配置（由打包环境动态注入） ───

function readEnvText(name) {
  return (process.env[name] || "").trim();
}

function readEnvPositiveInt(name, fallback) {
  const raw = readEnvText(name);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readEnvRetryDelays(name, fallback) {
  const raw = readEnvText(name);
  if (!raw) return [...fallback];
  const delays = raw
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return delays.length > 0 ? delays : [...fallback];
}

function buildAnalyticsConfig() {
  const captureURL = readEnvText("ONECLAW_ANALYTICS_CAPTURE_URL");
  const captureFallbackURL = readEnvText("ONECLAW_ANALYTICS_CAPTURE_FALLBACK_URL") || captureURL;
  const apiKey = readEnvText("ONECLAW_ANALYTICS_API_KEY");
  const requestTimeoutMs = readEnvPositiveInt("ONECLAW_ANALYTICS_REQUEST_TIMEOUT_MS", 8000);
  const retryDelaysMs = readEnvRetryDelays("ONECLAW_ANALYTICS_RETRY_DELAYS_MS", [0, 500, 1500]);
  const enabled = captureURL.length > 0 && apiKey.length > 0;

  if (!enabled) {
    return {
      enabled: false,
      captureURL: "",
      captureFallbackURL: "",
      apiKey: "",
      requestTimeoutMs,
      retryDelaysMs,
    };
  }

  return {
    enabled: true,
    captureURL,
    captureFallbackURL,
    apiKey,
    requestTimeoutMs,
    retryDelaysMs,
  };
}

function writeAnalyticsConfig(configPath) {
  const config = buildAnalyticsConfig();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  log(`已生成 analytics-config.json（enabled=${config.enabled ? "true" : "false"}）`);
}

// ─── Step 2: 安装 openclaw 生产依赖 ───

// openclaw 包源路径（默认本地 upstream；若远端版本更高则自动切到远端）
function getPackageSource() {
  const explicitSource = readEnvText("OPENCLAW_PACKAGE_SOURCE");
  if (explicitSource) {
    log(`使用 OPENCLAW_PACKAGE_SOURCE 指定来源: ${explicitSource}`);
    return {
      source: explicitSource,
      stampSource: `explicit:${explicitSource}`,
      kind: "explicit",
      localVersion: "",
      remoteVersion: "",
    };
  }

  const localSource = `file:${path.join(ROOT, "upstream", "openclaw")}`;
  const localVersion = readLocalUpstreamVersion();

  if (!readEnvBool("ONECLAW_CHECK_REMOTE_OPENCLAW", true)) {
    log("已禁用远端版本检查（ONECLAW_CHECK_REMOTE_OPENCLAW=false），使用本地 upstream/openclaw");
    return {
      source: localSource,
      stampSource: `local:${localVersion || "unknown"}`,
      kind: "local",
      localVersion,
      remoteVersion: "",
    };
  }

  const remoteVersion = readRemoteLatestVersion("openclaw");
  if (!remoteVersion) {
    log("未获取到远端 openclaw 最新版本，回退本地 upstream/openclaw");
    return {
      source: localSource,
      stampSource: `local:${localVersion || "unknown"}`,
      kind: "local",
      localVersion,
      remoteVersion: "",
    };
  }

  if (!localVersion) {
    log(`本地 upstream/openclaw 缺少版本信息，使用远端 openclaw@${remoteVersion}`);
    return {
      source: remoteVersion,
      stampSource: `remote:openclaw@${remoteVersion}`,
      kind: "remote",
      localVersion: "",
      remoteVersion,
    };
  }

  const cmp = compareSemver(remoteVersion, localVersion);
  if (cmp == null) {
    log(
      `版本号不可比较（local=${localVersion}, remote=${remoteVersion}），默认使用本地 upstream/openclaw`
    );
    return {
      source: localSource,
      stampSource: `local:${localVersion}`,
      kind: "local",
      localVersion,
      remoteVersion,
    };
  }

  if (cmp > 0) {
    log(`检测到远端更新版本 ${remoteVersion}（本地 ${localVersion}），将拉取远端最新版`);
    return {
      source: remoteVersion,
      stampSource: `remote:openclaw@${remoteVersion}`,
      kind: "remote",
      localVersion,
      remoteVersion,
    };
  }

  log(`远端版本 ${remoteVersion} 未高于本地 ${localVersion}，使用本地 upstream/openclaw`);
  return {
    source: localSource,
    stampSource: `local:${localVersion}`,
    kind: "local",
    localVersion,
    remoteVersion,
  };
}

// 读取 bool 环境变量（支持 true/false/1/0/yes/no/on/off）
function readEnvBool(name, fallback) {
  const raw = readEnvText(name).toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

// 读取本地 upstream/openclaw 的版本号
function readLocalUpstreamVersion() {
  const pkgPath = path.join(ROOT, "upstream", "openclaw", "package.json");
  try {
    const raw = fs.readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw);
    return normalizeSemverText(String(pkg.version || ""));
  } catch {
    return "";
  }
}

// 读取远端 npm 包最新版本（npm view）
function readRemoteLatestVersion(packageName) {
  try {
    const out = execFileSync("npm", ["view", packageName, "version", "--json"], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      encoding: "utf-8",
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
    log(`远端版本检查失败（npm view ${packageName} version）: ${message}`);
    return "";
  }
}

// 归一化版本文本（去掉前缀 v）
function normalizeSemverText(version) {
  const raw = String(version || "").trim();
  if (!raw) return "";
  if (/^v\d+\.\d+\.\d+/i.test(raw)) return raw.slice(1);
  return raw;
}

// 解析 semver（宽松：支持 pre-release，忽略 build metadata）
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

// 比较 semver：a>b 返回 1，a<b 返回 -1，相等返回 0，不可比较返回 null
function compareSemver(a, b) {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return null;

  if (va.major !== vb.major) return va.major > vb.major ? 1 : -1;
  if (va.minor !== vb.minor) return va.minor > vb.minor ? 1 : -1;
  if (va.patch !== vb.patch) return va.patch > vb.patch ? 1 : -1;

  // 无 pre-release 的版本优先级更高
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

// 读取 gateway 依赖平台戳
function readGatewayStamp(stampPath) {
  try {
    return fs.readFileSync(stampPath, "utf-8").trim();
  } catch {
    return "";
  }
}

// 原生平台包前缀（用于跨平台污染检测与清理）
const NATIVE_NAME_PREFIX = [
  "sharp-",
  "sharp-libvips-",
  "node-pty-",
  "sqlite-vec-",
  "canvas-",
  "reflink-",
  "clipboard-",
];

// 收集 node_modules 第一层包（含 @scope 下子包）
function collectTopLevelPackages(nmDir) {
  const scopedDirs = fs.existsSync(nmDir)
    ? fs.readdirSync(nmDir, { withFileTypes: true })
    : [];

  const packages = [];
  for (const entry of scopedDirs) {
    if (!entry.isDirectory()) continue;
    const abs = path.join(nmDir, entry.name);
    if (entry.name.startsWith("@")) {
      for (const child of fs.readdirSync(abs, { withFileTypes: true })) {
        if (!child.isDirectory()) continue;
        packages.push({ name: child.name, dir: path.join(abs, child.name) });
      }
    } else {
      packages.push({ name: entry.name, dir: abs });
    }
  }
  return packages;
}

// 解析包名中的平台三元组（如 xxx-darwin-arm64）
function parseNativePackageTarget(name) {
  if (!NATIVE_NAME_PREFIX.some((prefix) => name.startsWith(prefix))) return null;
  const match = name.match(/-(darwin|linux|win32)-([a-z0-9_-]+)/i);
  if (!match) return null;
  return {
    platform: match[1],
    arch: match[2].split("-")[0],
  };
}

// Darwin 目标下移除 universal 原生包，强制仅保留 arm64/x64 二选一
function pruneDarwinUniversalNativePackages(nmDir, platform) {
  if (platform !== "darwin") return;

  const removed = [];
  for (const item of collectTopLevelPackages(nmDir)) {
    const target = parseNativePackageTarget(item.name);
    if (!target) continue;
    if (target.platform === "darwin" && target.arch === "universal") {
      rmDir(item.dir);
      removed.push(item.name);
    }
  }

  if (removed.length > 0) {
    log(`已移除 darwin-universal 原生包: ${removed.join(", ")}`);
  }
}

// 是否保留 node-llama-cpp（默认移除；设置 ONECLAW_KEEP_LLAMA=true/1 可保留）
function shouldKeepLlamaPackages() {
  const raw = readEnvText("ONECLAW_KEEP_LLAMA").toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

// 定点裁剪 llama 相关依赖，避免 --omit=optional 误伤其它可选功能
function pruneLlamaPackages(nmDir) {
  if (shouldKeepLlamaPackages()) {
    log("已保留 llama 依赖（ONECLAW_KEEP_LLAMA 已启用）");
    return;
  }

  const removeTargets = [
    path.join(nmDir, "node-llama-cpp"),
    path.join(nmDir, "@node-llama-cpp"),
  ];

  const removed = [];
  for (const target of removeTargets) {
    if (!fs.existsSync(target)) continue;
    rmDir(target);
    removed.push(path.basename(target));
  }

  if (removed.length > 0) {
    log(`已移除 llama 依赖: ${removed.join(", ")}`);
  } else {
    log("llama 依赖不存在，跳过移除");
  }
}

// 清理 node_modules/.bin 中的悬挂符号链接（避免 afterPack 拷贝时报 ENOENT）
function pruneDanglingBinLinks(nmDir) {
  const binDir = path.join(nmDir, ".bin");
  if (!fs.existsSync(binDir)) return;

  const removed = [];
  let entries;
  try {
    entries = fs.readdirSync(binDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    const linkPath = path.join(binDir, entry.name);
    try {
      fs.realpathSync(linkPath);
    } catch {
      try {
        fs.unlinkSync(linkPath);
        removed.push(entry.name);
      } catch {
        // 忽略清理异常，后续由打包阶段暴露更具体错误
      }
    }
  }

  if (removed.length > 0) {
    log(`已移除悬挂 .bin 链接: ${removed.join(", ")}`);
  }
}

// 校验平台相关原生包，避免把其它平台或 universal 包打进目标产物
function assertNativeDepsMatchTarget(nmDir, platform, arch) {
  const mismatches = [];
  for (const item of collectTopLevelPackages(nmDir)) {
    const target = parseNativePackageTarget(item.name);
    if (!target) continue;
    if (target.platform !== platform || target.arch !== arch) {
      mismatches.push(`${item.name} (目标 ${platform}-${arch})`);
    }
  }

  if (mismatches.length > 0) {
    die(
      [
        "检测到与目标平台不匹配的原生依赖：",
        ...mismatches.slice(0, 10).map((m) => `  - ${m}`),
        "",
        "请重新执行 package-resources，确保 npm install 按目标平台/架构运行。",
      ].join("\n")
    );
  }
}

// 安装 openclaw 依赖并裁剪 node_modules（按目标平台安装，避免跨平台污染）
function installDependencies(opts, gatewayDir) {
  const stampPath = path.join(gatewayDir, ".gateway-stamp");
  const sourceInfo = getPackageSource();
  const targetStamp = `${opts.platform}-${opts.arch}|${sourceInfo.stampSource}`;

  // 增量检测：比较 upstream 构建产物的 mtime
  const upstreamEntry = path.join(ROOT, "upstream", "openclaw", "dist", "entry.js");
  const installedEntry = path.join(gatewayDir, "node_modules", "openclaw", "dist", "entry.js");
  const cachedStamp = readGatewayStamp(stampPath);
  if (fs.existsSync(installedEntry) && cachedStamp === targetStamp) {
    let canReuse = true;
    if (sourceInfo.kind === "local") {
      if (!fs.existsSync(upstreamEntry)) {
        canReuse = false;
      } else {
        const srcMtime = fs.statSync(upstreamEntry).mtimeMs;
        const dstMtime = fs.statSync(installedEntry).mtimeMs;
        canReuse = dstMtime >= srcMtime;
      }
    }

    if (canReuse) {
      log(`gateway 依赖未变化且平台/来源匹配 (${targetStamp})，跳过 npm install`);
      const nmDir = path.join(gatewayDir, "node_modules");
      // 即使复用缓存依赖，也要执行最新裁剪规则，避免历史产物遗留冗余文件
      pruneNodeModules(nmDir);
      pruneDarwinUniversalNativePackages(nmDir, opts.platform);
      pruneLlamaPackages(nmDir);
      pruneDanglingBinLinks(nmDir);
      assertNativeDepsMatchTarget(nmDir, opts.platform, opts.arch);
      return;
    }
    log("检测到本地 upstream 依赖更新，重新安装 gateway 依赖");
  } else if (cachedStamp && cachedStamp !== targetStamp) {
    log(`检测到依赖来源或平台变更（${cachedStamp} → ${targetStamp}），重新安装 gateway 依赖`);
  } else if (fs.existsSync(installedEntry)) {
    log("检测到 gateway 依赖缺少来源戳，重新安装");
  }

  rmDir(gatewayDir);
  ensureDir(gatewayDir);

  const source = sourceInfo.source;
  log(`安装 openclaw 依赖 (来源: ${source}) ...`);

  // 写入 package.json
  const pkg = {
    dependencies: {
      openclaw: source,
    },
  };
  fs.writeFileSync(path.join(gatewayDir, "package.json"), JSON.stringify(pkg, null, 2));

  // 使用系统 npm 执行安装
  // --os/--cpu + npm_config_os/cpu：强制按目标平台安装，避免跨平台打包时复用宿主机原生包
  // --install-links: 对 file: 依赖做实际拷贝而非符号链接
  execSync(`npm install --omit=dev --install-links --os=${opts.platform} --cpu=${opts.arch}`, {
    cwd: gatewayDir,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
      npm_config_os: opts.platform,
      npm_config_cpu: opts.arch,
      // 避免 node-llama-cpp 在 cross-build 时执行 postinstall 下载/本地编译
      NODE_LLAMA_CPP_SKIP_DOWNLOAD: "true",
    },
  });

  log("依赖安装完成，开始裁剪 node_modules...");
  const nmDir = path.join(gatewayDir, "node_modules");
  pruneNodeModules(nmDir);
  pruneDarwinUniversalNativePackages(nmDir, opts.platform);
  pruneLlamaPackages(nmDir);
  pruneDanglingBinLinks(nmDir);
  assertNativeDepsMatchTarget(nmDir, opts.platform, opts.arch);
  fs.writeFileSync(stampPath, targetStamp);
  log("node_modules 裁剪完成");
}

// 裁剪 node_modules，删除无用文件以减小体积
function pruneNodeModules(nmDir) {
  if (!fs.existsSync(nmDir)) return;

  const openclawDir = path.join(nmDir, "openclaw");
  const openclawDocsDir = path.join(openclawDir, "docs");
  const openclawDocsKeepDir = path.join(openclawDocsDir, "reference", "templates");

  // 需要删除的文档文件名（精确匹配，不区分大小写，避免误杀 changelog.js 等源文件）
  const junkNames = new Set([
    "readme", "readme.md", "readme.txt", "readme.markdown",
    "changelog", "changelog.md", "changelog.txt",
    "history.md", "authors", "authors.md", "contributors.md",
  ]);

  // 需要删除的目录名（只保留运行所需内容）
  const junkDirs = new Set([
    "test",
    "tests",
    "__tests__",
    "docs",
    "examples",
    ".github",
    ".vscode",
    "benchmark",
    "benchmarks",
  ]);

  let removedFiles = 0;
  let removedDirs = 0;

  // 判断路径是否位于某个目录内部（含目录本身）
  function isPathInside(targetPath, basePath) {
    const rel = path.relative(basePath, targetPath);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  }

  // 安全删除单个文件并统计
  function removeFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return;
      fs.unlinkSync(filePath);
      removedFiles += 1;
    } catch {
      // 忽略单文件清理异常，避免中断整体打包
    }
  }

  // 删除目录并统计（按入口目录计数）
  function removeDir(dirPath) {
    if (!fs.existsSync(dirPath)) return;
    rmDir(dirPath);
    removedDirs += 1;
  }

  // 判断是否为 TS 声明文件（path.extname 无法直接识别 .d.ts）
  function isTypeDeclarationFile(fileNameLower) {
    return (
      fileNameLower.endsWith(".d.ts") ||
      fileNameLower.endsWith(".d.mts") ||
      fileNameLower.endsWith(".d.cts")
    );
  }

  // 精简 openclaw/docs，仅保留运行时必需模板 docs/reference/templates
  function pruneOpenclawDocs() {
    if (!fs.existsSync(openclawDocsDir)) return;
    if (!fs.existsSync(openclawDocsKeepDir)) {
      log("openclaw docs/reference/templates 不存在，跳过 openclaw docs 裁剪");
      return;
    }

    // 递归清理 docs：保留模板目录及其祖先路径，删除其余内容
    function walkDocs(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const keepSelf = isPathInside(fullPath, openclawDocsKeepDir);
        const keepAncestor = isPathInside(openclawDocsKeepDir, fullPath);

        if (entry.isDirectory()) {
          if (keepSelf || keepAncestor) {
            walkDocs(fullPath);
          } else {
            removeDir(fullPath);
          }
          continue;
        }

        if (!keepSelf) {
          removeFile(fullPath);
        }
      }
    }

    walkDocs(openclawDocsDir);
  }

  // 递归遍历并清理
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // openclaw/docs 需要保留模板目录，不能整目录删除
        if (fullPath === openclawDocsDir) {
          pruneOpenclawDocs();
          continue;
        }

        if (junkDirs.has(entry.name)) {
          removeDir(fullPath);
        } else {
          walk(fullPath);
        }
      } else {
        const nameLower = entry.name.toLowerCase();
        const ext = path.extname(nameLower);
        const shouldDelete = isTypeDeclarationFile(nameLower) || ext === ".map" || junkNames.has(nameLower);
        if (shouldDelete) {
          removeFile(fullPath);
        }
      }
    }
  }

  walk(nmDir);
  log(`node_modules 裁剪统计: 删除文件 ${removedFiles} 个，删除目录 ${removedDirs} 个`);
}

// ─── Step 3: 生成埋点配置 ───

function generateAnalyticsConfig(targetPaths) {
  writeAnalyticsConfig(targetPaths.analyticsConfigPath);
}

// ─── Step 4: 拷贝图标资源 ───

function copyAppIcon(iconPath) {
  const src = path.join(ROOT, "upstream", "openclaw", "apps", "macos", "Icon.icon", "Assets", "openclaw-mac.png");

  if (!fs.existsSync(src)) {
    die(`图标文件不存在: ${src}`);
  }

  ensureDir(path.dirname(iconPath));
  fs.copyFileSync(src, iconPath);
  log(`已拷贝 app-icon.png 到 ${path.relative(ROOT, iconPath)}`);
}

// ─── Step 5: 生成统一入口和构建信息 ───

function generateEntryAndBuildInfo(gatewayDir, platform, arch) {
  // 写入 gateway-entry.mjs
  const entryContent = 'import "./node_modules/openclaw/dist/entry.js";\n';
  fs.writeFileSync(path.join(gatewayDir, "gateway-entry.mjs"), entryContent);
  log("已生成 gateway-entry.mjs");

  // 写入 build-info.json
  const buildInfo = {
    arch,
    platform,
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(gatewayDir, "build-info.json"), JSON.stringify(buildInfo, null, 2));
  log("已生成 build-info.json");
}

// 验证目标目录关键文件是否存在
function verifyOutput(targetPaths, platform) {
  log("正在验证输出文件...");

  const nodeExe = platform === "darwin" ? "node" : "node.exe";
  const targetRel = path.relative(ROOT, targetPaths.targetBase);

  // macOS npm 在 vendor/npm/，Windows npm 在 node_modules/npm/
  const npmDir = platform === "darwin"
    ? path.join(targetRel, "runtime", "vendor", "npm")
    : path.join(targetRel, "runtime", "node_modules", "npm");

  const required = [
    path.join(targetRel, "runtime", nodeExe),
    npmDir,
    path.join(targetRel, "gateway", "gateway-entry.mjs"),
    path.join(targetRel, "gateway", "node_modules", "openclaw", "dist", "entry.js"),
    path.join(targetRel, "gateway", "node_modules", "openclaw", "dist", "control-ui", "index.html"),
    path.join(targetRel, "analytics-config.json"),
    path.join(targetRel, "app-icon.png"),
  ];

  let allOk = true;
  for (const rel of required) {
    const abs = path.join(ROOT, rel);
    const exists = fs.existsSync(abs);
    const status = exists ? "OK" : "缺失";
    console.log(`  [${status}] ${rel}`);
    if (!exists) allOk = false;
  }

  if (!allOk) {
    die("关键文件缺失，打包失败");
  }

  log("所有关键文件验证通过");
}

// ─── 主流程 ───

async function main() {
  const opts = parseArgs();
  const targetPaths = getTargetPaths(opts.platform, opts.arch);
  ensureDir(targetPaths.targetBase);

  console.log();
  log("========================================");
  log(`平台: ${opts.platform} | 架构: ${opts.arch}`);
  log(`目标: ${targetPaths.targetId}`);
  log("========================================");
  console.log();

  // Step 1: 下载 Node.js 22 运行时
  log("Step 1: 下载 Node.js 22 运行时");
  const nodeVersion = await getLatestNode22Version();
  log(`最新 Node.js 22.x 版本: v${nodeVersion}`);
  await downloadAndExtractNode(nodeVersion, opts.platform, opts.arch, targetPaths.runtimeDir);

  // Step 1.5: 写入 .npmrc
  log("Step 1.5: 配置 .npmrc");
  writeNpmrc(targetPaths.runtimeDir);

  console.log();

  // Step 2: 安装 openclaw 生产依赖
  log("Step 2: 安装 openclaw 生产依赖");
  installDependencies(opts, targetPaths.gatewayDir);

  console.log();

  // Step 3: 生成埋点配置（URL / API Key 仅来自打包环境变量）
  log("Step 3: 生成埋点配置");
  generateAnalyticsConfig(targetPaths);

  console.log();

  // Step 4: 拷贝图标资源（来自 upstream openclaw macOS app）
  log("Step 4: 拷贝图标资源");
  copyAppIcon(targetPaths.iconPath);

  console.log();

  // Step 5: 生成入口文件和构建信息
  log("Step 5: 生成入口文件和构建信息");
  generateEntryAndBuildInfo(targetPaths.gatewayDir, opts.platform, opts.arch);

  console.log();

  // 最终验证
  verifyOutput(targetPaths, opts.platform);

  console.log();
  log("资源打包完成！");
}

main().catch((err) => {
  die(err.message || String(err));
});
