/**
 * afterPack.js — electron-builder afterPack 钩子
 *
 * 在 electron-builder 完成文件收集（含 node_modules 剥离）之后、
 * 签名和生成安装包之前，将 resources/targets/<platform-arch>/ 下的资源
 * 注入到 app bundle 中，避免多目标并行打包时资源相互覆盖。
 *
 * 自动检测 asar / 散文件两种 gateway 打包模式：
 *   - asar 模式：注入 gateway.asar + gateway.asar.unpacked/
 *   - 散文件模式：注入 gateway/ 目录 + 执行 koffi 平台裁剪
 */

"use strict";

const path = require("path");
const fs = require("fs");
const { Arch } = require("builder-util");

// ── 固定注入资源 ──

const REQUIRED_FILES = ["build-config.json"];
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

  // ── 检测 gateway 打包模式 ──
  const gatewayAsarPath = path.join(sourceBase, "gateway.asar");
  const useAsar = fs.existsSync(gatewayAsarPath);

  if (useAsar) {
    injectGatewayAsar(sourceBase, targetBase, appOutDir);
  } else {
    injectGatewayLoose(sourceBase, targetBase, appOutDir, platform, context);
  }

  // runtime 目录始终以散文件注入
  const runtimeSrc = path.join(sourceBase, "runtime");
  if (!fs.existsSync(runtimeSrc)) {
    throw new Error(`[afterPack] 资源目录不存在: ${runtimeSrc}`);
  }
  copyDirSync(runtimeSrc, path.join(targetBase, "runtime"));
  console.log(`[afterPack] 已注入 runtime/ → ${path.relative(appOutDir, path.join(targetBase, "runtime"))}`);

  // 注入必须存在的单文件资源
  for (const name of REQUIRED_FILES) {
    const src = path.join(sourceBase, name);
    const dest = path.join(targetBase, name);
    if (!fs.existsSync(src)) {
      throw new Error(`[afterPack] 必需文件不存在: ${src}`);
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
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

  // ── 用 Electron binary 替换独立 Node.js（节省 80-100MB） ──
  const productName = context.packager.appInfo.productFilename;
  replaceNodeBinary(platform, targetBase, productName);

  // ── Windows: 写入 CLI 补丁脚本（安装时由 NSIS 执行，复制主 exe 并补丁 PE SUBSYSTEM） ──
  if (platform === "win32") {
    writeCliBinaryPatchScript(appOutDir, productName);
  }
};

// ── asar 模式：注入 gateway.asar + gateway.asar.unpacked/ ──

function injectGatewayAsar(sourceBase, targetBase, appOutDir) {
  const asarSrc = path.join(sourceBase, "gateway.asar");
  const asarDest = path.join(targetBase, "gateway.asar");
  fs.mkdirSync(path.dirname(asarDest), { recursive: true });
  fs.copyFileSync(asarSrc, asarDest);
  const sizeMB = (fs.statSync(asarDest).size / 1048576).toFixed(1);
  console.log(`[afterPack] 已注入 gateway.asar (${sizeMB} MB) → ${path.relative(appOutDir, asarDest)}`);

  // native modules 目录（可能不存在，比如纯 JS 依赖的场景）
  const unpackedSrc = path.join(sourceBase, "gateway.asar.unpacked");
  if (fs.existsSync(unpackedSrc)) {
    const unpackedDest = path.join(targetBase, "gateway.asar.unpacked");
    copyDirSync(unpackedSrc, unpackedDest);
    console.log(`[afterPack] 已注入 gateway.asar.unpacked/ → ${path.relative(appOutDir, unpackedDest)}`);
  }

  // asar 模式下所有裁剪已在 package-resources 阶段完成，此处无需 prune
}

// ── 散文件模式：注入 gateway/ 目录 + koffi 平台裁剪 ──

function injectGatewayLoose(sourceBase, targetBase, appOutDir, platform, context) {
  const gatewaySrc = path.join(sourceBase, "gateway");
  if (!fs.existsSync(gatewaySrc)) {
    throw new Error(`[afterPack] 资源目录不存在: ${gatewaySrc}`);
  }
  const gatewayDest = path.join(targetBase, "gateway");
  copyDirSync(gatewaySrc, gatewayDest);
  console.log(`[afterPack] 已注入 gateway/ → ${path.relative(appOutDir, gatewayDest)}`);

  // 散文件模式保留 koffi 平台裁剪（asar 模式已前移到 package-resources）
  const arch = resolveArchName(context.arch);
  pruneGatewayModules(gatewayDest, platform, arch);
}

// ── Windows CLI 补丁脚本：安装时由 NSIS 调用，复制主 exe 并补丁 PE SUBSYSTEM ──
// 不在 afterPack 阶段生成 CLI.exe 副本，避免安装器体积膨胀（+58MB）。
// 改为写入一个 PowerShell 脚本，由 NSIS customInstall 在安装完成后执行。

function writeCliBinaryPatchScript(appOutDir, productName) {
  const resourcesDir = path.join(appOutDir, "resources");
  fs.mkdirSync(resourcesDir, { recursive: true });

  // PowerShell 脚本：复制主 exe → CLI exe，补丁 PE SUBSYSTEM 从 GUI(2) 到 CONSOLE(3)
  const ps1 = [
    "$src = Join-Path $env:INST_DIR '@@EXE@@'",
    "$dst = Join-Path $env:INST_DIR '@@CLI@@'",
    "Copy-Item $src $dst -Force",
    "$f = [System.IO.File]::Open($dst, 'Open', 'ReadWrite')",
    "try {",
    "  $br = New-Object System.IO.BinaryReader($f)",
    "  $bw = New-Object System.IO.BinaryWriter($f)",
    "  # PE header offset at 0x3C",
    "  $f.Seek(0x3C, 'Begin') | Out-Null",
    "  $peOff = $br.ReadInt32()",
    "  # PE signature check",
    "  $f.Seek($peOff, 'Begin') | Out-Null",
    "  $sig = $br.ReadInt32()",
    "  if ($sig -ne 0x00004550) { throw 'Not a PE file' }",
    "  # SUBSYSTEM at PE offset + 0x5C",
    "  $f.Seek($peOff + 0x5C, 'Begin') | Out-Null",
    "  $sub = $br.ReadInt16()",
    "  if ($sub -eq 2) {",
    "    $f.Seek($peOff + 0x5C, 'Begin') | Out-Null",
    "    $bw.Write([Int16]3)",
    "  }",
    "} finally { $f.Close() }",
  ].join("\r\n")
    .replace(/@@EXE@@/g, `${productName}.exe`)
    .replace(/@@CLI@@/g, `${productName}-CLI.exe`);

  const scriptPath = path.join(resourcesDir, "create-cli-binary.ps1");
  fs.writeFileSync(scriptPath, ps1, "utf-8");
  console.log(`[afterPack] wrote create-cli-binary.ps1 for NSIS install-time CLI patching`);
}

// ── 用 Electron binary 代理替换独立 Node.js ──

function replaceNodeBinary(platform, targetBase, productName) {
  const runtimeDir = path.join(targetBase, "runtime");

  if (platform === "darwin") {
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
    const nodeExePath = path.join(runtimeDir, "node.exe");
    if (fs.existsSync(nodeExePath)) {
      const sizeMB = (fs.statSync(nodeExePath).size / 1048576).toFixed(1);
      fs.unlinkSync(nodeExePath);
      console.log(`[afterPack] 已删除 runtime/node.exe (${sizeMB} MB)`);
    }

    const npmCmdPath = path.join(runtimeDir, "npm.cmd");
    if (fs.existsSync(npmCmdPath)) {
      const npmScript = buildWindowsElectronProxyScript(productName, "%~dp0node_modules\\npm\\bin\\npm-cli.js");
      fs.writeFileSync(npmCmdPath, npmScript, "utf-8");
      console.log(`[afterPack] 已重写 npm.cmd`);
    }

    const npxCmdPath = path.join(runtimeDir, "npx.cmd");
    if (fs.existsSync(npxCmdPath)) {
      const npxScript = buildWindowsElectronProxyScript(productName, "%~dp0node_modules\\npm\\bin\\npx-cli.js");
      fs.writeFileSync(npxCmdPath, npxScript, "utf-8");
      console.log(`[afterPack] 已重写 npx.cmd`);
    }
  }
}

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

// ── 裁剪 gateway node_modules（仅散文件模式使用） ──

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

  // koffi: 仅保留目标平台的 native binary，删除其余 17 个平台
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

  // .map 文件
  const mapStats = removeByGlob(modulesDir, /\.map$/);
  removedFiles += mapStats.count;
  removedBytes += mapStats.bytes;

  // 文档文件
  const docStats = removeByGlob(modulesDir, /^(readme|license|licence|changelog|history|authors|contributors)(\.md|\.txt|\.rst)?$/i);
  removedFiles += docStats.count;
  removedBytes += docStats.bytes;

  const savedMB = (removedBytes / 1048576).toFixed(1);
  console.log(`[afterPack] 裁剪完成: 删除 ${removedFiles} 个文件，节省 ${savedMB} MB`);
}

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

// ── 递归复制目录（保留文件权限） ──

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      const real = fs.realpathSync(s);
      fs.copyFileSync(real, d);
      fs.chmodSync(d, fs.statSync(real).mode);
    } else {
      fs.copyFileSync(s, d);
      fs.chmodSync(d, fs.statSync(s).mode);
    }
  }
}
