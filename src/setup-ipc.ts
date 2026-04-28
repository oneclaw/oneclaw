import { app, BrowserWindow, ipcMain } from "electron";
import { ensureGatewayAuthTokenInConfig, resolveGatewayAuthToken } from "./gateway-auth";
import * as analytics from "./analytics";
import { getLaunchAtLoginState, setLaunchAtLoginEnabled } from "./launch-at-login";
import {
  PROVIDER_PRESETS,
  MOONSHOT_SUB_PLATFORMS,
  CUSTOM_PROVIDER_PRESETS,
  verifyProvider,
  buildProviderConfig,
  deriveCustomConfigKey,
  saveMoonshotConfig,
  readUserConfig,
  writeUserConfig,
} from "./provider-config";
import * as log from "./logger";
import { installCli, uninstallCli } from "./cli-integration";
import { saveKimiSearchConfig, writeKimiApiKey, ensureMemorySearchProxyConfig } from "./kimi-config";
import { startAuthProxy, setProxyAccessToken, getProxyPort } from "./kimi-auth-proxy";
import {
  detectExistingInstallation,
  killPortProcess,
  uninstallGatewayDaemon,
  uninstallGlobalOpenclaw,
} from "./install-detector";
import { markSetupComplete } from "./oneclaw-config";
import { recordSetupBaselineConfigSnapshot } from "./config-backup";
import type { WindowManager } from "./window";

interface SetupIpcDeps {
  windowManager: WindowManager;
  ensureGatewayRunning: (source: string) => Promise<boolean>;
  onOAuthLoginSuccess?: () => void;
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
  analytics.trackSetupActionStarted(action, props);
  try {
    const result = await run();
    const latencyMs = Date.now() - startedAt;
    analytics.trackSetupActionResult(action, {
      success: result.success,
      latencyMs,
      errorType: result.success ? undefined : analytics.classifyErrorType(result.message),
      props,
    });
    return result;
  } catch (err) {
    analytics.trackSetupActionResult(action, {
      success: false,
      latencyMs: Date.now() - startedAt,
      errorType: analytics.classifyErrorType(err),
      props,
    });
    throw err;
  }
}

// 注册 Setup 相关 IPC
export function registerSetupIpc(deps: SetupIpcDeps): void {
  const { windowManager, ensureGatewayRunning } = deps;

  // ── 环境检测：检查已有 OpenClaw 安装 ──
  ipcMain.handle("setup:detect-installation", async () => {
    try {
      const result = await detectExistingInstallation();
      return { success: true, data: result };
    } catch (err: any) {
      log.error(`[setup] 环境检测失败: ${err?.message ?? err}`);
      return { success: true, data: { portInUse: false, portProcess: "", portPid: 0, globalInstalled: false, globalPath: "" } };
    }
  });

  // ── 冲突处理：卸载旧版 ──
  ipcMain.handle("setup:resolve-conflict", async (_event, params: { action: "uninstall"; pid?: number }) => {
    const { pid } = params;
    try {
      // 顺序：① 卸载系统守护进程 + 清理锁文件（停止 launchd/schtasks 的自动重启）
      //       ② 杀掉残留进程（守护进程卸载后不会再被拉起）
      //       ③ 卸载 npm 全局包
      await uninstallGatewayDaemon();
      if (pid && pid > 0) {
        await killPortProcess(pid);
      }
      await uninstallGlobalOpenclaw();
      // 保留 ~/.openclaw/：聊天记录、项目数据都在里面
      log.info("[setup] 旧版 OpenClaw 卸载完成");
      return { success: true };
    } catch (err: any) {
      log.error(`[setup] 冲突处理失败: ${err?.message ?? err}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

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

  // ── Kimi OAuth ──
  ipcMain.handle("kimi-oauth:login", async (event) => {
    const { kimiOAuthLogin } = await import("./kimi-oauth");
    const result = await kimiOAuthLogin();
    // 轮询成功后将窗口拉回前台，避免用户停留在浏览器找不到程序
    if (result.success) {
      deps.onOAuthLoginSuccess?.();
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    }
    return result;
  });

  ipcMain.handle("kimi-oauth:cancel", async () => {
    const { kimiOAuthCancel } = await import("./kimi-oauth");
    kimiOAuthCancel();
  });

  ipcMain.handle("kimi-oauth:logout", async () => {
    const { kimiOAuthLogout } = await import("./kimi-oauth");
    kimiOAuthLogout();
  });

  ipcMain.handle("kimi-oauth:status", async () => {
    const { getOAuthStatus } = await import("./kimi-oauth");
    return getOAuthStatus();
  });

  // ── 验证 API Key ──
  ipcMain.handle("setup:verify-key", async (_event, params) => {
    const provider = typeof params?.provider === "string" ? params.provider : "";
    // kimi-code 验证前：确保 proxy 已启动并持有最新 token
    if (params?.subPlatform === "kimi-code" && params?.apiKey) {
      if (getProxyPort() <= 0) {
        await startAuthProxy();
      }
      setProxyAccessToken(params.apiKey);
    }
    return runTrackedSetupAction("verify_key", { provider }, async () =>
      verifyProvider({ ...params, proxyPort: getProxyPort() }));
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
      customPreset,
    } = params;
    const trackedProps = {
      provider,
      model: modelID,
      sub_platform: subPlatform || undefined,
      custom_preset: customPreset || undefined,
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
        // 长对话压缩保护：保留最近轮次原文、审计摘要质量、守住关键标识符
        config.agents.defaults.compaction ??= {};
        config.agents.defaults.compaction.mode = "safeguard";

        // Moonshot 子平台需要特殊处理
        if (provider === "moonshot") {
          saveMoonshotConfig(config, apiKey, modelID, subPlatform);
          // 配置 kimi-code 时自动启用搜索插件 + 记忆搜索 embedding
          if (subPlatform === "kimi-code") {
            saveKimiSearchConfig(config, { enabled: true });
            ensureMemorySearchProxyConfig(config, getProxyPort());
            // 代理模式：真实 key 存 sidecar，config 写占位符
            if (getProxyPort() > 0) {
              writeKimiApiKey(apiKey);
              setProxyAccessToken(apiKey);
              config.models.providers["kimi-coding"].apiKey = "proxy-managed";
              config.models.providers["kimi-coding"].baseUrl = `http://127.0.0.1:${getProxyPort()}/coding`;
            }
          }
        } else {
          // 配置键：预设用预设 key，手动 custom 从 baseURL 派生唯一 key
          const customPre = customPreset ? CUSTOM_PROVIDER_PRESETS[customPreset] : undefined;
          const configKey = customPre
            ? customPre.providerKey
            : (provider === "custom" && baseURL) ? deriveCustomConfigKey(baseURL) : provider;

          // 构造 provider 配置
          const providerConfig = buildProviderConfig(provider, apiKey, modelID, baseURL, api, supportImage, customPreset);
          config.models.providers[configKey] = providerConfig;
          config.agents.defaults.model.primary = `${configKey}/${modelID}`;
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

        // 禁止 gateway 自行检查 npm 更新（OneClaw 整包打包，用户无法独立更新 gateway）
        config.update ??= {};
        config.update.checkOnStart = false;

        // 开箱即用：显式启用全部工具（openclaw 2026.3.2 起默认 messaging，只有消息类工具）
        config.tools ??= {};
        config.tools.profile = "full";

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

  // ── Setup 完成：启动 Gateway → 标记完成 → 导航到 Chat ──
  ipcMain.handle("setup:complete", async (_event, params?: { installCli?: boolean; launchAtLogin?: boolean; sessionMemory?: boolean }) => {
    const launchAtLogin = typeof params?.launchAtLogin === "boolean" ? params.launchAtLogin : undefined;
    const sessionMemory = params?.sessionMemory !== false;
    return runTrackedSetupAction("complete", { launch_at_login: launchAtLogin, session_memory: sessionMemory }, async () => {
      if (typeof launchAtLogin === "boolean") {
        setLaunchAtLoginEnabled(app, launchAtLogin);
      }

      // 写入 session-memory hook 配置
      try {
        const config = readUserConfig();
        config.hooks ??= {};
        config.hooks.internal = {
          enabled: true,
          entries: {
            ...config.hooks.internal?.entries,
            "session-memory": { enabled: sessionMemory },
          },
        };
        writeUserConfig(config);
      } catch (err: any) {
        log.error(`[setup] 写入 hooks 配置失败: ${err?.message ?? err}`);
      }

      // Inline completion: start gateway → mark complete → navigate to chat
      const running = await ensureGatewayRunning("setup:complete");
      if (!running) {
        return {
          success: false,
          message: "Gateway 启动超时或失败，请稍后重试。",
        };
      }

      try {
        // gateway schema 兼容：保留 wizard.lastRunAt
        const config = readUserConfig();
        config.wizard ??= {};
        config.wizard.lastRunAt = new Date().toISOString();
        delete config.wizard.pendingAt;
        writeUserConfig(config);

        // 写入 oneclaw.config.json 归属标记
        markSetupComplete();
      } catch (err: any) {
        log.error(`[setup] 写入 setup 完成标记失败: ${err?.message ?? err}`);
        return { success: false, message: err?.message ?? String(err) };
      }

      // 导航到 Chat 视图，携带最新 gateway token 避免 renderer 使用旧 token
      windowManager.inSetupView = false;
      windowManager.setupPending = false;
      windowManager.navigate({ view: "chat", token: resolveGatewayAuthToken() });
      recordSetupBaselineConfigSnapshot();

      analytics.track("setup_completed", latestSetupCompletedProps ?? {});

      // CLI 开关显式持久化：开启则安装，关闭则清理，失败都不阻塞 Setup。
      // 原始 error message 含绝对路径，只上报分类枚举给分析侧。
      if (params?.installCli !== false) {
        const cliResult = await installCli();
        if (cliResult.success) {
          analytics.track("cli_installed", { method: "setup_wizard" });
        } else {
          log.error(`[setup] CLI install failed: ${cliResult.message}`);
          analytics.track("cli_install_failed", {
            method: "setup_wizard",
            error_type: analytics.classifyErrorType(cliResult.message),
          });
        }
      } else {
        const cliResult = await uninstallCli();
        if (!cliResult.success) {
          log.error(`[setup] CLI uninstall failed: ${cliResult.message}`);
          analytics.track("cli_uninstall_failed", {
            method: "setup_wizard",
            error_type: analytics.classifyErrorType(cliResult.message),
          });
        }
      }

      return { success: true };
    });
  });
}

// 归一化 URL：去尾斜杠并小写主机名，用于预设匹配。
function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  try {
    const u = new URL(trimmed);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

// 所有内置预设的 baseUrl 集合（归一化后）。基于模块常量在首次使用时构建。
let presetBaseUrlSet: Set<string> | null = null;
function knownPresetBaseUrls(): Set<string> {
  if (presetBaseUrlSet) return presetBaseUrlSet;
  const urls = [
    ...Object.values(PROVIDER_PRESETS).map((p) => p.baseUrl),
    ...Object.values(MOONSHOT_SUB_PLATFORMS).map((p) => p.baseUrl),
    ...Object.values(CUSTOM_PROVIDER_PRESETS).map((p) => p.baseUrl),
  ];
  presetBaseUrlSet = new Set(urls.map(normalizeBaseUrl));
  return presetBaseUrlSet;
}

// 将 setup 表单参数转换为 setup_completed 事件需要的属性字段。
// 原始 base_url 可能包含内网主机、租户路径或凭证，只上报 preset/custom 粗分类。
function buildSetupCompletedProps(params: {
  provider: string;
  modelID: string;
  baseURL?: string;
  subPlatform?: string;
}, config?: any): Record<string, string> {
  const { provider, modelID, baseURL, subPlatform } = params;

  const sub = subPlatform ? MOONSHOT_SUB_PLATFORMS[subPlatform] : undefined;
  const effectiveKey = sub?.providerKey ?? provider;
  const configBaseUrl = config?.models?.providers?.[effectiveKey]?.baseUrl;
  const rawBaseUrl =
    typeof configBaseUrl === "string"
      ? configBaseUrl
      : (sub?.baseUrl ?? PROVIDER_PRESETS[provider]?.baseUrl ?? baseURL ?? "");

  const baseUrlKind = knownPresetBaseUrls().has(normalizeBaseUrl(rawBaseUrl)) ? "preset" : "custom";

  return {
    provider,
    model: modelID,
    base_url_kind: baseUrlKind,
  };
}
