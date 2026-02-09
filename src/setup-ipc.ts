import { ipcMain } from "electron";
import * as https from "https";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { resolveUserStateDir } from "./constants";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";
import { SetupManager } from "./setup-manager";
import * as analytics from "./analytics";

interface SetupIpcDeps {
  setupManager: SetupManager;
}

// 注册 Setup 相关 IPC
export function registerSetupIpc(deps: SetupIpcDeps): void {
  const { setupManager } = deps;

  // ── 验证 API Key ──
  ipcMain.handle("setup:verify-key", async (_event, params) => {
    const { provider, apiKey, baseURL, subPlatform } = params;
    try {
      switch (provider) {
        case "anthropic":
          await verifyAnthropic(apiKey);
          break;
        case "openai":
          await verifyOpenAI(apiKey);
          break;
        case "google":
          await verifyGoogle(apiKey);
          break;
        case "moonshot":
          await verifyMoonshot(apiKey, subPlatform);
          break;
        case "custom":
          await verifyCustom(apiKey, baseURL);
          break;
        default:
          return { success: false, message: `未知 Provider: ${provider}` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存配置到 ~/.openclaw/openclaw.json ──
  ipcMain.handle("setup:save-config", async (_event, params) => {
    const { provider, apiKey, modelID, baseURL, api, subPlatform } = params;
    try {
      const stateDir = resolveUserStateDir();
      fs.mkdirSync(stateDir, { recursive: true });
      const configPath = path.join(stateDir, "openclaw.json");

      // 读取现有配置
      let config: any = {};
      if (fs.existsSync(configPath)) {
        try {
          config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        } catch {
          config = {};
        }
      }

      // 初始化嵌套结构
      config.models ??= {};
      config.models.providers ??= {};
      config.agents ??= {};
      config.agents.defaults ??= {};
      config.agents.defaults.model ??= {};

      // Moonshot 子平台需要特殊处理
      if (provider === "moonshot") {
        saveMoonshotConfig(config, apiKey, modelID, subPlatform);
      } else {
        // 构造 provider 配置
        const providerConfig = buildProviderConfig(provider, apiKey, modelID, baseURL, api);
        config.models.providers[provider] = providerConfig;
        config.agents.defaults.model.primary = `${provider}/${modelID}`;
      }

      // 统一 gateway 鉴权配置：local 模式 + 持久化 token（单一真相源）
      config.gateway ??= {};
      config.gateway.mode = "local";
      ensureGatewayAuthTokenInConfig(config);

      // 标记 Setup 已完成（字段对齐 openclaw config schema，避免每次启动重走 onboarding）
      config.wizard = { lastRunAt: new Date().toISOString() };

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── Setup 完成（Gateway 启动 + 窗口切换由 setOnComplete 回调统一处理） ──
  ipcMain.handle("setup:complete", async () => {
    const ok = await setupManager.complete();
    if (ok) {
      analytics.track("setup_completed");
      return { success: true };
    }
    return {
      success: false,
      message: "Gateway 启动超时或失败，请稍后重试。",
    };
  });
}

// ── Provider 配置表（与 kimiclaw ProviderSetupView.swift 对齐） ──

interface ProviderPreset {
  baseUrl: string;
  api: string;
}

const PROVIDER_PRESETS: Record<string, ProviderPreset> = {
  anthropic: { baseUrl: "https://api.anthropic.com/v1",                    api: "anthropic-messages" },
  openai:    { baseUrl: "https://api.openai.com/v1",                       api: "openai-completions" },
  google:    { baseUrl: "https://generativelanguage.googleapis.com/v1beta", api: "google-generative-ai" },
};

// Moonshot 三个子平台的配置
const MOONSHOT_SUB_PLATFORMS: Record<string, { baseUrl: string; api: string; providerKey: string }> = {
  "moonshot-cn": { baseUrl: "https://api.moonshot.cn/v1",  api: "openai-completions",  providerKey: "moonshot" },
  "moonshot-ai": { baseUrl: "https://api.moonshot.ai/v1",  api: "openai-completions",  providerKey: "moonshot" },
  "kimi-code":   { baseUrl: "https://api.kimi.com/coding",    api: "anthropic-messages",  providerKey: "kimi-coding" },
};

// ── 构建 Provider 配置对象 ──

function buildProviderConfig(
  provider: string,
  apiKey: string,
  modelID: string,
  baseURL?: string,
  api?: string
): Record<string, unknown> {
  const preset = PROVIDER_PRESETS[provider];

  if (preset) {
    return {
      apiKey,
      baseUrl: preset.baseUrl,
      api: preset.api,
      models: [{ id: modelID, name: modelID }],
    };
  }

  // custom provider
  return {
    apiKey,
    baseUrl: baseURL,
    api: api || "openai-completions",
    models: [{ id: modelID, name: modelID }],
  };
}

// ── Moonshot 子平台配置写入 ──

function saveMoonshotConfig(
  config: any,
  apiKey: string,
  modelID: string,
  subPlatform: string
): void {
  const sub = MOONSHOT_SUB_PLATFORMS[subPlatform] || MOONSHOT_SUB_PLATFORMS["moonshot-cn"];
  const providerKey = sub.providerKey;

  // Kimi Code：不写 models.providers（让 gateway 内置配置生效），只写 env + primary
  if (subPlatform === "kimi-code") {
    config.env ??= {};
    config.env.KIMI_API_KEY = apiKey;
    config.agents.defaults.model.primary = `${providerKey}/${modelID}`;
    return;
  }

  // moonshot-cn / moonshot-ai：常规 provider 配置
  config.models.providers[providerKey] = {
    apiKey,
    baseUrl: sub.baseUrl,
    api: sub.api,
    models: [{ id: modelID, name: modelID }],
  };

  config.agents.defaults.model.primary = `${providerKey}/${modelID}`;
}

// ── 验证函数 ──

// Anthropic 原生接口验证
function verifyAnthropic(apiKey: string): Promise<void> {
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
function verifyOpenAI(apiKey: string): Promise<void> {
  return jsonRequest("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// Google Generative AI 验证
function verifyGoogle(apiKey: string): Promise<void> {
  return jsonRequest(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    {}
  );
}

// Moonshot 子平台验证（根据子平台选择不同 URL）
function verifyMoonshot(apiKey: string, subPlatform?: string): Promise<void> {
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

// Custom provider 验证
function verifyCustom(apiKey: string, baseURL?: string): Promise<void> {
  if (!baseURL) throw new Error("Custom provider 需要 Base URL");
  const url = baseURL.replace(/\/$/, "") + "/models";
  return jsonRequest(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

// ── HTTP 请求工具 ──

function jsonRequest(
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
