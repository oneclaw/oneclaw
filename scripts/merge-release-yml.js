#!/usr/bin/env node
"use strict";

/**
 * merge-release-yml.js — 合并多架构 electron-builder 产出的 latest*.yml
 *
 * 读取各平台子目录（out/darwin-arm64/, out/darwin-x64/, out/win32-x64/, out/win32-arm64/）
 * 的 yml 文件，合并 files[] 数组为统一版本，收集所有安装包到 out/release/。
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "out");
const RELEASE_DIR = path.join(OUT_DIR, "release");

// 平台 → yml 文件名 → 子目录列表
const MERGE_TARGETS = [
  {
    name: "macOS",
    ymlName: "latest-mac.yml",
    dirs: ["darwin-arm64", "darwin-x64"],
  },
  {
    name: "Windows",
    ymlName: "latest.yml",
    dirs: ["win32-x64", "win32-arm64"],
  },
];

// 需要收集到 release/ 的文件扩展名
const COLLECT_EXTENSIONS = [".dmg", ".zip", ".exe", ".yml"];

// 读取并解析 yml
function loadYml(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return yaml.load(raw);
}

// 合并两个 yml 的 files 数组，按 url 去重
function mergeFiles(existing, incoming) {
  const urls = new Set(existing.map((f) => f.url));
  for (const f of incoming) {
    if (!urls.has(f.url)) {
      existing.push(f);
      urls.add(f.url);
    }
  }
  return existing;
}

// 取较晚的 releaseDate
function laterDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

// 合并一组 yml 文件
function mergeTarget(target) {
  const ymls = [];

  for (const dir of target.dirs) {
    const filePath = path.join(OUT_DIR, dir, target.ymlName);
    const data = loadYml(filePath);
    if (data) {
      ymls.push({ dir, data });
    }
  }

  if (ymls.length === 0) {
    console.warn(`[merge] 跳过 ${target.name}：未找到任何 ${target.ymlName}`);
    return null;
  }

  // 校验版本一致
  const versions = [...new Set(ymls.map((y) => y.data.version))];
  if (versions.length > 1) {
    throw new Error(
      `[merge] ${target.name} 版本不一致: ${versions.join(" vs ")}，请确保所有架构构建相同版本`
    );
  }

  // 以第一个为基础，合并后续的 files[]
  const merged = { ...ymls[0].data };
  merged.files = [...(merged.files || [])];

  for (let i = 1; i < ymls.length; i++) {
    const incoming = ymls[i].data;
    mergeFiles(merged.files, incoming.files || []);
    merged.releaseDate = laterDate(merged.releaseDate, incoming.releaseDate);
  }

  // 删除顶层 path/sha512（它们是单文件时代的遗留字段，多文件时应由 files[] 提供）
  delete merged.path;
  delete merged.sha512;

  return merged;
}

// 收集安装包文件到 release/
function collectArtifacts() {
  let count = 0;

  for (const target of MERGE_TARGETS) {
    for (const dir of target.dirs) {
      const dirPath = path.join(OUT_DIR, dir);
      if (!fs.existsSync(dirPath)) continue;

      for (const file of fs.readdirSync(dirPath)) {
        const ext = path.extname(file).toLowerCase();
        // 只收集安装包，不收集子目录的 yml（已合并）和 blockmap
        if (!COLLECT_EXTENSIONS.includes(ext)) continue;
        if (file.endsWith(".yml")) continue;

        const src = path.join(dirPath, file);
        const dest = path.join(RELEASE_DIR, file);
        if (fs.existsSync(dest)) continue;

        fs.copyFileSync(src, dest);
        count++;
      }
    }
  }

  return count;
}

// ── 入口 ──

function main() {
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // 合并各平台 yml
  for (const target of MERGE_TARGETS) {
    const merged = mergeTarget(target);
    if (!merged) continue;

    const outPath = path.join(RELEASE_DIR, target.ymlName);
    const content = yaml.dump(merged, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    fs.writeFileSync(outPath, content, "utf-8");

    const fileCount = (merged.files || []).length;
    console.log(`[merge] ${target.name}: ${target.ymlName} (${fileCount} 个文件条目) → ${outPath}`);
  }

  // 收集安装包
  const artifactCount = collectArtifacts();
  console.log(`[merge] 收集了 ${artifactCount} 个安装包到 ${RELEASE_DIR}`);

  // 打印最终文件清单
  const files = fs.readdirSync(RELEASE_DIR).sort();
  console.log(`\n[merge] out/release/ 最终清单 (${files.length} 个文件):`);
  for (const f of files) {
    const stat = fs.statSync(path.join(RELEASE_DIR, f));
    const sizeMB = (stat.size / 1024 / 1024).toFixed(1);
    console.log(`  ${f}  (${sizeMB} MB)`);
  }
}

try {
  main();
} catch (err) {
  console.error(`[merge] 失败: ${err.message}`);
  process.exit(1);
}
