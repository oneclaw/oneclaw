"use strict";

// ─── Plugin entry standardizer ────────────────────────────────────────────
//
// openclaw 插件的入口可能是 .ts / .mjs / .js / .cjs。openclaw gateway 内部有多
// 份独立的 jiti loader cache（`const jitiLoaders = new Map()` 在 dist/ 的多份
// chunk 里各声明一次）。.ts 入口走 jiti transpile 路径，每份 cache 独立 eval
// 一次——同一个 plugin 模块被实例化成 N 份 "不同" 的 module instance，模块级
// 变量（比如 `let weixinRuntime`）互相不可见。.mjs/.js/.cjs 入口走 Node 原生
// `createRequire`，一份 Node module cache 全局共享，单例天然成立。
//
// 本模块负责构建期强制把每个 OneClaw 打包的插件入口标准化成 `.mjs`——
// 已是 native 形态的直接 skip；.ts 入口就用 esbuild bundle 到
// `dist/oneclaw-bundle.mjs` 并重写所有 "指向入口" 的字段（manifest.main /
// package.json main / package.json openclaw.extensions[0]），让 openclaw
// 的 entry resolver 无论走哪条路径都拿到 .mjs。

const fs = require("node:fs");
const path = require("node:path");

const MANIFEST_FILE = "openclaw.plugin.json";
const PACKAGE_FILE = "package.json";
const BUNDLE_REL = path.join("dist", "oneclaw-bundle.mjs");
const NATIVE_EXT = new Set([".mjs", ".cjs", ".js"]);
// openclaw gateway 2026.4.5 dist/manifest-BLZdOZfM.js:238 的 DEFAULT_PLUGIN_ENTRY_CANDIDATES，
// 顺序至关重要——`index.ts` 排第一，所以 plugin 目录下只要有 index.ts 就会被优先选中。
const FALLBACK_ENTRIES = ["index.ts", "index.js", "index.mjs", "index.cjs"];

function readJson(absPath) {
  try {
    return JSON.parse(fs.readFileSync(absPath, "utf-8"));
  } catch {
    return null;
  }
}

function writeJsonPretty(absPath, value) {
  fs.writeFileSync(absPath, `${JSON.stringify(value, null, 2)}\n`);
}

// 严格复刻 openclaw 2026.4.5 的 resolve 逻辑：
//   1. package.json 里 MANIFEST_KEY 字段（即 "openclaw"）下的 `extensions[0]`
//      （见 dist/manifest-BLZdOZfM.js:248 resolvePackageExtensionEntries + :244 getPackageManifestMetadata）
//   2. 上一步 missing/empty 时 fallback 到 DEFAULT_PLUGIN_ENTRY_CANDIDATES
//      （见 dist/manifest-BLZdOZfM.js:238 + dist/ids-Dm8ff2qI.js:818/930）
//
// openclaw 不读 `openclaw.plugin.json#main`，也不读 package.json 的 `main`/`module`——
// 即便它们存在，实际 runtime 只认 `openclaw.extensions` 与 fallback 的 index.* 扫描。
function resolveOpenClawPluginEntry(pluginDir) {
  const pkg = readJson(path.join(pluginDir, PACKAGE_FILE)) || {};
  const rawExt = pkg.openclaw && Array.isArray(pkg.openclaw.extensions)
    ? pkg.openclaw.extensions.map((e) => (typeof e === "string" ? e.trim() : "")).filter(Boolean)
    : [];

  if (rawExt.length > 0) {
    const first = rawExt[0];
    const abs = path.resolve(pluginDir, first);
    if (fs.existsSync(abs)) {
      return { relPath: first.replace(/^\.\//, ""), absPath: abs };
    }
    // openclaw.extensions 指向了一个不存在的文件——继续走 fallback，与 openclaw 行为一致
  }

  for (const fallback of FALLBACK_ENTRIES) {
    const abs = path.join(pluginDir, fallback);
    if (fs.existsSync(abs)) {
      return { relPath: fallback, absPath: abs };
    }
  }

  return null;
}

// 把 package.json 里 openclaw.extensions[0] 指向 bundle 产物。
// 这是 openclaw 唯一真实读取的入口字段（见 resolveOpenClawPluginEntry 注释）。
// 其余 manifest.main / pkg.main / pkg.module 是死字段或无关字段，不动，
// 避免引入与其他工具（npm publish、Node require）的未知交互。
function patchPluginEntryFields(pluginDir, newRelPath) {
  const pkgPath = path.join(pluginDir, PACKAGE_FILE);
  const pkg = readJson(pkgPath);
  if (!pkg) return;

  const normalized = `./${newRelPath.replace(/\\/g, "/").replace(/^\.\//, "")}`;

  const openclaw = pkg.openclaw || {};
  const existing = Array.isArray(openclaw.extensions) ? openclaw.extensions : [];
  // 如果 plugin 没写 openclaw.extensions，我们也要补一个——weixin 当前有写，
  // 未来可能有 plugin 没写（走 fallback index.ts）的情况，bundle 后需要
  // 显式指明入口，不然 fallback 会又选回原生 index.ts。
  const next = existing.length > 0
    ? [normalized, ...existing.slice(1)]
    : [normalized];
  if (next[0] === existing[0] && next.length === existing.length) {
    return; // 已是目标值，不重复写
  }
  pkg.openclaw = { ...openclaw, extensions: next };
  writeJsonPretty(pkgPath, pkg);
}

// 返回 true 表示 bundle 产物已是最新（mtime >= source entry 的 mtime），可跳过。
function isBundleFresh(bundlePath, entryPath) {
  if (!fs.existsSync(bundlePath)) return false;
  try {
    const bundleMtime = fs.statSync(bundlePath).mtimeMs;
    const entryMtime = fs.statSync(entryPath).mtimeMs;
    return bundleMtime >= entryMtime;
  } catch {
    return false;
  }
}

// 对单个插件目录确保入口是 **single-file** native 形态。
//
// 为什么不能用上游的原生 `.mjs` 入口？
//   openclaw 的 plugin loader 只给**入口文件**挂 jiti aliasMap（把 `openclaw` →
//   gateway 内部的绝对路径）。入口之后的 chunk 由 Node 原生 `import()` 加载，
//   不经过 aliasMap，所以 chunk 里的 `import "openclaw/plugin-sdk/..."` 会在
//   `~/.openclaw/extensions/<id>/` 附近查 `node_modules/openclaw` 而找不到。
//   上游 `dist/index.mjs` 多半是 multi-chunk bundle（dingtalk 有 27 个 chunk），
//   暴露了这个 resolve 盲区。
//
// 修法：无条件重新 esbuild bundle 成 single-file，保证 `openclaw` 只出现在入口，
// 入口又总是由 jiti loader 加载，aliasMap 100% 生效。
//
//   - 入口不存在        → action = 'missing'（调用方决定是否 fatal）
//   - 所有其他情况      → esbuild bundle → dist/oneclaw-bundle.mjs，重写
//                         package.json#openclaw.extensions[0] 指向它
//
// opts.allowNativeSkip = true 时保留旧行为（入口已是 .mjs/.js/.cjs 就跳过）——
// 仅用于 openclaw 内置 plugin（kimi-claw/kimi-search），它们住在 gateway 自己的
// node_modules 里，jiti aliasMap 直接覆盖它们的 runtime require。
async function ensurePluginNativeEntry(pluginDirInput, opts = {}) {
  // esbuild 的 absWorkingDir 必须绝对路径，调用方可能传相对路径（dev 脚本、测试）
  const pluginDir = path.resolve(pluginDirInput);
  const label = opts.label || path.basename(pluginDir);
  const entry = resolveOpenClawPluginEntry(pluginDir);

  if (!entry) {
    return { action: "missing", pluginDir, entry: null };
  }

  const ext = path.extname(entry.relPath).toLowerCase();
  if (opts.allowNativeSkip && NATIVE_EXT.has(ext)) {
    return { action: "skip", pluginDir, entry: entry.relPath };
  }

  // 无条件 esbuild 重 bundle 成 single-file
  const bundleAbs = path.join(pluginDir, BUNDLE_REL);
  if (isBundleFresh(bundleAbs, entry.absPath)) {
    // Bundle 新鲜，但可能上次改了入口字段后 package.json 被 install 重置过。
    // 保险起见再 patch 一次，是幂等的。
    patchPluginEntryFields(pluginDir, BUNDLE_REL);
    return { action: "bundled-reused", pluginDir, entry: entry.relPath, outFile: BUNDLE_REL };
  }

  // 懒加载 esbuild——不是所有构建路径都会用到（Windows arm64 交叉构建有可能被
  // 外层 try/catch 跳过，不要把启动成本强加给每次 `npm run package:resources`）。
  // eslint-disable-next-line global-require
  const esbuild = require("esbuild");

  fs.mkdirSync(path.dirname(bundleAbs), { recursive: true });

  // - `openclaw` 是 peer dep，运行时由 gateway 的 node_modules 提供，不要 bundle
  //   进 plugin（否则会把 gateway 内部 state 复制一份，跟 host 完全脱钩）
  // - `*.node` 是 native addon，esbuild 不能静态分析，保留动态 require
  const external = ["openclaw", "openclaw/*", "*.node"];

  try {
    await esbuild.build({
      entryPoints: [entry.absPath],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      external,
      outfile: bundleAbs,
      absWorkingDir: pluginDir,
      // 插件作者的 tsconfig 可能指向 bundler/esnext-preserve 等奇怪的 target，
      // 强制我们这边的编译语义，避免被上游配置左右。
      tsconfigRaw: JSON.stringify({
        compilerOptions: {
          target: "es2022",
          module: "esnext",
          moduleResolution: "bundler",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          jsx: "preserve",
        },
      }),
      // ESM 下需要 __dirname/__filename shim？目前 5 个 plugin 都没用到，先不加。
      // 若未来 bundle 报 "__dirname is not defined"，加 banner 注入即可。
      logLevel: "warning",
    });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    throw new Error(`[${label}] esbuild bundle failed for ${entry.relPath}: ${msg}`);
  }

  patchPluginEntryFields(pluginDir, BUNDLE_REL);

  return { action: "bundled", pluginDir, entry: entry.relPath, outFile: BUNDLE_REL };
}

module.exports = {
  resolveOpenClawPluginEntry,
  ensurePluginNativeEntry,
  BUNDLE_REL,
  NATIVE_EXT,
};
