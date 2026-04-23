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
import { resolveExtensionsMirrorDir, resolveUserExtensionsDir } from "./constants";
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
  action: "installed" | "upgraded" | "skipped" | "failed";
  fromVersion?: string | null;
  toVersion?: string | null;
  error?: string;
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

  // 版本一致 — 跳过（不覆盖用户手改）
  if (mirrorVersion && destVersion && mirrorVersion === destVersion) {
    return { pluginId, action: "skipped", fromVersion: destVersion, toVersion: mirrorVersion };
  }

  // 版本变化或读不到版本 — 强制覆盖
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

  // 汇总日志：成功的精简一行，失败的单独 warn
  const summary = outcomes
    .filter((o) => o.action !== "failed")
    .map((o) => {
      if (o.action === "skipped") return `${o.pluginId}=skip(${o.toVersion ?? "?"})`;
      if (o.action === "upgraded") return `${o.pluginId}=${o.fromVersion ?? "?"}→${o.toVersion ?? "?"}`;
      return `${o.pluginId}=install(${o.toVersion ?? "?"})`;
    })
    .join(" ");
  if (summary) log.info(`[ext-mirror] reconcile: ${summary}`);

  for (const o of outcomes) {
    if (o.action === "failed") {
      log.warn(`[ext-mirror] reconcile failed for ${o.pluginId}: ${o.error}`);
    }
  }
}
