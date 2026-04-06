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

// openclaw 的 providerKey 可能跟 OneClaw 的 CUSTOM_PROVIDER_PRESETS.providerKey 不完全一致。
// 这张表把 OneClaw 的 key 映射到 openclaw catalog 里实际使用的 key。
const PROVIDER_KEY_ALIASES: Record<string, string> = {
  "zai-global": "zai",
  "zai-cn": "zai",
  "zai-cn-coding": "zai",
};

function normalizeProviderKey(key: string): string {
  return PROVIDER_KEY_ALIASES[key] || key;
}

/**
 * 调用 openclaw CLI 加载全量模型目录，缓存到内存。
 * 启动期后台调用，不阻塞主流程。失败时 catalog 保持 null（lookup 返回 undefined）。
 */
export async function loadModelCatalog(): Promise<void> {
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
          if (err) return reject(err);
          resolve(stdout);
        },
      );
    });

    const parsed = JSON.parse(stdout);
    const map = new Map<string, CatalogEntry>();
    const byModelId = new Map<string, CatalogEntry>();
    for (const m of parsed.models ?? []) {
      const key: string = m.key;  // "minimax/MiniMax-M2.5"
      const modelId = key.includes("/") ? key.slice(key.indexOf("/") + 1) : key;
      const inputStr: string = m.input ?? "text";
      const input = inputStr.includes("image") ? ["text", "image"] : ["text"];
      const entry: CatalogEntry = { input, name: m.name, contextWindow: m.contextWindow };
      map.set(key, entry);
      // 同一 modelId 首次出现的 provider 作为 fallback（802 模型仅 1 例 conflict）
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
 * 查询模型的 input 能力。
 * 优先按 provider/modelId 精确匹配；未命中时按 modelId 跨 provider fallback。
 * 同一物理模型经不同 provider 路由（如 volcengine-coding 代理 MiniMax-M2.5），
 * 图片能力由模型本身决定，不随 provider 变化。
 * @returns ["text"] / ["text","image"] — 命中目录时返回权威值
 *          undefined — 未加载或未命中（调用方自行决定 fallback）
 */
export function getModelInput(providerKey: string, modelId: string): string[] | undefined {
  if (!catalog) return undefined;
  const normalizedKey = normalizeProviderKey(providerKey);
  // 精确匹配 provider/modelId
  const exact = catalog.get(`${normalizedKey}/${modelId}`);
  if (exact) return exact.input;
  // 跨 provider fallback：仅按 modelId 查询
  return catalogByModelId?.get(modelId)?.input;
}
