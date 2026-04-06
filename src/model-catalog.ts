// 模型能力目录 — 从 openclaw 的 `models list --all --json` 缓存权威数据。
// Setup / Settings 保存时通过 getModelInput() 查询，避免硬编码 input 字段。

import { execFile } from "child_process";
import { resolveNodeBin, resolveGatewayEntry, resolveNodeExtraEnv } from "./constants";
import * as log from "./logger";

interface CatalogEntry {
  input: string[];   // ["text"] or ["text", "image"]
  name: string;
  contextWindow?: number;
}

// provider/modelId → CatalogEntry
let catalog: Map<string, CatalogEntry> | null = null;
// modelId → CatalogEntry（跨 provider fallback：同一物理模型经不同 provider 路由时能力不变）
let catalogByModelId: Map<string, CatalogEntry> | null = null;
// 存储 loading Promise，使 ensureCatalogLoaded() 可以 await 进行中的加载
let catalogLoadPromise: Promise<void> | null = null;

// OneClaw 的 providerKey 到 openclaw catalog key 的映射
const PROVIDER_KEY_ALIASES: Record<string, string> = {
  "zai-global": "zai",
  "zai-cn": "zai",
  "zai-cn-coding": "zai",
  "minimax-cn": "minimax",
  "volcengine-coding": "volcengine",
  "qwen-coding": "qwen",
  "kimi-coding": "moonshot",
};

function normalizeProviderKey(key: string): string {
  return PROVIDER_KEY_ALIASES[key] || key;
}

async function doLoad(): Promise<void> {
  try {
    const nodeBin = resolveNodeBin();
    const entry = resolveGatewayEntry();
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        nodeBin,
        [entry, "models", "list", "--all", "--json"],
        {
          env: { ...process.env, ...resolveNodeExtraEnv(), OPENCLAW_NO_RESPAWN: "1" },
          maxBuffer: 4_000_000,
          timeout: 30_000,
        },
        (err, stdout, stderr) => {
          if (err) {
            if (stderr) log.error(`[model-catalog] stderr: ${stderr.slice(0, 500)}`);
            return reject(err);
          }
          resolve(stdout);
        },
      );
    });

    const parsed = JSON.parse(stdout);
    if (!parsed.models || !Array.isArray(parsed.models)) {
      log.warn("[model-catalog] response missing models array");
      return;
    }
    const map = new Map<string, CatalogEntry>();
    const byModelId = new Map<string, CatalogEntry>();
    for (const m of parsed.models) {
      const key: string = m.key;  // "minimax/MiniMax-M2.5"
      const modelId = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
      const inputStr: string = m.input ?? "text";
      const input = inputStr.includes("image") ? ["text", "image"] : ["text"];
      const entry: CatalogEntry = { input, name: m.name, contextWindow: m.contextWindow };
      map.set(key, entry);
      if (!byModelId.has(modelId)) byModelId.set(modelId, entry);
    }
    catalog = map;
    catalogByModelId = byModelId;
    log.info(`[model-catalog] loaded ${map.size} models (${byModelId.size} unique)`);
  } catch (err: any) {
    log.error(`[model-catalog] load failed: ${err?.message ?? err}`);
    // catalog stays null → getModelInput() returns undefined → callers fall back
  }
}

/**
 * 启动模型目录加载。存储 Promise 使 ensureCatalogLoaded() 可以 await。
 */
export function loadModelCatalog(): Promise<void> {
  catalogLoadPromise = doLoad();
  return catalogLoadPromise;
}

/**
 * 等待进行中的 catalog 加载完成。如果已加载则立即返回。
 * verifyProvider 在验证成功后调用此方法，确保返回 supportsImage 前 catalog 已就绪。
 */
export async function ensureCatalogLoaded(): Promise<void> {
  if (catalog) return;
  if (catalogLoadPromise) return catalogLoadPromise;
}

/**
 * 仅在 catalog 为 null 时重新加载。gateway ready 后调用。
 */
export function reloadModelCatalog(): void {
  if (!catalog) loadModelCatalog().catch(() => {});
}

/**
 * 查询模型的 input 能力。
 * 优先按 provider/modelId 精确匹配；未命中时按 modelId 跨 provider fallback。
 */
export function getModelInput(providerKey: string, modelId: string): string[] | undefined {
  if (!catalog) return undefined;
  const normalizedKey = normalizeProviderKey(providerKey);
  const exact = catalog.get(`${normalizedKey}/${modelId}`);
  if (exact) return exact.input;
  return catalogByModelId?.get(modelId)?.input;
}
