import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { resolveUserStateDir, resolveUserConfigPath } from "./constants";

// ── 类型定义 ──

export interface OneclawConfig {
  deviceId: string;
  setupCompletedAt?: string;
  cliPreference?: "installed" | "uninstalled";
  skillStore?: {
    registryUrl?: string;
  };
}

// 四种归属状态
export type OwnershipState =
  | "oneclaw"
  | "legacy-oneclaw"
  | "external-openclaw"
  | "fresh";

// ── 路径 ──

// OneClaw 专属配置文件路径
export function resolveOneclawConfigPath(): string {
  return path.join(resolveUserStateDir(), "oneclaw.config.json");
}

// legacy .device-id 文件路径
function resolveDeviceIdPath(): string {
  return path.join(resolveUserStateDir(), ".device-id");
}

// legacy skill-store.json 文件路径
function resolveSkillStoreConfigPath(): string {
  return path.join(resolveUserStateDir(), "skill-store.json");
}

// ── 读写 ──

// 读取 OneClaw 专属配置，不存在或解析失败返回 null
export function readOneclawConfig(): OneclawConfig | null {
  try {
    const raw = fs.readFileSync(resolveOneclawConfigPath(), "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.deviceId) return null;
    return parsed as OneclawConfig;
  } catch {
    return null;
  }
}

// 写入 OneClaw 专属配置
export function writeOneclawConfig(config: OneclawConfig): void {
  const dir = resolveUserStateDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    resolveOneclawConfigPath(),
    JSON.stringify(config, null, 2) + "\n",
    "utf-8",
  );
}

// ── 归属检测 ──

// 判定当前 ~/.openclaw/ 目录的归属状态
export function detectOwnership(): OwnershipState {
  const oneclawConfig = readOneclawConfig();
  if (oneclawConfig?.setupCompletedAt) return "oneclaw";

  const deviceIdExists = fs.existsSync(resolveDeviceIdPath());
  if (deviceIdExists) return "legacy-oneclaw";

  const openclawJsonExists = fs.existsSync(resolveUserConfigPath());
  if (openclawJsonExists) return "external-openclaw";

  return "fresh";
}

// ── 迁移 ──

// 从 legacy 文件迁移到 oneclaw.config.json（老 OneClaw 用户升级）
export function migrateFromLegacy(): OneclawConfig {
  // 读取 .device-id
  let deviceId = "";
  const deviceIdPath = resolveDeviceIdPath();
  try {
    deviceId = fs.readFileSync(deviceIdPath, "utf-8").trim();
  } catch {}
  if (!deviceId) deviceId = crypto.randomUUID();

  // 读取 wizard.lastRunAt
  let setupCompletedAt: string | undefined;
  try {
    const raw = fs.readFileSync(resolveUserConfigPath(), "utf-8");
    const config = JSON.parse(raw);
    if (config?.wizard?.lastRunAt) {
      setupCompletedAt = config.wizard.lastRunAt;
    }
  } catch {}

  // 读取 skill-store.json
  let skillStore: OneclawConfig["skillStore"];
  const skillStorePath = resolveSkillStoreConfigPath();
  try {
    const raw = JSON.parse(fs.readFileSync(skillStorePath, "utf-8"));
    if (raw?.registryUrl) {
      skillStore = { registryUrl: raw.registryUrl };
    }
  } catch {}

  const config: OneclawConfig = { deviceId, setupCompletedAt, skillStore };
  writeOneclawConfig(config);
  return config;
}

// ── 便捷方法 ──

// 标记 Setup 完成（写入 setupCompletedAt 到 oneclaw.config.json）
export function markSetupComplete(): void {
  let config = readOneclawConfig();
  if (!config) {
    config = { deviceId: crypto.randomUUID() };
  }
  config.setupCompletedAt = new Date().toISOString();
  writeOneclawConfig(config);
}

// 确保 deviceId 存在（analytics 初始化时调用）
export function ensureDeviceId(): string {
  let config = readOneclawConfig();
  if (config?.deviceId) return config.deviceId;

  // 兼容 legacy .device-id
  const legacyPath = resolveDeviceIdPath();
  let deviceId = "";
  try {
    deviceId = fs.readFileSync(legacyPath, "utf-8").trim();
  } catch {}
  if (!deviceId) deviceId = crypto.randomUUID();

  if (!config) {
    config = { deviceId };
  } else {
    config.deviceId = deviceId;
  }
  writeOneclawConfig(config);
  return deviceId;
}
