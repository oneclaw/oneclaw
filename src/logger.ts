import * as fs from "fs";
import * as path from "path";
import { resolveUserStateDir } from "./constants";

// 应用日志（固定写入 ~/.openclaw/app.log）
const LOG_PATH = path.join(resolveUserStateDir(), "app.log");

// 日志上限 5MB，启动时截断
const MAX_LOG_SIZE = 5 * 1024 * 1024;

try {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > MAX_LOG_SIZE) {
    fs.writeFileSync(LOG_PATH, "[truncated]\n");
  }
} catch {}

// 写一行日志到文件 + console 镜像
function write(level: string, msg: string): void {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`;
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, line);
  } catch {}

  if (level === "ERROR") {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }
}

export function info(msg: string): void { write("INFO", msg); }
export function warn(msg: string): void { write("WARN", msg); }
export function error(msg: string): void { write("ERROR", msg); }
