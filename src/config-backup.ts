import * as fs from "fs";
import * as path from "path";
import {
  resolveConfigBackupDir,
  resolveLastKnownGoodConfigPath,
  resolveUserConfigPath,
  resolveUserStateDir,
} from "./constants";

const BACKUP_FILE_PREFIX = "openclaw-";
const BACKUP_FILE_EXT = ".json";
const MAX_BACKUP_FILES = 60;

export interface ConfigBackupItem {
  fileName: string;
  createdAt: string;
  size: number;
}

export interface ConfigRecoveryData {
  configPath: string;
  backupDir: string;
  lastKnownGoodPath: string;
  hasLastKnownGood: boolean;
  lastKnownGoodUpdatedAt: string | null;
  backups: ConfigBackupItem[];
}

export interface UserConfigHealth {
  exists: boolean;
  validJson: boolean;
  parseError?: string;
}

// 检查当前 openclaw.json 的可解析性，供启动前诊断使用。
export function inspectUserConfigHealth(): UserConfigHealth {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return { exists: false, validJson: false };

  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    JSON.parse(raw);
    return { exists: true, validJson: true };
  } catch (err: any) {
    return {
      exists: true,
      validJson: false,
      parseError: err?.message ?? "JSON parse failed",
    };
  }
}

// 在覆盖写入配置前自动备份当前文件（仅备份可解析 JSON）。
export function backupCurrentUserConfig(): void {
  const configPath = resolveUserConfigPath();
  const raw = readValidConfigRaw(configPath);
  if (!raw) return;

  const backupDir = ensureBackupDir();
  const fileName = buildBackupFileName(backupDir);
  fs.writeFileSync(path.join(backupDir, fileName), raw, "utf-8");
  pruneOldBackups(backupDir);
}

// 列出历史备份，按时间倒序返回，供设置页恢复 UI 展示。
export function listUserConfigBackups(): ConfigBackupItem[] {
  const backupDir = resolveConfigBackupDir();
  if (!fs.existsSync(backupDir)) return [];

  const files = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isBackupFileName(entry.name))
    .map((entry) => entry.name);

  const items = files
    .map((fileName) => {
      const abs = path.join(backupDir, fileName);
      const stat = fs.statSync(abs);
      return {
        fileName,
        createdAt: stat.mtime.toISOString(),
        size: stat.size,
      } satisfies ConfigBackupItem;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return items;
}

// 恢复指定备份到 openclaw.json，恢复前先备份当前可解析配置以便回滚。
export function restoreUserConfigBackup(fileName: string): void {
  if (!isBackupFileName(fileName)) {
    throw new Error("非法备份文件名");
  }

  const backupPath = path.join(resolveConfigBackupDir(), fileName);
  if (!fs.existsSync(backupPath)) {
    throw new Error("备份文件不存在");
  }

  const raw = readValidConfigRaw(backupPath);
  if (!raw) {
    throw new Error("备份文件不是有效 JSON");
  }

  backupCurrentUserConfig();
  writeConfigRaw(raw);
}

// 记录“最近一次可启动”的配置快照，供启动失败时一键回退。
export function recordLastKnownGoodConfigSnapshot(): void {
  const configPath = resolveUserConfigPath();
  const raw = readValidConfigRaw(configPath);
  if (!raw) return;

  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const snapshotPath = resolveLastKnownGoodConfigPath();

  if (fs.existsSync(snapshotPath)) {
    try {
      const prevRaw = fs.readFileSync(snapshotPath, "utf-8");
      if (prevRaw === raw) return;
    } catch {
      // ignore
    }
  }

  fs.writeFileSync(snapshotPath, raw, "utf-8");
}

// 一键恢复“最近一次可启动”快照，恢复前同样备份当前配置。
export function restoreLastKnownGoodConfigSnapshot(): void {
  const snapshotPath = resolveLastKnownGoodConfigPath();
  if (!fs.existsSync(snapshotPath)) {
    throw new Error("没有可用的最近成功快照");
  }

  const raw = readValidConfigRaw(snapshotPath);
  if (!raw) {
    throw new Error("最近成功快照损坏");
  }

  backupCurrentUserConfig();
  writeConfigRaw(raw);
}

// 汇总恢复页面需要的元信息，减少渲染进程重复拼接逻辑。
export function getConfigRecoveryData(): ConfigRecoveryData {
  const lastKnownGoodPath = resolveLastKnownGoodConfigPath();
  let lastKnownGoodUpdatedAt: string | null = null;

  if (fs.existsSync(lastKnownGoodPath)) {
    try {
      lastKnownGoodUpdatedAt = fs.statSync(lastKnownGoodPath).mtime.toISOString();
    } catch {
      lastKnownGoodUpdatedAt = null;
    }
  }

  return {
    configPath: resolveUserConfigPath(),
    backupDir: resolveConfigBackupDir(),
    lastKnownGoodPath,
    hasLastKnownGood: fs.existsSync(lastKnownGoodPath),
    lastKnownGoodUpdatedAt,
    backups: listUserConfigBackups(),
  };
}

// 读取并校验 JSON，失败时返回空，避免把损坏配置写入备份链路。
function readValidConfigRaw(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    JSON.parse(raw);
    return raw;
  } catch {
    return null;
  }
}

// 统一写入 openclaw.json，保持恢复路径和正常保存路径行为一致。
function writeConfigRaw(raw: string): void {
  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(resolveUserConfigPath(), raw, "utf-8");
}

// 确保备份目录存在，避免首次保存时写文件失败。
function ensureBackupDir(): string {
  const backupDir = resolveConfigBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

// 生成秒级时间戳文件名；同秒多次保存时自动追加两位序号防冲突。
function buildBackupFileName(backupDir: string): string {
  const stamp = formatTimestamp(new Date());
  const base = `${BACKUP_FILE_PREFIX}${stamp}`;
  const primary = `${base}${BACKUP_FILE_EXT}`;
  if (!fs.existsSync(path.join(backupDir, primary))) return primary;

  for (let i = 1; i < 100; i++) {
    const suffix = String(i).padStart(2, "0");
    const candidate = `${base}-${suffix}${BACKUP_FILE_EXT}`;
    if (!fs.existsSync(path.join(backupDir, candidate))) return candidate;
  }

  return `${base}-${Date.now()}${BACKUP_FILE_EXT}`;
}

// 统一校验备份文件名，阻断路径穿越与非备份文件访问。
function isBackupFileName(fileName: string): boolean {
  return /^openclaw-\d{8}-\d{6}(?:-\d{2}|\-\d{13})?\.json$/.test(fileName);
}

// 将 Date 格式化为 YYYYMMDD-HHMMSS，满足“日期+秒”命名规则。
function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}

// 限制备份数量，避免长期运行下无上限增长占满用户磁盘。
function pruneOldBackups(backupDir: string): void {
  const files = fs
    .readdirSync(backupDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isBackupFileName(entry.name))
    .map((entry) => entry.name);

  if (files.length <= MAX_BACKUP_FILES) return;

  const sorted = files
    .map((fileName) => {
      const abs = path.join(backupDir, fileName);
      const mtimeMs = fs.statSync(abs).mtimeMs;
      return { fileName, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  const toDelete = sorted.slice(MAX_BACKUP_FILES);
  for (const item of toDelete) {
    try {
      fs.unlinkSync(path.join(backupDir, item.fileName));
    } catch {
      // ignore
    }
  }
}
