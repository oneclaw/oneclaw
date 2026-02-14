import { ipcMain } from "electron";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";
import { SetupManager } from "./setup-manager";
import * as analytics from "./analytics";
import {
  PROVIDER_PRESETS,
  MOONSHOT_SUB_PLATFORMS,
  verifyProvider,
  buildProviderConfig,
  saveMoonshotConfig,
  readUserConfig,
  writeUserConfig,
} from "./provider-config";
import { saveKimiPluginConfig, isKimiPluginBundled, DEFAULT_KIMI_BRIDGE_WS_URL } from "./kimi-config";

interface SetupIpcDeps {
  setupManager: SetupManager;
}

let latestSetupCompletedProps: Record<string, string> | null = null;

// 注册 Setup 相关 IPC
export function registerSetupIpc(deps: SetupIpcDeps): void {
  const { setupManager } = deps;

  // ── 验证 API Key ──
  ipcMain.handle("setup:verify-key", async (_event, params) => {
    return verifyProvider(params);
  });

  // ── 保存配置到 ~/.openclaw/openclaw.json ──
  ipcMain.handle("setup:save-config", async (_event, params) => {
    const {
      provider,
      apiKey,
      modelID,
      baseURL,
      api,
      subPlatform,
      supportImage,
    } = params;
    try {
      // 读取现有配置
      const config = readUserConfig();

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
        const providerConfig = buildProviderConfig(provider, apiKey, modelID, baseURL, api, supportImage);
        config.models.providers[provider] = providerConfig;
        config.agents.defaults.model.primary = `${provider}/${modelID}`;
      }

      // 统一 gateway 鉴权配置：local 模式 + 持久化 token（单一真相源）
      config.gateway ??= {};
      config.gateway.mode = "local";
      ensureGatewayAuthTokenInConfig(config);

      // 默认使用独立浏览器实例，免去用户手动安装 Chrome 扩展
      config.browser ??= {};
      config.browser.defaultProfile = "openclaw";

      // 显式禁用 iMessage 频道（openclaw 默认启用，会因 macOS 权限拒绝产生大量错误日志）
      config.channels ??= {};
      config.channels.imessage ??= {};
      config.channels.imessage.enabled = false;

      // 标记 Setup 已完成（字段对齐 openclaw config schema，避免每次启动重走 onboarding）
      config.wizard = { lastRunAt: new Date().toISOString() };

      writeUserConfig(config);
      // 配置落盘成功后再缓存埋点上下文，避免失败时污染事件参数。
      latestSetupCompletedProps = buildSetupCompletedProps(params, config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存频道配置（追加到已有 config，Step 2 之后执行） ──
  ipcMain.handle("setup:save-channel", async (_event, params) => {
    const { appId, appSecret } = params;
    try {
      const config = readUserConfig();

      config.plugins ??= {};
      config.plugins.entries ??= {};
      config.plugins.entries.feishu = { enabled: true };

      config.channels ??= {};
      config.channels.feishu = { appId, appSecret };

      writeUserConfig(config);

      // 追加频道信息到 analytics 上下文
      if (latestSetupCompletedProps) {
        latestSetupCompletedProps.channel = "feishu";
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存 Kimi Channel 配置（Step 3 中独立保存） ──
  ipcMain.handle("setup:save-kimi-channel", async (_event, params) => {
    const botToken = toNonEmptyString(params?.botToken);
    try {
      if (!botToken) {
        return { success: false, message: "Kimi Bot Token 不能为空。" };
      }
      if (!isKimiPluginBundled()) {
        return { success: false, message: "Kimi Channel 组件缺失，请重新安装 OneClaw。" };
      }

      const config = readUserConfig();
      const gatewayToken = ensureGatewayAuthTokenInConfig(config);
      saveKimiPluginConfig(config, { botToken, gatewayToken, wsURL: DEFAULT_KIMI_BRIDGE_WS_URL });
      writeUserConfig(config);

      // 追加频道信息到 analytics 上下文
      if (latestSetupCompletedProps) {
        latestSetupCompletedProps.kimi_channel = "enabled";
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── Setup 完成（Gateway 启动 + 窗口切换由 setOnComplete 回调统一处理） ──
  ipcMain.handle("setup:complete", async () => {
    const ok = await setupManager.complete();
    if (ok) {
      analytics.track("setup_completed", latestSetupCompletedProps ?? {});
      return { success: true };
    }
    return {
      success: false,
      message: "Gateway 启动超时或失败，请稍后重试。",
    };
  });
}

// 将 setup 表单参数转换为 setup_completed 事件需要的属性字段。
function buildSetupCompletedProps(params: {
  provider: string;
  modelID: string;
  baseURL?: string;
  subPlatform?: string;
}, config?: any): Record<string, string> {
  const { provider, modelID, baseURL, subPlatform } = params;

  // Moonshot 子平台用实际写入的 providerKey 查配置
  const sub = subPlatform ? MOONSHOT_SUB_PLATFORMS[subPlatform] : undefined;
  const effectiveKey = sub?.providerKey ?? provider;
  const configBaseUrl = config?.models?.providers?.[effectiveKey]?.baseUrl;
  const rawBaseUrl =
    typeof configBaseUrl === "string"
      ? configBaseUrl
      : (sub?.baseUrl ?? PROVIDER_PRESETS[provider]?.baseUrl ?? baseURL ?? "");

  return {
    provider,
    model: modelID,
    base_url: rawBaseUrl.trim().replace(/\/+$/, ""),
  };
}


// 读取非空字符串（空则返回空串）
function toNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// 宽松解析布尔值（支持 "1"/"true"/"yes"/"on"）
function toBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }
  return false;
}
