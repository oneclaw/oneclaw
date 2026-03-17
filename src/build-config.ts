import * as fs from "fs";
import * as path from "path";
import { app } from "electron";
import { resolveResourcesPath } from "./constants";

const BUILD_CONFIG_NAME = "build-config.json";

// 缓存解析结果，避免重复读磁盘
let cached: Record<string, unknown> | null = null;

// 从打包注入的 build-config.json 读取全量配置
function readBuildConfig(): Record<string, unknown> {
  if (cached) return cached;

  const appPath = app.getAppPath();
  const appDir = path.dirname(appPath);
  const candidates = [
    path.join(resolveResourcesPath(), BUILD_CONFIG_NAME),
    path.join(process.resourcesPath, "resources", BUILD_CONFIG_NAME),
    path.join(process.resourcesPath, BUILD_CONFIG_NAME),
    path.join(appDir, "resources", BUILD_CONFIG_NAME),
    path.join(appDir, BUILD_CONFIG_NAME),
  ];

  for (const p of candidates) {
    try {
      const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (raw && typeof raw === "object") {
        cached = raw as Record<string, unknown>;
        return cached;
      }
    } catch {}
  }

  cached = {};
  return cached;
}

// 读取构建时注入的 ClawHub Registry URL
export function readBuildConfigClawhubRegistry(): string {
  const config = readBuildConfig();
  const val = config.clawhubRegistry;
  return typeof val === "string" ? val.trim() : "";
}
