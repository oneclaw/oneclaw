import { spawn } from "child_process";
import { resolveNodeBin, resolveGatewayEntry, resolveNodeExtraEnv } from "./constants";
import * as log from "./logger";

type CatalogInput = "text" | "text,image";

interface ModelCatalog {
  byKey: Map<string, CatalogInput>;
  byModelId: Map<string, CatalogInput>;
}

type CatalogRunResult = { stdout: string; stderr: string; code: number };
type CatalogLookupOptions = { allowModelIdFallback?: boolean };

// Windows 上 npm/node spawn 冷启动明显更慢（首次 catalog 拉取需要解 ASAR、加载
// gateway 依赖、读注册表），60s 偶发 TIMEOUT。其他平台维持 60s。
const CATALOG_TIMEOUT_MS = process.platform === "win32" ? 120_000 : 60_000;

function normalizeInput(raw: unknown): CatalogInput | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.replace(/\s+/g, "");
  if (trimmed === "text") return "text";
  if (
    trimmed === "text,image" || trimmed === "image,text" ||
    trimmed === "text+image" || trimmed === "image+text"
  ) return "text,image";
  return undefined;
}

export function parseCatalog(json: string): ModelCatalog {
  const root = JSON.parse(json) as { models?: unknown };
  const models = Array.isArray(root.models) ? root.models : [];
  const cat: ModelCatalog = { byKey: new Map(), byModelId: new Map() };
  const byModelIdKey = new Map<string, string>();
  const ambiguousModelIds = new Set<string>();
  for (const entry of models) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { key?: unknown; input?: unknown };
    if (typeof e.key !== "string") continue;
    const input = normalizeInput(e.input);
    if (!input) continue;
    cat.byKey.set(e.key, input);
    const slash = e.key.indexOf("/");
    if (slash >= 0) {
      const modelId = e.key.slice(slash + 1);
      if (!modelId || ambiguousModelIds.has(modelId)) continue;
      const existingKey = byModelIdKey.get(modelId);
      if (!existingKey || existingKey === e.key) {
        byModelIdKey.set(modelId, e.key);
        cat.byModelId.set(modelId, input);
      } else {
        cat.byModelId.delete(modelId);
        ambiguousModelIds.add(modelId);
      }
    }
  }
  return cat;
}

export function lookupInCatalog(
  cat: ModelCatalog,
  providerKey: string,
  modelId: string,
  options: CatalogLookupOptions = {},
): CatalogInput | undefined {
  const exact = cat.byKey.get(`${providerKey}/${modelId}`);
  if (exact) return exact;
  if (options.allowModelIdFallback === false) return undefined;
  return cat.byModelId.get(modelId);
}

function runCatalogCli(): Promise<CatalogRunResult> {
  return new Promise((resolve, reject) => {
    let nodeBin: string;
    let entry: string;
    try {
      nodeBin = resolveNodeBin();
      entry = resolveGatewayEntry();
    } catch (err) {
      reject(err);
      return;
    }
    const child = spawn(
      nodeBin,
      [entry, "models", "list", "--all", "--json"],
      { env: { ...process.env, ...resolveNodeExtraEnv() }, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finalize = (result: CatalogRunResult | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      finalize(new Error(`catalog spawn timed out after ${CATALOG_TIMEOUT_MS}ms`));
    }, CATALOG_TIMEOUT_MS);
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => finalize(err));
    child.on("close", (code) => finalize({ stdout, stderr, code: code ?? -1 }));
  });
}

let cachedCatalog: ModelCatalog | null = null;
let inflight: Promise<ModelCatalog | undefined> | null = null;

async function loadCatalogOnce(): Promise<ModelCatalog | undefined> {
  let run: CatalogRunResult;
  try {
    run = await runCatalogCli();
  } catch (err: any) {
    log.warn(`[model-catalog] spawn failed: ${err?.message ?? String(err)}`);
    return undefined;
  }
  if (run.code !== 0) {
    const tail = run.stderr.slice(0, 200).replace(/\s+/g, " ").trim();
    log.warn(`[model-catalog] exit code ${run.code}: ${tail || "<no stderr>"}`);
    return undefined;
  }
  try {
    return parseCatalog(run.stdout);
  } catch (err: any) {
    const head = run.stdout.slice(0, 200).replace(/\s+/g, " ").trim();
    log.warn(`[model-catalog] parse failed: ${err?.message ?? String(err)} | stdout=${head}`);
    return undefined;
  }
}

export async function lookupModelInput(
  providerKey: string,
  modelId: string,
  options: CatalogLookupOptions = {},
): Promise<CatalogInput | undefined> {
  if (!cachedCatalog) {
    if (!inflight) {
      inflight = loadCatalogOnce().finally(() => { inflight = null; });
    }
    const loaded = await inflight;
    if (!loaded) return undefined;
    cachedCatalog = loaded;
  }
  return lookupInCatalog(cachedCatalog, providerKey, modelId, options);
}
