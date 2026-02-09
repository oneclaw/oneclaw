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
};

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
