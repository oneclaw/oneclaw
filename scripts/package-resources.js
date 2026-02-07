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
const { execSync } = require("child_process");

// ─── 项目根目录 ───
const ROOT = path.resolve(__dirname, "..");

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

          res.on("data", (chunk) => {
            downloaded += chunk.length;
            file.write(chunk);
            if (totalBytes > 0) {
              const pct = ((downloaded / totalBytes) * 100).toFixed(1);
              const mb = (downloaded / 1024 / 1024).toFixed(1);
              process.stdout.write(`\r  下载进度: ${mb} MB (${pct}%)`);
            }
          });

          res.on("end", () => {
            file.end();
            if (totalBytes > 0) process.stdout.write("\n");
            resolve();
          });

          res.on("error", (err) => {
            file.destroy();
            fs.unlinkSync(dest);
            reject(err);
          });
        })
        .on("error", reject);
    };
    request(url);
  });
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

// 下载并解压 Node.js 运行时到 resources/runtime/
async function downloadAndExtractNode(version, platform, arch) {
  const cacheDir = path.join(ROOT, ".cache", "node");
  ensureDir(cacheDir);

  const runtimeDir = path.join(ROOT, "resources", "runtime");

  // 构造文件名和 URL
  const ext = platform === "darwin" ? "tar.gz" : "zip";
  const filename = `node-v${version}-${platform === "win32" ? "win" : "darwin"}-${arch}.${ext}`;
  const url = `https://nodejs.org/dist/v${version}/${filename}`;
  const cachedFile = path.join(cacheDir, filename);

  // 下载（如果缓存中没有）
  if (fs.existsSync(cachedFile)) {
    log(`使用缓存: ${filename}`);
  } else {
    log(`正在下载 ${filename} ...`);
    await downloadFile(url, cachedFile);
    log(`下载完成: ${filename}`);
  }

  // 清理旧的 runtime 目录，准备全新解压
  rmDir(runtimeDir);
  ensureDir(runtimeDir);

  // 解压并提取所需文件
  if (platform === "darwin") {
    extractDarwin(cachedFile, runtimeDir, version, arch);
  } else {
    extractWin32(cachedFile, runtimeDir, version, arch);
  }
}

// macOS: 从 tar.gz 中提取 node 二进制和 npm
function extractDarwin(tarPath, runtimeDir, version, arch) {
  log("正在解压 macOS Node.js 运行时...");
  const prefix = `node-v${version}-darwin-${arch}`;

  // 创建临时解压目录
  const tmpDir = path.join(path.dirname(tarPath), "_extract_tmp");
  rmDir(tmpDir);
  ensureDir(tmpDir);

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
function extractWin32(zipPath, runtimeDir, version, arch) {
  log("正在解压 Windows Node.js 运行时...");
  const prefix = `node-v${version}-win-${arch}`;

  // 创建临时解压目录
  const tmpDir = path.join(path.dirname(zipPath), "_extract_tmp");
  rmDir(tmpDir);
  ensureDir(tmpDir);

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
function writeNpmrc() {
  const npmrcPath = path.join(ROOT, "resources", "runtime", ".npmrc");
  const content = [
    "registry=https://registry.npmmirror.com",
    "disturl=https://npmmirror.com/mirrors/node",
    "",
  ].join("\n");
  fs.writeFileSync(npmrcPath, content);
  log("已写入 .npmrc（使用 npmmirror 镜像源）");
}

// ─── Step 2: 安装 openclaw 生产依赖 ───

// openclaw 包源路径（使用绝对路径，避免 npm file: 相对路径解析错误）
function getPackageSource() {
  return `file:${path.join(ROOT, "upstream", "openclaw")}`;
}

// 安装 openclaw 依赖并裁剪 node_modules
function installDependencies() {
  const gatewayDir = path.join(ROOT, "resources", "gateway");
  rmDir(gatewayDir);
  ensureDir(gatewayDir);

  const source = getPackageSource();
  log(`安装 openclaw 依赖 (来源: ${source}) ...`);

  // 写入 package.json
  const pkg = {
    dependencies: {
      openclaw: source,
    },
  };
  fs.writeFileSync(path.join(gatewayDir, "package.json"), JSON.stringify(pkg, null, 2));

  // 使用系统 npm 执行安装
  // --install-links: 对 file: 依赖做实际拷贝而非符号链接
  execSync("npm install --production --install-links", {
    cwd: gatewayDir,
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });

  log("依赖安装完成，开始裁剪 node_modules...");
  pruneNodeModules(path.join(gatewayDir, "node_modules"));
  log("node_modules 裁剪完成");
}

// 裁剪 node_modules，删除无用文件以减小体积
function pruneNodeModules(nmDir) {
  if (!fs.existsSync(nmDir)) return;

  // 需要删除的文件后缀
  const junkExts = new Set([".d.ts", ".map"]);

  // 需要删除的文档文件名（精确匹配，不区分大小写，避免误杀 changelog.js 等源文件）
  const junkNames = new Set([
    "readme", "readme.md", "readme.txt", "readme.markdown",
    "changelog", "changelog.md", "changelog.txt",
    "license", "license.md", "license.txt", "licence", "licence.md",
    "history.md", "authors", "authors.md", "contributors.md",
  ]);

  // 需要删除的目录名
  const junkDirs = new Set(["test", "tests", "__tests__", "docs", "examples"]);

  // 保留 openclaw 包的 docs（包含运行时模板如 AGENTS.md，不可裁剪）
  const protectedDirs = new Set([
    path.join(nmDir, "openclaw", "docs"),
  ]);

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
        if (protectedDirs.has(fullPath)) {
          // 跳过受保护目录，保留全部内容
        } else if (junkDirs.has(entry.name)) {
          rmDir(fullPath);
        } else {
          walk(fullPath);
        }
      } else {
        const ext = path.extname(entry.name);
        const nameLower = entry.name.toLowerCase();
        const shouldDelete = junkExts.has(ext) || junkNames.has(nameLower);
        if (shouldDelete) {
          fs.unlinkSync(fullPath);
        }
      }
    }
  }

  walk(nmDir);
}

// ─── Step 3: 拷贝图标资源 ───

function copyAppIcon() {
  const src = path.join(ROOT, "upstream", "openclaw", "apps", "macos", "Icon.icon", "Assets", "openclaw-mac.png");
  const dest = path.join(ROOT, "resources", "app-icon.png");

  if (!fs.existsSync(src)) {
    die(`图标文件不存在: ${src}`);
  }

  fs.copyFileSync(src, dest);
  log("已拷贝 app-icon.png");
}

// ─── Step 4: 生成统一入口和构建信息 ───

function generateEntryAndBuildInfo(platform, arch) {
  const gatewayDir = path.join(ROOT, "resources", "gateway");

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

// 验证关键文件是否存在
function verifyOutput(platform) {
  log("正在验证输出文件...");

  const nodeExe = platform === "darwin" ? "node" : "node.exe";

  // macOS npm 在 vendor/npm/，Windows npm 在 node_modules/npm/
  const npmDir = platform === "darwin"
    ? path.join("resources", "runtime", "vendor", "npm")
    : path.join("resources", "runtime", "node_modules", "npm");

  const required = [
    path.join("resources", "runtime", nodeExe),
    npmDir,
    path.join("resources", "gateway", "gateway-entry.mjs"),
    path.join("resources", "gateway", "node_modules", "openclaw", "dist", "entry.js"),
    path.join("resources", "gateway", "node_modules", "openclaw", "dist", "control-ui", "index.html"),
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

  console.log();
  log("========================================");
  log(`平台: ${opts.platform} | 架构: ${opts.arch}`);
  log("========================================");
  console.log();

  // Step 1: 下载 Node.js 22 运行时
  log("Step 1: 下载 Node.js 22 运行时");
  const nodeVersion = await getLatestNode22Version();
  log(`最新 Node.js 22.x 版本: v${nodeVersion}`);
  await downloadAndExtractNode(nodeVersion, opts.platform, opts.arch);

  // Step 1.5: 写入 .npmrc
  log("Step 1.5: 配置 .npmrc");
  writeNpmrc();

  console.log();

  // Step 2: 安装 openclaw 生产依赖
  log("Step 2: 安装 openclaw 生产依赖");
  installDependencies();

  console.log();

  // Step 3: 拷贝图标资源（来自 upstream openclaw macOS app）
  log("Step 3: 拷贝图标资源");
  copyAppIcon();

  console.log();

  // Step 4: 生成入口文件和构建信息
  log("Step 4: 生成入口文件和构建信息");
  generateEntryAndBuildInfo(opts.platform, opts.arch);

  console.log();

  // 最终验证
  verifyOutput(opts.platform);

  console.log();
  log("资源打包完成！");
}

main().catch((err) => {
  die(err.message || String(err));
});
