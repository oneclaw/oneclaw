import * as fs from "fs";
import * as path from "path";
import { resolveUserStateDir, resolveUserConfigPath } from "./constants";

// openclaw 4.x 把 config 健康基线持久化到 ~/.openclaw/logs/config-health.json。
// 当 OneClaw 主进程绕过 openclaw 直写 openclaw.json 时，这里的 baseline 会与
// 新文件大小不一致，触发 size-drop-vs-last-good 误报，每次读 config 都会 dump
// 一份 .clobbered 快照并刷新 health state，造成 I/O 雪崩。
//
// 修复：每次 OneClaw 直写 openclaw.json 后，把 health-state 中对应路径的 entry
// 抹掉，让 openclaw 下次读取时把当前文件视为合法 baseline 重新学习。

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
