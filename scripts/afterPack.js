/**
 * afterPack.js — electron-builder afterPack 钩子
 *
 * 在 electron-builder 完成文件收集（含 node_modules 剥离）之后、
 * 签名和生成安装包之前，将 resources/runtime 和 resources/gateway
 * 注入到 app bundle 中，绕过 node_modules 过滤。
 */

"use strict";

const path = require("path");
const fs = require("fs");

// ── 注入目录列表 ──

const INJECT_DIRS = ["runtime", "gateway"];

// ── 入口 ──

exports.default = async function afterPack(context) {
  const platform = context.electronPlatformName;
  const appOutDir = context.appOutDir;

  // 平台差异：macOS 资源在 .app 包内，Windows 直接在 resources/ 下
  const resourcesDir =
    platform === "darwin"
      ? path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");

  const targetBase = path.join(resourcesDir, "resources");
  const sourceBase = path.join(__dirname, "..", "resources");

  for (const name of INJECT_DIRS) {
    const src = path.join(sourceBase, name);
    const dest = path.join(targetBase, name);

    if (!fs.existsSync(src)) {
      throw new Error(`[afterPack] 资源目录不存在: ${src}`);
    }

    copyDirSync(src, dest);
    console.log(`[afterPack] 已注入 ${name}/ → ${path.relative(appOutDir, dest)}`);
  }

  // 注入 app 图标（tray 使用）
  const iconSrc = path.join(sourceBase, "app-icon.png");
  if (fs.existsSync(iconSrc)) {
    const iconDest = path.join(targetBase, "app-icon.png");
    fs.copyFileSync(iconSrc, iconDest);
    console.log(`[afterPack] 已注入 app-icon.png`);
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
