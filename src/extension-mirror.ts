/**
 * extension-mirror.ts — 第三方 channel plugin 的 reconcile 逻辑
 *
 * OneClaw 不再使用 openclaw 的 `bundled-channel-entry` 契约（那条路径需要 138 行
 * shim 模板，且会触发 jiti module-identity 分裂）。改为：
 *
 *   1. package-resources 把 4 个第三方 channel plugin 写入
 *      `resources/<target>/extensions-mirror/<id>/`（不进 gateway.asar）
 *   2. afterPack 把 `extensions-mirror/` 注入 app bundle
 *   3. 主进程启动时 reconcile 到 `~/.openclaw/extensions/<id>/`
 *   4. openclaw host 走标准 external-plugin scan 路径加载，零 shim
 *
 * Reconcile 策略（参照 ClawX `ensurePluginInstalled`）：
 *   - dest 不存在 → 完整复制 mirror → dest
 *   - dest 存在但 package.json#version 与 mirror 不一致 → rm dest 后重新复制
 *   - 版本一致 → 跳过（不覆盖用户手改）
 *
 * 失败语义：fire-and-forget。单个 plugin 失败 log + 继续，不阻断 gateway 启动。
 * 这样即便某次 reconcile 出错，用户已有的 channel 仍能继续工作。
 */

import * as fs from "fs";
import * as path from "path";
import {
  resolveExtensionsMirrorDir,
  resolveUserConfigPath,
  resolveUserExtensionsDir,
  resolveUserStateDir,
} from "./constants";
import * as log from "./logger";

/** 读取 `<dir>/package.json` 的 version 字段，失败返回 null */
function readPluginVersion(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    const v = pkg?.version;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * 读 `<dir>/package.json` 的 `openclaw.extensions[0]`。
 *
 * 这是 OneClaw 入口标准化（ensurePluginNativeEntry）在构建期改写的字段。
 * reconcile 时把它一起纳入"相等"判定——即便 plugin version 没变，只要 OneClaw
 * 改了 bundle 策略（如把 `.ts` 入口替换为 `./dist/oneclaw-bundle.mjs`），
 * dest 也会被强制刷新。
 */
function readPluginEntrySig(dir: string): string | null {
  try {
    const raw = fs.readFileSync(path.join(dir, "package.json"), "utf-8");
    const pkg = JSON.parse(raw);
    const exts = pkg?.openclaw?.extensions;
    if (Array.isArray(exts) && exts.length > 0 && typeof exts[0] === "string") {
      return exts[0];
    }
    return null;
  } catch {
    return null;
  }
}

/** 递归复制目录（保留文件权限），dest 已存在则覆盖各文件 */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else if (entry.isSymbolicLink()) {
      const real = fs.realpathSync(s);
      fs.copyFileSync(real, d);
      try { fs.chmodSync(d, fs.statSync(real).mode); } catch {}
    } else {
      fs.copyFileSync(s, d);
      try { fs.chmodSync(d, fs.statSync(s).mode); } catch {}
    }
  }
}

interface ReconcileOutcome {
  pluginId: string;
  action: "installed" | "upgraded" | "skipped" | "failed" | "removed";
  fromVersion?: string | null;
  toVersion?: string | null;
  error?: string;
}

// 曾经被 OneClaw mirror，但已经迁移到 openclaw 内置 vendor / bundled 路径的
// plugin id。旧用户的 ~/.openclaw/extensions/<id>/ 仍残留旧版本，与 openclaw
// stock / bundled 同时存在会触发 duplicate plugin id 警告，启动时静默删除一次
// 即可。
//
//   - qqbot：2026.4.5 起由 openclaw 官方 vendor，OneClaw 不再 ship
//   - dingtalk-connector：external-channel-loader 短暂放进过 mirror，
//     Windows 上 jiti register 重入导致 DWS clientId 互踢，已回滚到 bundled
//     路径（gateway.asar/.../dist/extensions/dingtalk-connector）走 shim。
const RETIRED_USER_PLUGIN_IDS: readonly string[] = ["qqbot", "dingtalk-connector"];

function removeRetiredOrphans(userDir: string): ReconcileOutcome[] {
  const outcomes: ReconcileOutcome[] = [];
  for (const id of RETIRED_USER_PLUGIN_IDS) {
    const orphan = path.join(userDir, id);
    if (!fs.existsSync(orphan)) continue;
    try {
      fs.rmSync(orphan, { recursive: true, force: true });
      outcomes.push({ pluginId: id, action: "removed" });
    } catch (err) {
      outcomes.push({ pluginId: id, action: "failed", error: (err as Error).message });
    }
  }
  return outcomes;
}

/** 同步单个 plugin（mirror → user dir） */
function reconcileOne(pluginId: string, mirrorDir: string, userDir: string): ReconcileOutcome {
  const src = path.join(mirrorDir, pluginId);
  const dest = path.join(userDir, pluginId);

  // mirror 必须存在 — 上层枚举的就是 mirror 子目录，理论上一定有；防御性检查
  if (!fs.existsSync(src)) {
    return { pluginId, action: "failed", error: `mirror source missing: ${src}` };
  }

  const mirrorVersion = readPluginVersion(src);
  const destExists = fs.existsSync(dest);
  const destVersion = destExists ? readPluginVersion(dest) : null;

  // 全新安装
  if (!destExists) {
    try {
      copyDirSync(src, dest);
      return { pluginId, action: "installed", toVersion: mirrorVersion };
    } catch (err) {
      return { pluginId, action: "failed", error: (err as Error).message };
    }
  }

  // 两个维度都相等才 skip：
  //   - 插件上游版本（pkg.version）
  //   - OneClaw 构建期重写的入口（pkg.openclaw.extensions[0]）
  // 后者是为了让 OneClaw 换 bundle 策略（比如把 `.ts` 入口替换成
  // `./dist/oneclaw-bundle.mjs`）能触发 reconcile，即使 plugin 版本没变。
  const mirrorSig = readPluginEntrySig(src);
  const destSig = readPluginEntrySig(dest);
  const versionMatch = !!mirrorVersion && !!destVersion && mirrorVersion === destVersion;
  const sigMatch = mirrorSig === destSig; // 两者都 null 也算 match（远古插件没这字段）
  if (versionMatch && sigMatch) {
    return { pluginId, action: "skipped", fromVersion: destVersion, toVersion: mirrorVersion };
  }

  // 版本或入口签名任一不同（或读不到） — 强制覆盖
  try {
    fs.rmSync(dest, { recursive: true, force: true });
    copyDirSync(src, dest);
    return { pluginId, action: "upgraded", fromVersion: destVersion, toVersion: mirrorVersion };
  } catch (err) {
    return { pluginId, action: "failed", error: (err as Error).message };
  }
}

/**
 * 应用启动时 reconcile 全部 mirror 中的 channel plugin 到用户目录。
 *
 * 调用时机：必须在 gateway 启动**之前**，保证 openclaw 第一次扫描 plugin 时
 * 看到的是已 reconcile 过的 `~/.openclaw/extensions/<id>/`。
 *
 * 失败语义：永远不抛。单个 plugin 失败 log + 继续，整体失败也吞掉，让上层正常启动。
 */
export async function reconcileExtensionsOnAppLaunch(): Promise<void> {
  const mirrorDir = resolveExtensionsMirrorDir();
  const userDir = resolveUserExtensionsDir();

  if (!fs.existsSync(mirrorDir)) {
    // dev 模式或异常打包可能没有 mirror。没有就什么都不做，不报错。
    log.info(`[ext-mirror] mirror dir absent, skipping reconcile: ${mirrorDir}`);
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(mirrorDir, { withFileTypes: true });
  } catch (err) {
    log.warn(`[ext-mirror] failed to read mirror dir: ${(err as Error).message}`);
    return;
  }

  fs.mkdirSync(userDir, { recursive: true });

  const outcomes: ReconcileOutcome[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    outcomes.push(reconcileOne(entry.name, mirrorDir, userDir));
  }
  outcomes.push(...removeRetiredOrphans(userDir));

  // 汇总日志：成功的精简一行，失败的单独 warn
  const summary = outcomes
    .filter((o) => o.action !== "failed")
    .map((o) => {
      if (o.action === "skipped") return `${o.pluginId}=skip(${o.toVersion ?? "?"})`;
      if (o.action === "upgraded") return `${o.pluginId}=${o.fromVersion ?? "?"}→${o.toVersion ?? "?"}`;
      if (o.action === "removed") return `${o.pluginId}=removed(retired)`;
      return `${o.pluginId}=install(${o.toVersion ?? "?"})`;
    })
    .join(" ");
  if (summary) log.info(`[ext-mirror] reconcile: ${summary}`);

  for (const o of outcomes) {
    if (o.action === "failed") {
      log.warn(`[ext-mirror] reconcile failed for ${o.pluginId}: ${o.error}`);
    }
  }

  // 把成功 reconcile 的 plugin id 注册到 plugins.allow。
  // openclaw 对未在 allow 列表里的 external plugin 走降级路径——只 call register、
  // 不跑 per-account channel lifecycle，导致 channel 能登录但永远不回消息。
  const trustedIds = outcomes
    .filter((o) => o.action === "installed" || o.action === "upgraded" || o.action === "skipped")
    .map((o) => o.pluginId);
  if (trustedIds.length > 0) {
    ensurePluginsAllow(trustedIds);
  }
}

/**
 * 确保 ~/.openclaw/openclaw.json 的 plugins.allow 包含给定的 plugin id 集合。
 *
 * 语义：union（不覆盖用户已加入 allow 的其他 id），atomic write（先写 .tmp 再 rename）。
 * 失败永远不抛——log warn 后继续，gateway 启动逻辑可以照常进行（只是这些 plugin
 * 会继续走降级路径）。
 *
 * 仅当确实有变化时才写盘——避免把"reconcile 一次就 bump 一次 mtime"加进重启风暴。
 */
function ensurePluginsAllow(pluginIds: readonly string[]): void {
  const configPath = resolveUserConfigPath();
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, "utf-8");
  } catch (err) {
    // 配置文件不存在（首次启动 setup 还没跑完）—— 跳过，不创建空配置
    log.info(`[ext-mirror] skip plugins.allow: config not present yet (${(err as Error).message})`);
    return;
  }

  let config: any;
  try {
    config = JSON.parse(raw);
  } catch (err) {
    log.warn(`[ext-mirror] skip plugins.allow: config not valid JSON (${(err as Error).message})`);
    return;
  }

  if (!config || typeof config !== "object") {
    log.warn(`[ext-mirror] skip plugins.allow: config root is not an object`);
    return;
  }

  const plugins = (config.plugins ??= {});
  const existingAllow: string[] = Array.isArray(plugins.allow) ? plugins.allow.slice() : [];
  const merged = new Set<string>(existingAllow);
  let added = 0;
  for (const id of pluginIds) {
    if (!merged.has(id)) {
      merged.add(id);
      added += 1;
    }
  }

  if (added === 0) return; // 已经全部在列，不写盘

  plugins.allow = Array.from(merged).sort();

  const tmpPath = `${configPath}.ext-mirror.tmp`;
  try {
    fs.mkdirSync(resolveUserStateDir(), { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2), { encoding: "utf-8", mode: 0o600 });
    fs.renameSync(tmpPath, configPath);
    log.info(`[ext-mirror] plugins.allow updated (+${added}): ${pluginIds.join(",")}`);
  } catch (err) {
    log.warn(`[ext-mirror] failed to persist plugins.allow: ${(err as Error).message}`);
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}
