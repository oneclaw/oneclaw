import * as fs from "node:fs";
import * as path from "node:path";

const DEFAULT_PAIRING_ACCOUNT_ID = "default";

// 统一规整 allowFrom 条目，过滤空值并去重。
function normalizeAllowFromEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean),
    ),
  );
}

// 当前 openclaw 的默认账号会写进 `<channel>-default-allowFrom.json`，旧版本则写 legacy 文件名。
function resolveAllowFromStorePaths(credentialsDir: string, channel: string): string[] {
  const safeChannel = String(channel ?? "").trim().toLowerCase();
  return [
    path.join(credentialsDir, `${safeChannel}-${DEFAULT_PAIRING_ACCOUNT_ID}-allowFrom.json`),
    path.join(credentialsDir, `${safeChannel}-allowFrom.json`),
  ];
}

// 读取单个 allowFrom store 文件，失败时按空数组处理，避免把 UI 直接打爆。
function readSingleAllowFromStore(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeAllowFromEntries(parsed?.allowFrom);
  } catch {
    return [];
  }
}

// 统一读取某个渠道的 allowFrom store，并兼容 default 账号作用域与旧路径。
export function readChannelAllowFromStoreEntries(credentialsDir: string, channel: string): string[] {
  const collected: string[] = [];
  for (const filePath of resolveAllowFromStorePaths(credentialsDir, channel)) {
    collected.push(...readSingleAllowFromStore(filePath));
  }
  return Array.from(new Set(collected));
}

// 写入 allowFrom store 时优先落到 default 账号作用域文件，同时清理 legacy 重复状态。
export function writeChannelAllowFromStoreEntries(
  credentialsDir: string,
  channel: string,
  entries: string[],
): void {
  const normalized = normalizeAllowFromEntries(entries);
  const [defaultPath, legacyPath] = resolveAllowFromStorePaths(credentialsDir, channel);

  if (normalized.length === 0) {
    for (const filePath of [defaultPath, legacyPath]) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
    return;
  }

  fs.mkdirSync(credentialsDir, { recursive: true });
  const payload = {
    channel: String(channel ?? "").trim().toLowerCase(),
    allowFrom: normalized,
  };
  fs.writeFileSync(defaultPath, JSON.stringify(payload, null, 2), "utf-8");
  if (fs.existsSync(legacyPath)) {
    fs.unlinkSync(legacyPath);
  }
}
