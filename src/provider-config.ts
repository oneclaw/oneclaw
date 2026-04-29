import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { resolveUserConfigPath, resolveUserStateDir } from "./constants";
import { syncOpenClawStateAfterWrite } from "./openclaw-health-state";
import { backupCurrentUserConfig } from "./config-backup";

// ── Provider 配置预设（与 kimiclaw ProviderSetupView.swift 对齐） ──

export interface ProviderPreset {
  baseUrl: string;
  api: string;
}

export const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: { baseUrl: "https://api.anthropic.com/v1", api: "anthropic-messages" },
  openai: { baseUrl: "https://api.openai.com/v1", api: "openai-completions" },
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta", api: "google-generative-ai" },
};

// Moonshot 三个子平台配置
export const MOONSHOT_SUB_PLATFORMS: Record<string, { baseUrl: string; api: string; providerKey: string }> = {
  "moonshot-cn": { baseUrl: "https://api.moonshot.cn/v1", api: "openai-completions", providerKey: "moonshot" },
  "moonshot-ai": { baseUrl: "https://api.moonshot.ai/v1", api: "openai-completions", providerKey: "moonshot" },
  "kimi-code": { baseUrl: "https://api.kimi.com/coding", api: "anthropic-messages", providerKey: "kimi-coding" },
};

// Custom tab 内置预设（国产 provider 快捷配置）
export interface CustomProviderPreset extends ProviderPreset {
  providerKey: string;
  placeholder: string;
  models: string[];
}

export const CUSTOM_PROVIDER_PRESETS: Record<string, CustomProviderPreset> = {
  "minimax": {
    providerKey: "minimax",
    baseUrl: "https://api.minimax.io/anthropic",
    api: "anthropic-messages",
    placeholder: "eyJ...",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
  },
  "minimax-cn": {
    providerKey: "minimax-cn",
    baseUrl: "https://api.minimaxi.com/anthropic",
    api: "anthropic-messages",
    placeholder: "eyJ...",
    models: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
  },
  "zai-global": {
    providerKey: "zai-global",
    baseUrl: "https://api.z.ai/api/paas/v4",
    api: "openai-completions",
    placeholder: "...",
    models: ["glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  "zai-cn": {
    providerKey: "zai-cn",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    api: "openai-completions",
    placeholder: "...",
    models: ["glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  "zai-cn-coding": {
    providerKey: "zai-cn-coding",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    api: "openai-completions",
    placeholder: "...",
    models: ["glm-5.1", "glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  "volcengine": {
    providerKey: "volcengine",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    api: "openai-completions",
    placeholder: "...",
    models: ["doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-2.0-code", "doubao-seed-code"],
  },
  "volcengine-coding": {
    providerKey: "volcengine-coding",
    baseUrl: "https://ark.cn-beijing.volces.com/api/coding",
    api: "anthropic-messages",
    placeholder: "...",
    models: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-code", "minimax-m2.7", "glm-5.1", "deepseek-v3.2", "kimi-k2.6", "ark-code-latest"],
  },
  "qwen": {
    providerKey: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api: "openai-completions",
    placeholder: "sk-...",
    models: ["qwen3.6-max-preview", "qwen3.6-plus", "qwen-coder-plus-latest", "qwen-plus-latest", "qwen-max-latest", "qwen-turbo-latest"],
  },
  "qwen-coding": {
    providerKey: "qwen-coding",
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
    api: "openai-completions",
    placeholder: "sk-sp-...",
    models: ["qwen3.6-plus", "qwen3.5-plus", "kimi-k2.6", "glm-5.1", "MiniMax-M2.7"],
  },
  "deepseek": {
    providerKey: "deepseek",
    baseUrl: "https://api.deepseek.com",
    api: "openai-completions",
    placeholder: "sk-...",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
};

// 手动 custom provider：从 baseURL 确定性派生唯一 configKey
// 同一 URL 永远产生同一 key，不同 URL 产生不同 key
export function deriveCustomConfigKey(baseURL: string): string {
  try {
    const u = new URL(baseURL);
    const slug = (u.host + u.pathname)
      .replace(/\/+$/, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return slug ? `custom-${slug}` : "custom";
  } catch {
    return "custom";
  }
}

// ── 构建 Provider 配置对象 ──

export function buildProviderConfig(
  provider: string,
  apiKey: string,
  modelID: string,
  baseURL?: string,
  api?: string,
  supportImage?: boolean,
  customPreset?: string
): Record<string, unknown> {
  const preset = PROVIDER_PRESETS[provider];

  // 预设 provider（Anthropic/OpenAI/Google）一律声明图片能力
  if (preset) {
    return {
      apiKey,
      baseUrl: preset.baseUrl,
      api: preset.api,
      models: [{ id: modelID, name: modelID, input: ["text", "image"] }],
    };
  }

  // Custom 内置预设命中时，使用预设的 baseUrl 和 api（前端传了 baseURL 时优先用前端值）
  const customPre = customPreset ? CUSTOM_PROVIDER_PRESETS[customPreset] : undefined;
  if (customPre) {
    return {
      apiKey,
      baseUrl: baseURL || customPre.baseUrl,
      api: customPre.api,
      models: [{ id: modelID, name: modelID, input: ["text", "image"] }],
    };
  }

  // Custom provider — 根据用户勾选决定是否声明图片能力
  const input = supportImage !== false ? ["text", "image"] : ["text"];
  return {
    apiKey,
    baseUrl: baseURL,
    api: api || "openai-completions",
    models: [{ id: modelID, name: modelID, input }],
  };
}

// ── Moonshot 子平台配置写入 ──

export function saveMoonshotConfig(
  config: any,
  apiKey: string,
  modelID: string,
  subPlatform: string
): void {
  const sub = MOONSHOT_SUB_PLATFORMS[subPlatform] || MOONSHOT_SUB_PLATFORMS["moonshot-cn"];
  const providerKey = sub.providerKey;

  // 所有子平台统一写法：apiKey + baseUrl + api + models 写入 providers
  config.models.providers[providerKey] = {
    apiKey,
    baseUrl: sub.baseUrl,
    api: sub.api,
    models: [{ id: modelID, name: modelID, input: ["text", "image"], reasoning: true }],
  };

  config.agents.defaults.model.primary = `${providerKey}/${modelID}`;
}

// 镜像 openclaw 的 normalizeProviderId（provider-id-CUjr7KCR.js）。
// openclaw 把 cfg.models.providers 写入 models.json 时保留原始 key，但
// pdf tool 解析 ref 时会先 normalizeProviderId 再 registry.find —— 写入键和
// 查询键不一致导致 "Unknown model"（例如 kimi-coding → 归一化为 kimi → 查不到）。
export function normalizeProviderId(provider: string): string {
  const n = provider.trim().toLowerCase();
  if (n === "modelstudio" || n === "qwencloud") return "qwen";
  if (n === "z.ai" || n === "z-ai") return "zai";
  if (n === "opencode-zen") return "opencode";
  if (n === "opencode-go-auth") return "opencode-go";
  if (n === "kimi" || n === "kimi-code" || n === "kimi-coding") return "kimi";
  if (n === "bedrock" || n === "aws-bedrock") return "amazon-bedrock";
  if (n === "bytedance" || n === "doubao") return "volcengine";
  return n;
}

// 旧版曾把这个标记写进 openclaw.json，但 openclaw 2026.4.x provider schema 是 strict 的，
// 会直接拒绝未知字段。保留常量只用于清理遗留配置，不再写入新配置。
export const MIRRORED_FROM_FIELD = "_mirroredFrom";

export interface ProviderMirrorResult {
  added: number;
  updated: number;
  removed: number;
  mergedCollisions: number;
  cleanedLegacyMetadata: number;
}

export interface ProviderMirrorState {
  mirrors: Record<string, { source: string; signature: string }>;
}

export interface MirrorAliasedProvidersOptions {
  state?: ProviderMirrorState;
  persistState?: boolean;
}

export interface SyncPdfModelOptions {
  previousPrimary?: string;
}

const PROVIDER_MIRROR_STATE_FILE = "oneclaw-provider-mirrors.json";

function createEmptyMirrorState(): ProviderMirrorState {
  return { mirrors: {} };
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readProviderMirrorState(): ProviderMirrorState {
  const statePath = path.join(resolveUserStateDir(), PROVIDER_MIRROR_STATE_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    if (!isRecord(parsed?.mirrors)) return createEmptyMirrorState();
    const mirrors: ProviderMirrorState["mirrors"] = {};
    for (const [key, value] of Object.entries(parsed.mirrors)) {
      if (!isRecord(value)) continue;
      if (typeof value.source !== "string" || typeof value.signature !== "string") continue;
      mirrors[key] = { source: value.source, signature: value.signature };
    }
    return { mirrors };
  } catch {
    return createEmptyMirrorState();
  }
}

function writeProviderMirrorState(state: ProviderMirrorState): void {
  const statePath = path.join(resolveUserStateDir(), PROVIDER_MIRROR_STATE_FILE);
  const keys = Object.keys(state.mirrors);
  try {
    if (keys.length === 0) {
      if (fs.existsSync(statePath)) fs.unlinkSync(statePath);
      return;
    }
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf-8");
  } catch {
    // 镜像状态只是 OneClaw 的辅助索引；写失败时不要阻断用户保存模型配置。
  }
}

function cloneProviderEntry(entry: Record<string, any>): Record<string, any> {
  // openclaw.json 是 JSON 配置；用 JSON clone 可避免镜像条目与源条目共享 models/header 引用。
  const cloned = JSON.parse(JSON.stringify(entry));
  delete cloned[MIRRORED_FROM_FIELD];
  return cloned;
}

function providerMirrorSignature(entry: Record<string, any>): string {
  const normalized = cloneProviderEntry(entry);
  return JSON.stringify({
    apiKey: normalized.apiKey ?? null,
    baseUrl: normalized.baseUrl ?? null,
    api: normalized.api ?? null,
    authHeader: normalized.authHeader ?? null,
    headers: normalized.headers ?? null,
    request: normalized.request ?? null,
    models: normalized.models ?? null,
  });
}

function modelIdOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  if (isRecord(entry) && typeof entry.id === "string") return entry.id.trim() || null;
  return null;
}

function hasProviderModel(provider: Record<string, any>, modelId: string): boolean {
  const models = Array.isArray(provider.models) ? provider.models : [];
  return models.some((entry: unknown) => modelIdOf(entry) === modelId);
}

function mergeMissingModels(target: Record<string, any>, source: Record<string, any>): boolean {
  const sourceModels = Array.isArray(source.models) ? source.models : [];
  if (sourceModels.length === 0) return false;
  if (!Array.isArray(target.models)) target.models = [];

  let changed = false;
  for (const model of sourceModels) {
    const modelId = modelIdOf(model);
    if (!modelId || hasProviderModel(target, modelId)) continue;
    // normalized provider 已被用户占用时，只补模型声明，不覆盖用户的 baseUrl/apiKey。
    target.models.push(JSON.parse(JSON.stringify(model)));
    changed = true;
  }
  return changed;
}

function isGeneratedPdfModel(value: unknown, expectedPrimary: string): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length === 1 && keys[0] === "primary" && value.primary === expectedPrimary;
}

// ── 同步 pdfModel 到当前 primary 模型 ──
//
// openclaw 2026.4.x 的 PDF 自动选型只检查 env/auth profile，不认 OneClaw 写在
// models.providers.*.apiKey 下的密钥。因此 OneClaw 必须显式写 pdfModel.primary。
// 已有自定义 pdfModel（例如 native PDF 模型或 fallbacks）一律保留，避免配置数据丢失。
export function syncPdfModelToPrimary(config: any, opts: SyncPdfModelOptions = {}): boolean {
  const primary = config?.agents?.defaults?.model?.primary;
  if (!primary || typeof primary !== "string") return false;

  config.agents ??= {};
  config.agents.defaults ??= {};
  const current = config.agents.defaults.pdfModel;
  if (current == null) {
    config.agents.defaults.pdfModel = { primary };
    return true;
  }

  // 只有确认是 OneClaw 旧版自动生成的 { primary: 旧主模型 } 时才跟随更新；
  // 用户手动设置的 pdfModel/fallbacks 不做覆盖。
  if (opts.previousPrimary && isGeneratedPdfModel(current, opts.previousPrimary)) {
    config.agents.defaults.pdfModel = { primary };
    return true;
  }

  return false;
}

export function isMirroredProviderEntry(
  providers: any,
  providerKey: string,
  state: ProviderMirrorState = readProviderMirrorState(),
): boolean {
  if (!isRecord(providers)) return false;
  const entry = providers[providerKey];
  if (!isRecord(entry)) return false;

  const legacySource = entry[MIRRORED_FROM_FIELD];
  if (typeof legacySource === "string" && normalizeProviderId(legacySource) === providerKey.trim().toLowerCase()) {
    return true;
  }

  const tracked = state.mirrors[providerKey];
  if (tracked) {
    const signature = providerMirrorSignature(entry);
    if (signature === tracked.signature) return true;
    const sourceEntry = providers[tracked.source];
    if (isRecord(sourceEntry) && signature === providerMirrorSignature(sourceEntry)) return true;
    return false;
  }

  const normalizedKey = normalizeProviderId(providerKey);
  if (normalizedKey !== providerKey.trim().toLowerCase()) return false;
  const entrySig = providerMirrorSignature(entry);
  for (const [sourceKey, sourceEntry] of Object.entries(providers)) {
    if (sourceKey === providerKey || !isRecord(sourceEntry)) continue;
    if (normalizeProviderId(sourceKey) !== normalizedKey) continue;
    if (normalizeProviderId(sourceKey) === sourceKey.trim().toLowerCase()) continue;
    if (providerMirrorSignature(sourceEntry) === entrySig) return true;
  }
  return false;
}

// 让 pdf tool 等走 normalizeProviderId 的查询路径能命中：
// 对每个会被改名的 provider key，复制一份到归一化后的 key（同 baseUrl/apiKey/models）。
// oneclaw 内部代码继续按原 key（如 kimi-coding）访问；镜像条目仅供 openclaw 注册表使用。
export function mirrorAliasedProviders(
  config: any,
  opts: MirrorAliasedProvidersOptions = {},
): ProviderMirrorResult {
  const result: ProviderMirrorResult = {
    added: 0,
    updated: 0,
    removed: 0,
    mergedCollisions: 0,
    cleanedLegacyMetadata: 0,
  };
  const providers = config?.models?.providers;
  if (!isRecord(providers)) return result;

  const state = opts.state ?? (opts.persistState ? readProviderMirrorState() : createEmptyMirrorState());
  const legacyMirrorSources = new Map<string, string>();
  for (const key of Object.keys(providers)) {
    const entry = providers[key];
    if (!isRecord(entry)) continue;
    const legacySource = entry[MIRRORED_FROM_FIELD];
    if (typeof legacySource === "string" && legacySource.trim()) {
      legacyMirrorSources.set(key, legacySource.trim());
      state.mirrors[key] = {
        source: legacySource.trim(),
        signature: providerMirrorSignature(entry),
      };
    }
    if (Object.prototype.hasOwnProperty.call(entry, MIRRORED_FROM_FIELD)) {
      delete entry[MIRRORED_FROM_FIELD];
      result.cleanedLegacyMetadata += 1;
    }
  }

  for (const [targetKey, meta] of Object.entries({ ...state.mirrors })) {
    const targetEntry = providers[targetKey];
    if (!isRecord(targetEntry)) {
      delete state.mirrors[targetKey];
      continue;
    }
    const sourceEntry = providers[meta.source];
    const sourceStillTargetsHere = isRecord(sourceEntry) && normalizeProviderId(meta.source) === targetKey.trim().toLowerCase();
    if (sourceStillTargetsHere) continue;

    if (providerMirrorSignature(targetEntry) === meta.signature) {
      delete providers[targetKey];
      result.removed += 1;
    }
    // 如果用户手动改过 normalized provider，则让它脱离 OneClaw 镜像管理。
    delete state.mirrors[targetKey];
  }

  const sourceKeys = Object.keys(providers);
  for (const key of sourceKeys) {
    const entry = providers[key];
    if (!isRecord(entry) || legacyMirrorSources.has(key) || state.mirrors[key]) continue;
    const normalized = normalizeProviderId(key);
    if (!normalized || normalized === key.trim().toLowerCase()) continue;
    const nextEntry = cloneProviderEntry(entry);
    const nextSignature = providerMirrorSignature(nextEntry);
    if (!providers[normalized]) {
      providers[normalized] = nextEntry;
      state.mirrors[normalized] = { source: key, signature: nextSignature };
      result.added += 1;
      continue;
    }
    // 只更新 OneClaw 管理的镜像；元数据放在 sidecar，避免污染 openclaw strict schema。
    const tracked = state.mirrors[normalized];
    if ((tracked && tracked.source === key) || (!tracked && isMirroredProviderEntry(providers, normalized, state))) {
      providers[normalized] = nextEntry;
      state.mirrors[normalized] = { source: key, signature: nextSignature };
      result.updated += 1;
      continue;
    }

    const normalizedEntry = providers[normalized];
    if (isRecord(normalizedEntry) && mergeMissingModels(normalizedEntry, entry)) {
      // normalized key 被用户真实 provider 占用时不能覆盖凭据，只合并缺失模型，
      // 至少避免 pdf/registry 路径因 normalize 后找不到模型而报 Unknown model。
      result.mergedCollisions += 1;
    }
  }

  if (opts.persistState) writeProviderMirrorState(state);
  return result;
}

// ── 用户配置读写（薄封装） ──

export function readUserConfig(): any {
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return {};
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

export function writeUserConfig(config: any): void {
  const stateDir = resolveUserStateDir();
  fs.mkdirSync(stateDir, { recursive: true });
  const previousPrimary = readUserConfig()?.agents?.defaults?.model?.primary;
  // 写配置时集中维护 pdfModel：缺失时补齐，旧自动值随 primary 迁移，自定义值不覆盖。
  syncPdfModelToPrimary(config, { previousPrimary });
  // 落盘前补齐归一化 provider 镜像，确保 pdf tool 等需要归一化查询的路径能命中注册表。
  mirrorAliasedProviders(config, { persistState: true });
  // 覆盖写入前先保留一份当前可解析配置，便于用户在设置页回退。
  backupCurrentUserConfig();
  const configPath = resolveUserConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  // openclaw 4.x 每次读 openclaw.json 会与 health-state baseline 以及
  // openclaw.json.bak 做字节校验；外部直写会让两者落后，产生 .clobbered 雪崩。
  // 这里把 .bak 同步成当前内容，并清理 health entry 让 openclaw 重建基线。
  syncOpenClawStateAfterWrite(configPath);
}

// ── 验证函数 ──

// Anthropic 原生接口验证
export function verifyAnthropic(apiKey: string, modelID?: string): Promise<void> {
  return jsonRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelID || "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
}

// OpenAI 原生接口验证
export function verifyOpenAI(apiKey: string): Promise<void> {
  return jsonRequest("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// Google Generative AI 验证
export function verifyGoogle(apiKey: string): Promise<void> {
  return jsonRequest(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    {}
  );
}

// Kimi Code 验证：始终通过本地 auth proxy（proxy 自动注入 OAuth token）
export function verifyKFC(proxyPort: number, modelID?: string): Promise<void> {
  return jsonRequest(`http://127.0.0.1:${proxyPort}/coding/v1/messages`, {
    method: "POST",
    headers: {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: modelID || "kimi-for-coding",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
}

// Moonshot 子平台验证（moonshot-cn / moonshot-ai）
export function verifyMoonshot(apiKey: string, subPlatform?: string): Promise<void> {
  const sub = MOONSHOT_SUB_PLATFORMS[subPlatform || "moonshot-cn"];
  return jsonRequest(`${sub.baseUrl}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// 飞书应用凭据验证（通过 tenant_access_token 接口校验 appId + appSecret）
export function verifyFeishu(appId: string, appSecret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ app_id: appId, app_secret: appSecret });
    const req = https.request(
      {
        hostname: "open.feishu.cn",
        path: "/open-apis/auth/v3/tenant_access_token/internal",
        method: "POST",
        headers: { "content-type": "application/json" },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.code === 0) {
              resolve();
            } else {
              reject(new Error(json.msg || `飞书验证失败 (code: ${json.code})`));
            }
          } catch {
            reject(new Error(`飞书响应解析失败: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", (e) => reject(new Error(`网络错误: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.write(body);
    req.end();
  });
}

// QQ Bot 凭据验证（通过 getAppAccessToken 接口校验 appId + clientSecret）。
export function verifyQqbot(appId: string, clientSecret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ appId, clientSecret });
    const req = https.request(
      {
        hostname: "bots.qq.com",
        path: "/app/getAppAccessToken",
        method: "POST",
        headers: { "content-type": "application/json" },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (typeof json.access_token === "string" && json.access_token.trim()) {
              resolve();
            } else {
              reject(new Error(json.message || json.msg || `QQ Bot 验证失败: ${data.slice(0, 200)}`));
            }
          } catch {
            reject(new Error(`QQ Bot 响应解析失败: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", (e) => reject(new Error(`网络错误: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.write(body);
    req.end();
  });
}

// 钉钉应用凭据验证（通过 accessToken 接口校验 clientId/AppKey + clientSecret/AppSecret）。
export function verifyDingtalk(clientId: string, clientSecret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ appKey: clientId, appSecret: clientSecret });
    const req = https.request(
      {
        hostname: "api.dingtalk.com",
        path: "/v1.0/oauth2/accessToken",
        method: "POST",
        headers: { "content-type": "application/json" },
        timeout: 15000,
      },
      (res) => {
        let data = "";
        res.on("data", (d) => (data += d));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (typeof json.accessToken === "string" && json.accessToken.trim()) {
              resolve();
              return;
            }
            reject(
              new Error(
                json.message ||
                json.msg ||
                json.errmsg ||
                `钉钉验证失败: ${data.slice(0, 200)}`
              )
            );
          } catch {
            reject(new Error(`钉钉响应解析失败: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", (e) => reject(new Error(`网络错误: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
    req.write(body);
    req.end();
  });
}

// Custom provider 验证（根据 API 类型发真实 chat 请求，而非 /models）
export async function verifyCustom(apiKey: string, baseURL?: string, apiType?: string, modelID?: string): Promise<void> {
  if (!baseURL) throw new Error("Custom provider 需要 Base URL");
  if (!modelID) throw new Error("Custom provider 需要 Model ID");
  const base = baseURL.replace(/\/$/, "");

  if (apiType === "anthropic-messages") {
    await jsonRequest(`${base}/v1/messages`, {
      method: "POST",
      headers: {
        "User-Agent": UA_ANTHROPIC,
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelID,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
  } else if (apiType === "openai-responses") {
    // OpenAI Responses API（/v1/responses）
    await jsonRequest(`${base}/v1/responses`, {
      method: "POST",
      headers: {
        "User-Agent": UA_OPENAI,
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelID,
        input: "hi",
      }),
    });
  } else {
    // openai-completions（默认）
    await jsonRequest(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "User-Agent": UA_OPENAI,
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelID,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
  }
}

// ── 统一验证入口（根据 provider 名称分派） ──

export async function verifyProvider(params: {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  subPlatform?: string;
  apiType?: string;
  modelID?: string;
  appId?: string;
  clientId?: string;
  appSecret?: string;
  clientSecret?: string;
  customPreset?: string;
  proxyPort?: number;
}): Promise<{ success: boolean; message?: string }> {
  const {
    provider,
    apiKey,
    baseURL,
    subPlatform,
    apiType,
    modelID,
    appId,
    clientId,
    appSecret,
    clientSecret,
    customPreset,
    proxyPort,
  } = params;
  try {
    switch (provider) {
      case "anthropic":
        await verifyAnthropic(apiKey!, modelID);
        break;
      case "openai":
        await verifyOpenAI(apiKey!);
        break;
      case "google":
        await verifyGoogle(apiKey!);
        break;
      case "moonshot":
        if (subPlatform === "kimi-code") {
          if (!proxyPort || proxyPort <= 0) throw new Error("Kimi Code auth proxy not running");
          await verifyKFC(proxyPort, modelID);
        } else {
          await verifyMoonshot(apiKey!, subPlatform);
        }
        break;
      case "custom": {
        const customPre = customPreset ? CUSTOM_PROVIDER_PRESETS[customPreset] : undefined;
        // 内置预设命中时，使用预设的 baseUrl 和 api 进行验证（前端传了 baseURL 时优先）
        const effectiveBaseURL = baseURL || (customPre ? customPre.baseUrl : undefined);
        const effectiveApiType = customPre ? customPre.api : apiType;
        await verifyCustom(apiKey!, effectiveBaseURL, effectiveApiType, modelID);
        break;
      }
      case "feishu":
        await verifyFeishu(appId!, appSecret!);
        break;
      case "qqbot":
        await verifyQqbot(appId!, clientSecret!);
        break;
      case "dingtalk":
        await verifyDingtalk(clientId!, clientSecret!);
        break;
      default:
        return { success: false, message: `未知 Provider: ${provider}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

// ── HTTP 请求工具 ──

// 与 runtime SDK 保持一致的 User-Agent（见 node_modules/@anthropic-ai/sdk 和 openai）
const UA_ANTHROPIC = "Anthropic/JS 0.73.0";
const UA_OPENAI = "OpenAI/JS 6.10.0";

// 从 provider 响应体中尽力抽出可读的错误消息，避免把 JSON 转义（如 >）泄漏给用户。
// 兼容常见 provider 形态：anthropic/openai 的 {error:{message}}、moonshot 的 {error:{message}}、
// 部分代理网关返回 {message} / {msg}、上游字符串 {error:"text"} 等。
function extractProviderErrorMessage(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return "";
  try {
    const json = JSON.parse(trimmed);
    const candidates: unknown[] = [
      json?.error?.message,
      json?.error?.error?.message,
      json?.error?.msg,
      json?.error,
      json?.message,
      json?.msg,
      json?.detail,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim();
    }
  } catch {
    // body 不是合法 JSON（HTML 错误页 / 纯文本 / 截断），按原文处理
  }
  return trimmed;
}

export function jsonRequest(
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const urlObj = new URL(url);

    const req = mod.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: opts.method || "GET",
        headers: opts.headers,
        timeout: 15000,
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          const code = res.statusCode ?? 0;
          if (code >= 200 && code < 300) {
            resolve();
          } else if (code === 401 || code === 403) {
            reject(new Error(`API Key 无效 (${code})`));
          } else {
            // 真实错误文本（已 JSON 解码），上限 1000 字以兼容罕见的极长 message。
            const text = extractProviderErrorMessage(body);
            const trimmed = text.length > 1000 ? `${text.slice(0, 1000)}…` : text;
            reject(new Error(`请求失败 (${code}): ${trimmed}`));
          }
        });
      }
    );
    req.on("error", (e) => reject(new Error(`网络错误: ${e.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}
