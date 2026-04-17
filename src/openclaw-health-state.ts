import * as fs from "fs";
import * as path from "path";
import { resolveUserStateDir, resolveUserConfigPath } from "./constants";

// openclaw 4.x 的 config observer 在每次读 openclaw.json 时会做健康体检：
//   1) 先看 config-health.json 里的 lastKnownGood；若不存在则 fallback 去读
//      同目录下的 openclaw.json.bak（见 openclaw dist/io-*.js: `${configPath}.bak`）。
//   2) 用 baseline 与当前 cfg 做 size-drop / hash-mismatch 等判定，若 suspicious
//      则落一份 .clobbered.* 快照，并尝试从 .bak copy 回来。
// 当 OneClaw 主进程绕过 openclaw 直写 openclaw.json 时：
//   - config-health.json 的 lastKnownGood 仍停留在旧字节数；
//   - openclaw.json.bak 也还是旧快照（可能差 ~8KB）。
// 于是每次 gateway 读配置都会判定 size-drop → dump 一份 clobbered → I/O 雪崩。
//
// 修复：OneClaw 每次直写 openclaw.json 后，做两件事（顺序无关）：
//   1) 同步用同样字节覆盖 openclaw.json.bak —— 这样无论 openclaw 走哪条 baseline
//      fallback，对比都不会 size-drop；
//   2) 删除 config-health.json 里该路径的 entry，让 openclaw 下次 read 时重建
//      lastKnownGood。第 2 步是防御，真正的关键是第 1 步。

const HEALTH_STATE_FILENAME = "config-health.json";

export function resolveOpenClawConfigHealthPath(): string {
  return path.join(resolveUserStateDir(), "logs", HEALTH_STATE_FILENAME);
}

// 把 path 字符串规范化以便与 openclaw 写入的 key 匹配（Windows 反斜杠、相对/绝对、大小写）
function normalizeForCompare(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

/**
 * 移除 openclaw config-health.json 中指定 config 文件的 baseline entry。
 * 失败安静吞掉——本函数仅作 best-effort cleanup，不能影响主写入流程。
 */
export function resetConfigHealthBaseline(configPath: string = resolveUserConfigPath()): void {
  const healthPath = resolveOpenClawConfigHealthPath();
  let raw: string;
  try {
    raw = fs.readFileSync(healthPath, "utf-8");
  } catch {
    return; // 文件不存在等
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // JSON 损坏：留给 openclaw 自己处理
  }

  const entries = parsed?.entries;
  if (!entries || typeof entries !== "object") return;

  const target = normalizeForCompare(configPath);
  let mutated = false;
  for (const key of Object.keys(entries)) {
    if (normalizeForCompare(key) === target) {
      delete entries[key];
      mutated = true;
    }
  }
  if (!mutated) return;

  try {
    fs.writeFileSync(healthPath, JSON.stringify(parsed, null, 2).concat("\n"), "utf-8");
  } catch {
    // 写不回去也算了，下次会再尝试
  }
}

/**
 * 把 openclaw.json 的当前内容同步到 openclaw.json.bak。
 *
 * openclaw 的 config observer 在 config-health.json 没有 lastKnownGood 时会
 * fallback 读取 `${configPath}.bak` 作为健康基线。若 .bak 与 cfg 字节不一致，
 * openclaw 就会判为 suspicious 并生成 .clobbered.* 快照。
 *
 * 这里用 copyFileSync 保证字节级一致（而不是重新 stringify），避免空白 / 换行差异。
 * 失败静默吞掉——本函数仅作 best-effort，不能影响主写入流程。
 */
export function syncOpenClawBackupFile(configPath: string = resolveUserConfigPath()): void {
  const backupPath = `${configPath}.bak`;
  try {
    fs.copyFileSync(configPath, backupPath);
  } catch {
    // 源文件不存在或目标不可写：交给 openclaw 自己去处理
  }
}

/**
 * OneClaw 直写 openclaw.json 后统一调用。合并 .bak 同步 + health-state 清理两步。
 */
export function syncOpenClawStateAfterWrite(configPath: string = resolveUserConfigPath()): void {
  syncOpenClawBackupFile(configPath);
  resetConfigHealthBaseline(configPath);
}
