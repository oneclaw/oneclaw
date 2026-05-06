import * as fs from "fs";
import {
  resolveWebbridgeCrxPath,
  readWebbridgeCrxMetadata,
} from "./constants";
import type { ExtensionSpec } from "./browser-extension-installer";

/**
 * 用 sidecar JSON（resources/webbridge/kimi-webbridge.json）+ CRX 文件组装完整 ExtensionSpec。
 * sidecar 是 extId / version 的唯一来源。
 * 任意一段缺失（CRX 没打包进来 / metadata JSON 损坏）→ 返回 null，
 * 调用方决定是降级 openclaw 还是保留现状。
 */
export function resolveWebbridgeExtensionSpec(): ExtensionSpec | null {
  const meta = readWebbridgeCrxMetadata();
  if (!meta) return null;

  const crxPath = resolveWebbridgeCrxPath();
  if (!fs.existsSync(crxPath)) return null;

  return { extId: meta.extensionId, crxPath, crxVersion: meta.version };
}
