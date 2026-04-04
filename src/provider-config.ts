import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import { resolveUserConfigPath, resolveUserStateDir } from "./constants";
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
    models: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
  },
  "minimax-cn": {
    providerKey: "minimax-cn",
    baseUrl: "https://api.minimaxi.com/anthropic",
    api: "anthropic-messages",
    placeholder: "eyJ...",
    models: ["MiniMax-M2.5", "MiniMax-M2.5-highspeed"],
  },
  "zai-global": {
    providerKey: "zai-global",
    baseUrl: "https://api.z.ai/api/paas/v4",
    api: "openai-completions",
    placeholder: "...",
    models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  "zai-cn": {
    providerKey: "zai-cn",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    api: "openai-completions",
    placeholder: "...",
    models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
  },
  "zai-cn-coding": {
    providerKey: "zai-cn-coding",
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    api: "openai-completions",
    placeholder: "...",
    models: ["glm-5", "glm-4.7", "glm-4.7-flash", "glm-4.7-flashx"],
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
    models: ["doubao-seed-2.0-code", "doubao-seed-2.0-pro", "doubao-seed-2.0-lite", "doubao-seed-code", "minimax-m2.5", "glm-4.7", "deepseek-v3.2", "kimi-k2.5", "ark-code-latest"],
  },
  "qwen": {
    providerKey: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    api: "openai-completions",
    placeholder: "sk-...",
    models: ["qwen-coder-plus-latest", "qwen-plus-latest", "qwen-max-latest", "qwen-turbo-latest"],
  },
  "qwen-coding": {
    providerKey: "qwen-coding",
    baseUrl: "https://coding.dashscope.aliyuncs.com/v1",
    api: "openai-completions",
    placeholder: "sk-sp-...",
    models: ["qwen3.5-plus", "kimi-k2.5", "glm-5", "MiniMax-M2.5",],
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
  // 覆盖写入前先保留一份当前可解析配置，便于用户在设置页回退。
  backupCurrentUserConfig();
  const configPath = resolveUserConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
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
      model: modelID || "k2p5",
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

// ── 图片能力探测 ──

// 1x1 transparent PNG (67 bytes) as base64
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
  "Nl7BcQAAAABJRU5ErkJggg==";

// 文本验证成功后，发一次带图片的请求来探测模型是否支持图片输入。
// 只对有 modelID 且走 chat 接口的 provider 有意义（跳过 feishu/qqbot/dingtalk 等凭证型）。
async function probeImageSupport(params: {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  subPlatform?: string;
  apiType?: string;
  modelID?: string;
  customPreset?: string;
  proxyPort?: number;
}): Promise<boolean> {
  const { provider, apiKey, baseURL, subPlatform, apiType, modelID, customPreset, proxyPort } = params;

  // 确定实际的 API 类型和 base URL
  let effectiveApi: string;
  let effectiveBase: string;

  if (provider === "anthropic") {
    effectiveApi = "anthropic-messages";
    effectiveBase = PROVIDER_PRESETS.anthropic.baseUrl;
  } else if (provider === "openai") {
    effectiveApi = "openai-completions";
    effectiveBase = PROVIDER_PRESETS.openai.baseUrl;
  } else if (provider === "google") {
    // Google Generative AI 验证走 /models 端点，不走 chat，且主流模型均支持图片
    return true;
  } else if (provider === "moonshot") {
    if (subPlatform === "kimi-code") {
      effectiveApi = "anthropic-messages";
      effectiveBase = `http://127.0.0.1:${proxyPort}/coding`;
    } else {
      const sub = MOONSHOT_SUB_PLATFORMS[subPlatform || "moonshot-cn"] || MOONSHOT_SUB_PLATFORMS["moonshot-cn"];
      effectiveApi = sub.api;
      effectiveBase = sub.baseUrl;
    }
  } else if (provider === "custom") {
    const customPre = customPreset ? CUSTOM_PROVIDER_PRESETS[customPreset] : undefined;
    effectiveBase = (baseURL || (customPre ? customPre.baseUrl : ""))!.replace(/\/$/, "");
    effectiveApi = customPre ? customPre.api : (apiType || "openai-completions");
  } else {
    // feishu/qqbot/dingtalk 等无 chat 接口的 provider — 默认不支持
    return false;
  }

  if (!effectiveBase || !modelID) return true; // 无法探测时保守返回 true

  try {
    if (effectiveApi === "anthropic-messages") {
      const url = effectiveBase.replace(/\/$/, "") + "/v1/messages";
      const headers: Record<string, string> = {
        "User-Agent": UA_ANTHROPIC,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      };
      // kimi-code 走代理无需 x-api-key；其他需要
      if (apiKey && provider !== "moonshot") headers["x-api-key"] = apiKey;
      if (provider === "moonshot" && subPlatform !== "kimi-code" && apiKey) headers["x-api-key"] = apiKey;

      await jsonRequest(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: modelID,
          max_tokens: 1,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG_B64 } },
              { type: "text", text: "hi" },
            ],
          }],
        }),
      });
      return true;
    } else if (effectiveApi === "openai-completions") {
      const url = effectiveBase.replace(/\/$/, "") + "/chat/completions";
      await jsonRequest(url, {
        method: "POST",
        headers: {
          "User-Agent": UA_OPENAI,
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelID,
          max_tokens: 1,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG_B64}` } },
              { type: "text", text: "hi" },
            ],
          }],
        }),
      });
      return true;
    }
    // openai-responses / google-generative-ai 等不易探测，保守返回 true
    return true;
  } catch {
    // 请求失败说明模型不支持图片
    return false;
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
}): Promise<{ success: boolean; message?: string; supportsImage?: boolean }> {
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

    // 文本验证通过后，自动探测图片能力
    const supportsImage = await probeImageSupport(params);

    return { success: true, supportsImage };
  } catch (err: any) {
    return { success: false, message: err.message || String(err) };
  }
}

// ── HTTP 请求工具 ──

// 与 runtime SDK 保持一致的 User-Agent（见 node_modules/@anthropic-ai/sdk 和 openai）
const UA_ANTHROPIC = "Anthropic/JS 0.73.0";
const UA_OPENAI = "OpenAI/JS 6.10.0";

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
            reject(new Error(`请求失败 (${code}): ${body.slice(0, 200)}`));
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
