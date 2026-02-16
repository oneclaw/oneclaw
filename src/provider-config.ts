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
  anthropic: { baseUrl: "https://api.anthropic.com/v1",                    api: "anthropic-messages" },
  openai:    { baseUrl: "https://api.openai.com/v1",                       api: "openai-completions" },
  google:    { baseUrl: "https://generativelanguage.googleapis.com/v1beta", api: "google-generative-ai" },
};

// Moonshot 三个子平台配置
export const MOONSHOT_SUB_PLATFORMS: Record<string, { baseUrl: string; api: string; providerKey: string }> = {
  "moonshot-cn": { baseUrl: "https://api.moonshot.cn/v1",  api: "openai-completions",  providerKey: "moonshot" },
  "moonshot-ai": { baseUrl: "https://api.moonshot.ai/v1",  api: "openai-completions",  providerKey: "moonshot" },
  "kimi-code":   { baseUrl: "https://api.kimi.com/coding", api: "anthropic-messages",  providerKey: "kimi-coding" },
};

// ── 构建 Provider 配置对象 ──

export function buildProviderConfig(
  provider: string,
  apiKey: string,
  modelID: string,
  baseURL?: string,
  api?: string,
  supportImage?: boolean
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
    models: [{ id: modelID, name: modelID, input: ["text", "image"] }],
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
export function verifyAnthropic(apiKey: string): Promise<void> {
  return jsonRequest("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
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

// Moonshot 子平台验证（根据子平台选择不同 URL）
export function verifyMoonshot(apiKey: string, subPlatform?: string): Promise<void> {
  const sub = MOONSHOT_SUB_PLATFORMS[subPlatform || "moonshot-cn"];
  const baseUrl = sub.baseUrl;

  // Kimi Code 使用 Anthropic Messages 协议验证
  if (subPlatform === "kimi-code") {
    return jsonRequest(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "k2p5",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
  }

  // moonshot-cn / moonshot-ai 使用 OpenAI 兼容 /models 接口
  return jsonRequest(`${baseUrl}/models`, {
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

// Custom provider 验证
export function verifyCustom(apiKey: string, baseURL?: string): Promise<void> {
  if (!baseURL) throw new Error("Custom provider 需要 Base URL");
  const url = baseURL.replace(/\/$/, "") + "/models";
  return jsonRequest(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// ── 统一验证入口（根据 provider 名称分派） ──

export async function verifyProvider(params: {
  provider: string;
  apiKey?: string;
  baseURL?: string;
  subPlatform?: string;
  appId?: string;
  appSecret?: string;
}): Promise<{ success: boolean; message?: string }> {
  const { provider, apiKey, baseURL, subPlatform, appId, appSecret } = params;
  try {
    switch (provider) {
      case "anthropic":
        await verifyAnthropic(apiKey!);
        break;
      case "openai":
        await verifyOpenAI(apiKey!);
        break;
      case "google":
        await verifyGoogle(apiKey!);
        break;
      case "moonshot":
        await verifyMoonshot(apiKey!, subPlatform);
        break;
      case "custom":
        await verifyCustom(apiKey!, baseURL);
        break;
      case "feishu":
        await verifyFeishu(appId!, appSecret!);
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
