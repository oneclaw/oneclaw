/**
 * afterPack.js — electron-builder afterPack 钩子
 *
 * 在 electron-builder 完成文件收集（含 node_modules 剥离）之后、
 * 签名和生成安装包之前，将 resources/targets/<platform-arch>/ 下的资源
 * 注入到 app bundle 中，避免多目标并行打包时资源相互覆盖。
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");
const { Arch } = require("builder-util");

// ── 注入目录列表 ──

const INJECT_DIRS = ["runtime", "gateway"];
const REQUIRED_FILES = ["analytics-config.json"];
const OPTIONAL_FILES = ["app-icon.png"];

// 解析 electron-builder 产物架构
function resolveArchName(arch) {
  if (typeof arch === "string") return arch;
  const name = Arch[arch];
  if (typeof name === "string") return name;
  throw new Error(`[afterPack] 无法识别 arch: ${String(arch)}`);
}

// 计算当前 afterPack 对应的目标 ID
function resolveTargetId(context) {
  const fromEnv = process.env.ONECLAW_TARGET;
  if (fromEnv) return fromEnv;
  const platform = context.electronPlatformName;
  const arch = resolveArchName(context.arch);
  return `${platform}-${arch}`;
}

// ── 入口 ──

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const appOutDir = context.appOutDir;
  const targetId = resolveTargetId(context);

  // 平台差异：macOS 资源在 .app 包内，Windows 直接在 resources/ 下
  const resourcesDir =
    platform === "darwin"
      ? path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");

  const targetBase = path.join(resourcesDir, "resources");
  const sourceBase = path.join(__dirname, "..", "resources", "targets", targetId);
  if (!fs.existsSync(sourceBase)) {
    throw new Error(
      `[afterPack] 未找到目标资源目录: ${sourceBase}，请先执行 package:resources -- --platform ${platform} --arch ${resolveArchName(context.arch)}`
    );
  }
  console.log(`[afterPack] 使用目标资源: ${targetId}`);

  for (const name of INJECT_DIRS) {
    const src = path.join(sourceBase, name);
    const dest = path.join(targetBase, name);

    if (!fs.existsSync(src)) {
      throw new Error(`[afterPack] 资源目录不存在: ${src}`);
    }

    copyDirSync(src, dest);
    console.log(`[afterPack] 已注入 ${name}/ → ${path.relative(appOutDir, dest)}`);
  }

  // 注入必须存在的单文件资源（如打包时动态生成的埋点配置）
  for (const name of REQUIRED_FILES) {
    const src = path.join(sourceBase, name);
    const dest = path.join(targetBase, name);
    if (!fs.existsSync(src)) {
      throw new Error(`[afterPack] 必需文件不存在: ${src}`);
    }
    fs.copyFileSync(src, dest);
    console.log(`[afterPack] 已注入 ${name}`);
  }

  // 注入可选单文件资源（缺失则跳过）
  for (const name of OPTIONAL_FILES) {
    const src = path.join(sourceBase, name);
    const dest = path.join(targetBase, name);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, dest);
    console.log(`[afterPack] 已注入 ${name}`);
  }

  // ── 裁剪 gateway node_modules 中的冗余文件 ──
  const arch = resolveArchName(context.arch);
  const gatewayDir = path.join(targetBase, "gateway");
  pruneGatewayModules(gatewayDir, platform, arch);

  // ── Windows: 将 node_modules 打成 tar 包（NSIS 只需安装 1 个文件而非数万散文件） ──
  // macOS 不打 tar：Apple 公证会穿透 tar 扫描内部未签名的 .node，导致公证失败。
  if (platform === "win32") {
    tarGatewayModules(gatewayDir);
  }

  // ── 用 Electron binary 替换独立 Node.js（节省 80-100MB） ──
  const productName = context.packager.appInfo.productFilename;
  replaceNodeBinary(platform, targetBase, productName);
};

// ── 用 Electron binary 代理替换独立 Node.js ──
//
// packaged 模式下 process.execPath 就是 Electron binary，配合
// ELECTRON_RUN_AS_NODE=1 即可作为纯 Node.js 使用。
// macOS 写入代理 shell 脚本（供 npm wrapper 链式调用 "$dir/node"）；
// Windows 删除 node.exe 并重写 npm.cmd / npx.cmd 直接调用 <productName>.exe。

function replaceNodeBinary(platform, targetBase, productName) {
  const runtimeDir = path.join(targetBase, "runtime");

  if (platform === "darwin") {
    // macOS: 使用 Helper binary（LSUIElement=true，不产生 Dock 弹跳图标）
    // 路径: runtime/ → resources/ → Resources/ → Contents/Frameworks/<name> Helper.app/...
    const nodePath = path.join(runtimeDir, "node");
    if (fs.existsSync(nodePath)) {
      const sizeMB = (fs.statSync(nodePath).size / 1048576).toFixed(1);
      fs.unlinkSync(nodePath);
      console.log(`[afterPack] 已删除 runtime/node (${sizeMB} MB)`);
    }

    // 代理脚本：设置 ELECTRON_RUN_AS_NODE=1，exec 到 Helper binary
    // 注意：脚本内容必须纯 ASCII，UTF-8 多字节字符会触发
    // @electron/osx-sign 内 isbinaryfile 的 protobuf 解析崩溃
    const helperName = `${productName} Helper`;
    const helperRelPath = `Frameworks/${helperName}.app/Contents/MacOS/${helperName}`;
    const proxyScript = [
      "#!/bin/sh",
      "# Proxy script - run Electron Helper binary as Node.js runtime",
      'export ELECTRON_RUN_AS_NODE=1',
      `exec "$(dirname "$0")/../../../${helperRelPath}" "$@"`,
      "",
    ].join("\n");

    fs.writeFileSync(nodePath, proxyScript, "utf-8");
    fs.chmodSync(nodePath, 0o755);
    console.log(`[afterPack] 已写入 macOS node 代理脚本 (-> ${helperRelPath})`);
  } else if (platform === "win32") {
    // Windows: runtime/ → resources/ → resources/ → <install>/<productName>.exe
    const nodeExePath = path.join(runtimeDir, "node.exe");
    if (fs.existsSync(nodeExePath)) {
      const sizeMB = (fs.statSync(nodeExePath).size / 1048576).toFixed(1);
      fs.unlinkSync(nodeExePath);
      console.log(`[afterPack] 已删除 runtime/node.exe (${sizeMB} MB)`);
    }

    // 重写 npm.cmd — 注入 ELECTRON_RUN_AS_NODE=1，指向 Electron binary
    const npmCmdPath = path.join(runtimeDir, "npm.cmd");
    if (fs.existsSync(npmCmdPath)) {
      const npmScript = buildWindowsElectronProxyScript(productName, "%~dp0node_modules\\npm\\bin\\npm-cli.js");
      fs.writeFileSync(npmCmdPath, npmScript, "utf-8");
      console.log(`[afterPack] 已重写 npm.cmd`);
    }

    // 重写 npx.cmd — 同上
    const npxCmdPath = path.join(runtimeDir, "npx.cmd");
    if (fs.existsSync(npxCmdPath)) {
      const npxScript = buildWindowsElectronProxyScript(productName, "%~dp0node_modules\\npm\\bin\\npx-cli.js");
      fs.writeFileSync(npxCmdPath, npxScript, "utf-8");
      console.log(`[afterPack] 已重写 npx.cmd`);
    }
  }
}

// Windows runtime wrapper 优先走 Helper.exe，缺失时再回退主 exe，避免首次启动前 wrapper 失效。
function buildWindowsElectronProxyScript(productName, cliEntryPath) {
  const mainExe = `%~dp0..\\..\\..\\${productName}.exe`;
  const helperExe = `%~dp0..\\..\\..\\${productName} Helper.exe`;
  return [
    "@echo off",
    'set "ELECTRON_RUN_AS_NODE=1"',
    `set "APP_EXE=${mainExe}"`,
    `set "APP_HELPER=${helperExe}"`,
    'if exist "%APP_HELPER%" (',
    `  "%APP_HELPER%" "${cliEntryPath}" %*`,
    ") else (",
    `  "%APP_EXE%" "${cliEntryPath}" %*`,
    ")",
  ].join("\r\n") + "\r\n";
}

// ── 裁剪 gateway node_modules 冗余文件 ──
//
// 构建产物中包含大量无用文件（跨平台 native binaries、source maps、文档），
// 清理后可减少数千文件和近百 MB 体积。

// 平台名映射：Electron 架构名 → koffi 目录名前缀
const KOFFI_PLATFORM_MAP = {
  "darwin-x64": "darwin_x64",
  "darwin-arm64": "darwin_arm64",
  "win32-x64": "win32_x64",
  "win32-arm64": "win32_arm64",
};

function pruneGatewayModules(gatewayDir, platform, arch) {
  const modulesDir = path.join(gatewayDir, "node_modules");
  if (!fs.existsSync(modulesDir)) return;

  let removedFiles = 0;
  let removedBytes = 0;

  // 1) koffi: 仅保留目标平台的 native binary，删除其余 17 个平台
  const koffiBuildsDir = path.join(modulesDir, "koffi", "build", "koffi");
  if (fs.existsSync(koffiBuildsDir)) {
    const keepDir = KOFFI_PLATFORM_MAP[`${platform}-${arch}`];
    for (const entry of fs.readdirSync(koffiBuildsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== keepDir) {
        const dirPath = path.join(koffiBuildsDir, entry.name);
        const { count, bytes } = countFiles(dirPath);
        fs.rmSync(dirPath, { recursive: true, force: true });
        removedFiles += count;
        removedBytes += bytes;
      }
    }
    console.log(`[afterPack] koffi: 保留 ${keepDir}，删除其余平台`);
  }

  // 2) .map 文件（source maps，运行时不需要）
  const mapStats = removeByGlob(modulesDir, /\.map$/);
  removedFiles += mapStats.count;
  removedBytes += mapStats.bytes;

  // 3) 文档文件（README、LICENSE、CHANGELOG 等，仅匹配无扩展名或 .md/.txt/.rst）
  const docStats = removeByGlob(modulesDir, /^(readme|license|licence|changelog|history|authors|contributors)(\.md|\.txt|\.rst)?$/i);
  removedFiles += docStats.count;
  removedBytes += docStats.bytes;

  const savedMB = (removedBytes / 1048576).toFixed(1);
  console.log(`[afterPack] 裁剪完成: 删除 ${removedFiles} 个文件，节省 ${savedMB} MB`);
}

// 递归统计目录内文件数和总字节
function countFiles(dir) {
  let count = 0;
  let bytes = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = countFiles(p);
      count += sub.count;
      bytes += sub.bytes;
    } else {
      count++;
      try { bytes += fs.statSync(p).size; } catch {}
    }
  }
  return { count, bytes };
}

// 递归删除匹配正则的文件
function removeByGlob(dir, pattern) {
  let count = 0;
  let bytes = 0;
  walkDir(dir, (filePath) => {
    if (pattern.test(path.basename(filePath))) {
      try {
        bytes += fs.statSync(filePath).size;
        fs.unlinkSync(filePath);
        count++;
      } catch {}
    }
  });
  return { count, bytes };
}

// 递归遍历目录
function walkDir(dir, callback) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(p, callback);
    } else {
      callback(p);
    }
  }
}

// ── 将 node_modules 打成 tar 包 ──
//
// 安装包内用单个 tar 文件代替数万散文件，
// 避免 NSIS 逐文件解压 + Windows Defender 逐文件扫描导致安装 10 分钟以上。
// 首次启动时由 gateway-extract.ts 在主进程中解压。

function tarGatewayModules(gatewayDir) {
  const modulesDir = path.join(gatewayDir, "node_modules");
  if (!fs.existsSync(modulesDir)) return;

  const tarPath = path.join(gatewayDir, "node_modules.tar");

  // 统计裁剪后的文件数
  const { count } = countFiles(modulesDir);
  console.log(`[afterPack] 将 ${count} 个文件打包为 node_modules.tar ...`);

  const startTime = Date.now();
  execFileSync("tar", ["cf", "node_modules.tar", "node_modules"], {
    cwd: gatewayDir,
    timeout: 300_000,
  });

  const tarSizeMB = (fs.statSync(tarPath).size / 1048576).toFixed(1);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[afterPack] tar 完成: ${tarSizeMB} MB，耗时 ${elapsed}s`);

  // 删除原始 node_modules 目录
  fs.rmSync(modulesDir, { recursive: true, force: true });
  console.log(`[afterPack] 已删除原始 node_modules/`);
}

// ── 递归复制目录（保留文件权限） ──

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      // 符号链接 → 解引用后复制实际文件
      const real = fs.realpathSync(s);
      fs.copyFileSync(real, d);
      fs.chmodSync(d, fs.statSync(real).mode);
    } else {
      fs.copyFileSync(s, d);
      fs.chmodSync(d, fs.statSync(s).mode);
    }
  }
}
