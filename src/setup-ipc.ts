import { app, ipcMain } from "electron";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";
import { SetupManager } from "./setup-manager";
import * as analytics from "./analytics";
import { getLaunchAtLoginState, setLaunchAtLoginEnabled } from "./launch-at-login";
import {
  PROVIDER_PRESETS,
  MOONSHOT_SUB_PLATFORMS,
  verifyProvider,
  buildProviderConfig,
  saveMoonshotConfig,
  readUserConfig,
  writeUserConfig,
} from "./provider-config";
import * as log from "./logger";
import { installCli } from "./cli-integration";
import { saveKimiSearchConfig } from "./kimi-config";
interface SetupIpcDeps {
  setupManager: SetupManager;
}

let latestSetupCompletedProps: Record<string, string> | null = null;

type SetupActionResult = {
  success: boolean;
  message?: string;
};

// 统一封装 Setup 埋点：started/result 结构固定，避免每个 handler 手写重复逻辑。
async function runTrackedSetupAction<T extends SetupActionResult>(
  action: analytics.SetupAction,
  props: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const canTrackStructured =
    typeof analytics.trackSetupActionStarted === "function" &&
    typeof analytics.trackSetupActionResult === "function";
  if (canTrackStructured) {
    analytics.trackSetupActionStarted(action, props);
  }
  try {
    const result = await run();
    const latencyMs = Date.now() - startedAt;
    const errorType = result.success
      ? undefined
      : (typeof analytics.classifyErrorType === "function"
        ? analytics.classifyErrorType(result.message)
        : "unknown");
    if (canTrackStructured) {
      analytics.trackSetupActionResult(action, {
        success: result.success,
        latencyMs,
        errorType,
        props,
      });
    }
    return result;
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    const errorType =
      typeof analytics.classifyErrorType === "function"
        ? analytics.classifyErrorType(err)
        : "unknown";
    if (canTrackStructured) {
      analytics.trackSetupActionResult(action, {
        success: false,
        latencyMs,
        errorType,
        props,
      });
    }
    throw err;
  }
}

// 注册 Setup 相关 IPC
export function registerSetupIpc(deps: SetupIpcDeps): void {
  const { setupManager } = deps;

  // ── 读取系统开机启动状态（Setup Step 3 开关回填） ──
  ipcMain.handle("setup:get-launch-at-login", async () => {
    try {
      return {
        success: true,
        data: getLaunchAtLoginState(app),
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 验证 API Key ──
  ipcMain.handle("setup:verify-key", async (_event, params) => {
    const provider = typeof params?.provider === "string" ? params.provider : "";
    return runTrackedSetupAction("verify_key", { provider }, async () => verifyProvider(params));
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
    const trackedProps = {
      provider,
      model: modelID,
      sub_platform: subPlatform || undefined,
    };
    return runTrackedSetupAction("save_config", trackedProps, async () => {
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
          // 配置 kimi-code 时自动启用搜索插件
          if (subPlatform === "kimi-code") {
            saveKimiSearchConfig(config, { enabled: true });
          }
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

        // Step 2 不写 wizard，避免生成 schema 未识别字段。
        // Setup 完成标记仅在 Step 3（Gateway 成功启动）后写入 wizard.lastRunAt。
        delete config.wizard;

        writeUserConfig(config);
        // 配置落盘成功后再缓存埋点上下文，避免失败时污染事件参数。
        latestSetupCompletedProps = buildSetupCompletedProps(params, config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── Setup 完成（Gateway 启动 + 窗口切换由 setOnComplete 回调统一处理） ──
  ipcMain.handle("setup:complete", async (_event, params?: { installCli?: boolean; launchAtLogin?: boolean }) => {
    const launchAtLogin = typeof params?.launchAtLogin === "boolean" ? params.launchAtLogin : undefined;
    return runTrackedSetupAction("complete", { launch_at_login: launchAtLogin }, async () => {
      if (typeof launchAtLogin === "boolean") {
        setLaunchAtLoginEnabled(app, launchAtLogin);
      }
      const ok = await setupManager.complete();
      if (!ok) {
        return {
          success: false,
          message: "Gateway 启动超时或失败，请稍后重试。",
        };
      }

      analytics.track("setup_completed", latestSetupCompletedProps ?? {});

      // CLI 安装（默认开启，失败不阻塞 Setup）
      if (params?.installCli !== false) {
        const cliResult = await installCli();
        if (cliResult.success) {
          analytics.track("cli_installed", { method: "setup_wizard" });
        } else {
          log.error(`[setup] CLI install failed: ${cliResult.message}`);
          analytics.track("cli_install_failed", { error: cliResult.message });
        }
      }

      return { success: true };
    });
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
