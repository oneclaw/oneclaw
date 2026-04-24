import { app, ipcMain, session } from "electron";
import { spawn } from "child_process";
import {
  resolveNodeBin,
  resolveNodeExtraEnv,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveGatewayPackageDir,
  resolveResourcesPath,
  resolveUserConfigPath,
  resolveUserStateDir,
} from "./constants";
import { resolveOneclawConfigPath } from "./oneclaw-config";
import {
  getConfigRecoveryData,
  restoreLastKnownGoodConfigSnapshot,
  restoreUserConfigBackup,
} from "./config-backup";
import {
  PROVIDER_PRESETS,
  MOONSHOT_SUB_PLATFORMS,
  CUSTOM_PROVIDER_PRESETS,
  verifyProvider,
  verifyFeishu,
  verifyQqbot,
  verifyDingtalk,
  buildProviderConfig,
  deriveCustomConfigKey,
  saveMoonshotConfig,
  readUserConfig,
  writeUserConfig,
} from "./provider-config";
import { SHARE_COPY_PAYLOAD } from "./share-copy";
import { readSkillStoreRegistry, writeSkillStoreRegistry } from "./skill-store";
import {
  readChannelAllowFromStoreEntries as readChannelAllowFromStoreEntriesFromFs,
  writeChannelAllowFromStoreEntries as writeChannelAllowFromStoreEntriesFromFs,
} from "./channel-pairing-store";
import {
  extractKimiConfig,
  saveKimiPluginConfig,
  isKimiPluginBundled,
  extractKimiSearchConfig,
  saveKimiSearchConfig,
  isKimiSearchPluginBundled,
  writeKimiSearchDedicatedApiKey,
  writeKimiApiKey,
  readKimiApiKey,
  ensureMemorySearchProxyConfig,
} from "./kimi-config";
import {
  extractQqbotConfig,
  isQqbotPluginBundled,
  saveQqbotConfig,
} from "./qqbot-config";
import {
  extractDingtalkConfig,
  isDingtalkPluginBundled,
  saveDingtalkConfig,
  DEFAULT_DINGTALK_SESSION_TIMEOUT_MS,
} from "./dingtalk-config";
import {
  extractWecomConfig,
  isWecomPluginBundled,
  saveWecomConfig,
  verifyWecom,
  WECOM_CHANNEL_ID,
} from "./wecom-config";
import {
  extractWeixinConfig,
  saveWeixinConfig,
  isWeixinPluginBundled,
  startWeixinQrLogin,
  pollWeixinQrStatus,
  persistWeixinLoginSuccess,
  listWeixinAccountIds,
  clearWeixinAccounts,
} from "./weixin-config";
import {
  FEISHU_CHANNEL_ID,
  isFeishuEnabled,
  setFeishuChannelEnabled,
} from "./feishu-config";
import { startAuthProxy, setProxyAccessToken, setProxySearchDedicatedKey, getProxyPort } from "./kimi-auth-proxy";
import { ensureGatewayAuthTokenInConfig, resolveGatewayAuthToken } from "./gateway-auth";
import { callGatewayRpc } from "./gateway-rpc";
import { getLaunchAtLoginState, setLaunchAtLoginEnabled } from "./launch-at-login";
import { installCli, uninstallCli, getCliStatus } from "./cli-integration";
import { migrateBrowserProfileForCurrentGateway, normalizeRequestedBrowserProfileForSave } from "./browser-profile-config";
import * as analytics from "./analytics";
import * as path from "path";
import * as fs from "fs";

type CliRunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type PairingRequestView = {
  code: string;
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
};

export type FeishuPairingRequestView = PairingRequestView;

type FeishuRejectedPairingStore = {
  version: 1;
  codes: string[];
};

type FeishuAuthorizedEntryView = {
  kind: "user" | "group";
  id: string;
  name: string;
};

type FeishuAliasStore = {
  version: 1;
  users: Record<string, string>;
  groups: Record<string, string>;
};

const FEISHU_CHANNEL = FEISHU_CHANNEL_ID;
const WILDCARD_ALLOW_ENTRY = "*";
const FEISHU_ALIAS_STORE_FILE = "feishu-allowFrom-aliases.json";
const FEISHU_REJECTED_PAIRING_STORE_FILE = "feishu-rejected-pairing-codes.json";
const WECOM_REJECTED_PAIRING_STORE_FILE = "wecom-rejected-pairing-codes.json";
const FEISHU_OPEN_API_BASE = "https://open.feishu.cn/open-apis";
const FEISHU_TOKEN_SAFETY_MS = 60_000;

type FeishuTenantTokenCache = {
  appId: string;
  appSecret: string;
  token: string;
  expireAt: number;
};

let feishuTenantTokenCache: FeishuTenantTokenCache | null = null;

type SettingsActionResult = {
  success: boolean;
  message?: string;
};

// 统一封装 Settings 埋点：started/result 一次接入，所有保存类 handler 复用。
async function runTrackedSettingsAction<T extends SettingsActionResult>(
  action: analytics.SettingsAction,
  props: Record<string, unknown>,
  run: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const canTrackStructured =
    typeof analytics.trackSettingsActionStarted === "function" &&
    typeof analytics.trackSettingsActionResult === "function";
  if (canTrackStructured) {
    analytics.trackSettingsActionStarted(action, props);
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
      analytics.trackSettingsActionResult(action, {
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
      analytics.trackSettingsActionResult(action, {
        success: false,
        latencyMs,
        errorType,
        props,
      });
    }
    throw err;
  }
}

interface SettingsIpcOptions {
  requestGatewayRestart?: () => void;
  getGatewayToken?: () => string;
}

// 注册 Settings 相关 IPC
export function registerSettingsIpc(opts: SettingsIpcOptions = {}): void {
  // 写入配置后自动重启 gateway，避免新增 handler 遗漏重启调用
  const writeUserConfigAndRestart: typeof writeUserConfig = (config) => {
    writeUserConfig(config);
    opts.requestGatewayRestart?.();
  };
  // ── 读取当前 provider/model 配置（apiKey 掩码返回） ──
  ipcMain.handle("settings:get-config", async () => {
    try {
      const config = readUserConfig();
      return { success: true, data: extractProviderInfo(config) };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 聚合所有 provider 的已配置模型列表 ──
  ipcMain.handle("settings:get-configured-models", async () => {
    try {
      const config = readUserConfig();
      const providers = config?.models?.providers ?? {};
      const primary: string = config?.agents?.defaults?.model?.primary ?? "";
      const result: Array<{ key: string; name: string; provider: string; isDefault: boolean }> = [];

      for (const [providerKey, prov] of Object.entries(providers)) {
        if (!prov || typeof prov !== "object") continue;
        const models = (prov as any).models;
        if (!Array.isArray(models)) continue;
        for (const m of models) {
          const id = typeof m === "string" ? m : m?.id;
          if (!id) continue;
          const modelKey = `${providerKey}/${id}`;
          const name = typeof m === "object" ? (m.name || id) : id;
          // custom-xxx key 用 baseUrl hostname 做显示名，更可读
          let displayProvider = providerKey;
          if (providerKey.startsWith("custom-") && (prov as any).baseUrl) {
            try { displayProvider = new URL((prov as any).baseUrl).hostname; } catch {}
          }
          result.push({
            key: modelKey,
            name,
            provider: displayProvider,
            isDefault: modelKey === primary,
          });
        }
      }
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 删除指定模型（禁止删除默认模型） ──
  ipcMain.handle("settings:delete-model", async (_event, params) => {
    const modelKey = typeof params?.modelKey === "string" ? params.modelKey : "";
    return runTrackedSettingsAction("delete_model" as any, { model_key: modelKey }, async () => {
      try {
        const config = readUserConfig();
        const primary: string = config?.agents?.defaults?.model?.primary ?? "";
        if (modelKey === primary) {
          return { success: false, message: "不能删除当前默认模型" };
        }

        const slashIdx = modelKey.indexOf("/");
        if (slashIdx <= 0) {
          return { success: false, message: "无效的 modelKey 格式" };
        }
        const providerKey = modelKey.slice(0, slashIdx);
        const modelId = modelKey.slice(slashIdx + 1);

        config.models ??= {};
        config.models.providers ??= {};
        const prov = config.models.providers[providerKey];
        if (!prov || !Array.isArray(prov.models)) {
          return { success: false, message: "模型不存在" };
        }

        prov.models = prov.models.filter((m: any) => {
          const id = typeof m === "string" ? m : m?.id;
          return id !== modelId;
        });

        // provider 下无模型时移除整个 provider
        if (prov.models.length === 0) {
          delete config.models.providers[providerKey];
        }

        writeUserConfigAndRestart(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 设置默认模型 ──
  ipcMain.handle("settings:set-default-model", async (_event, params) => {
    const modelKey = typeof params?.modelKey === "string" ? params.modelKey : "";
    return runTrackedSettingsAction("set_default_model" as any, { model_key: modelKey }, async () => {
      try {
        const config = readUserConfig();
        // 验证目标模型确实存在
        const slashIdx = modelKey.indexOf("/");
        if (slashIdx <= 0) {
          return { success: false, message: "无效的 modelKey 格式" };
        }
        const providerKey = modelKey.slice(0, slashIdx);
        const modelId = modelKey.slice(slashIdx + 1);
        const prov = config?.models?.providers?.[providerKey];
        if (!prov || !Array.isArray(prov.models)) {
          return { success: false, message: "模型不存在" };
        }
        const found = prov.models.some((m: any) => (typeof m === "string" ? m : m?.id) === modelId);
        if (!found) {
          return { success: false, message: "模型不存在" };
        }

        config.agents ??= {};
        config.agents.defaults ??= {};
        config.agents.defaults.model ??= {};
        config.agents.defaults.model.primary = modelKey;

        writeUserConfigAndRestart(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 更新模型别名（不重启 gateway） ──
  ipcMain.handle("settings:update-model-alias", async (_event, params) => {
    const modelKey = typeof params?.modelKey === "string" ? params.modelKey : "";
    const alias = typeof params?.alias === "string" ? params.alias : "";
    return runTrackedSettingsAction("update_model_alias" as any, { model_key: modelKey }, async () => {
      try {
        const slashIdx = modelKey.indexOf("/");
        if (slashIdx <= 0) {
          return { success: false, message: "无效的 modelKey 格式" };
        }
        const providerKey = modelKey.slice(0, slashIdx);
        const modelId = modelKey.slice(slashIdx + 1);

        const config = readUserConfig();
        const prov = config?.models?.providers?.[providerKey];
        if (!prov || !Array.isArray(prov.models)) {
          return { success: false, message: "模型不存在" };
        }

        const idx = prov.models.findIndex((m: any) => {
          const id = typeof m === "string" ? m : m?.id;
          return id === modelId;
        });
        if (idx < 0) {
          return { success: false, message: "模型不存在" };
        }
        // 字符串条目升级为对象格式
        let entry = prov.models[idx];
        if (typeof entry === "string") {
          entry = { id: entry, name: entry, input: ["text"] };
          prov.models[idx] = entry;
        }
        // name 是 gateway schema 必填字段，空别名时回退到 id
        entry.name = alias || entry.id;

        writeUserConfig(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 验证 API Key（复用 provider-config） ──
  ipcMain.handle("settings:verify-key", async (_event, params) => {
    const provider = typeof params?.provider === "string" ? params.provider : "";
    // kimi-code 验证前：确保 proxy 已启动并持有最新 token
    if (params?.subPlatform === "kimi-code" && params?.apiKey) {
      if (getProxyPort() <= 0) {
        await startAuthProxy();
      }
      setProxyAccessToken(params.apiKey);
    }
    return runTrackedSettingsAction("verify_key", { provider }, async () =>
      verifyProvider({ ...params, proxyPort: getProxyPort() }));
  });

  // ── 读取分享文案（内嵌，跟随客户端版本发布） ──
  ipcMain.handle("settings:get-share-copy", () => ({
    success: true,
    data: SHARE_COPY_PAYLOAD,
  }));

  // ── 保存 provider 配置 ──
  ipcMain.handle("settings:save-provider", async (_event, params) => {
    const { provider, apiKey, modelID, baseURL, api, subPlatform, supportImage, customPreset, setAsDefault, modelAlias, action, modelKey, keepProxyAuth } = params;
    const trackedProps = {
      provider,
      model: modelID,
      sub_platform: subPlatform || undefined,
      custom_preset: customPreset || undefined,
    };
    return runTrackedSettingsAction("save_provider", trackedProps, async () => {
      try {
        const config = readUserConfig();

        // 初始化嵌套结构
        config.models ??= {};
        config.models.providers ??= {};
        config.agents ??= {};
        config.agents.defaults ??= {};
        config.agents.defaults.model ??= {};

        if (action === "update" && modelKey) {
          // === 精确更新，不覆写 ===
          const slashIdx = modelKey.indexOf("/");
          if (slashIdx <= 0) throw new Error(`Invalid modelKey: ${modelKey}`);
          const providerKey = modelKey.slice(0, slashIdx);
          const modelId = modelKey.slice(slashIdx + 1);
          const prov = config.models.providers[providerKey];
          if (!prov) throw new Error(`Provider not found: ${providerKey}`);

          // 只更新变更的 provider 级字段（keepProxyAuth 时不覆写）
          if (!keepProxyAuth) {
            if (apiKey && apiKey !== prov.apiKey) prov.apiKey = apiKey;
            if (baseURL && baseURL !== prov.baseUrl) prov.baseUrl = baseURL;
            if (api && api !== prov.api) prov.api = api;

            // 代理模式：将真实 key 存 sidecar，config 中写占位符
            if (subPlatform === "kimi-code" && getProxyPort() > 0) {
              writeKimiApiKey(apiKey);
              setProxyAccessToken(apiKey);
              prov.apiKey = "proxy-managed";
              prov.baseUrl = `http://127.0.0.1:${getProxyPort()}/coding`;
            }
          }

          // 原地更新模型 entry
          if (Array.isArray(prov.models)) {
            const modelIdx = prov.models.findIndex((m: any) => {
              const id = typeof m === "string" ? m : m?.id;
              return id === modelId;
            });
            if (modelIdx >= 0) {
              let entry = prov.models[modelIdx];
              if (typeof entry === "string") {
                entry = { id: entry, name: entry, input: ["text"] };
                prov.models[modelIdx] = entry;
              }
              if (supportImage !== undefined) {
                entry.input = supportImage ? ["text", "image"] : ["text"];
              }
            }
          }

          // 应用别名
          applyModelAlias(prov, modelId, modelAlias);

          // 编辑模式保持默认
          if (setAsDefault === true) {
            config.agents.defaults.model.primary = modelKey;
          }
        } else if (action === "add") {
          // === 新增模型 ===
          if (provider === "moonshot") {
            // Moonshot 路径：使用 saveMoonshotConfig 创建/更新 provider
            const sub = MOONSHOT_SUB_PLATFORMS[subPlatform || "moonshot-cn"];
            const provKey = sub?.providerKey || "moonshot";
            const existingProv = config.models.providers[provKey];

            if (existingProv) {
              const existingModels = Array.isArray(existingProv.models) ? existingProv.models : [];
              const hasModel = existingModels.some((m: any) => {
                const id = typeof m === "string" ? m : m?.id;
                return id === modelID;
              });
              if (hasModel) {
                return { success: false, message: `模型已存在: ${provKey}/${modelID}` };
              }
              if (!keepProxyAuth) {
                existingProv.apiKey = apiKey;
                if (sub) {
                  existingProv.baseUrl = sub.baseUrl;
                  existingProv.api = sub.api;
                }
              }
              if (!Array.isArray(existingProv.models)) existingProv.models = [];
              existingProv.models.push({ id: modelID, name: modelID, input: ["text", "image"] });
            } else {
              // provider 不存在 → 用 saveMoonshotConfig 创建
              const prevPrimary = config.agents.defaults.model.primary;
              saveMoonshotConfig(config, apiKey, modelID, subPlatform);
              // 恢复 primary（add 模式不切换默认）
              if (prevPrimary) {
                config.agents.defaults.model.primary = prevPrimary;
              }
            }

            // 代理模式：将真实 key 存 sidecar，config 中写占位符
            // keepProxyAuth 时代理已就绪，不重写 token
            if (subPlatform === "kimi-code" && getProxyPort() > 0 && !keepProxyAuth) {
              writeKimiApiKey(apiKey);
              setProxyAccessToken(apiKey);
              const provKeyProxy = sub?.providerKey || "kimi-coding";
              if (config.models.providers[provKeyProxy]) {
                config.models.providers[provKeyProxy].apiKey = "proxy-managed";
                config.models.providers[provKeyProxy].baseUrl = `http://127.0.0.1:${getProxyPort()}/coding`;
              }
            }

            // 应用别名
            applyModelAlias(config.models.providers[provKey], modelID, modelAlias);

            // 明确 setAsDefault 时才设默认
            if (setAsDefault === true) {
              config.agents.defaults.model.primary = `${provKey}/${modelID}`;
            }
          } else {
            // 非 Moonshot：解析 configKey
            const customPre = customPreset ? CUSTOM_PROVIDER_PRESETS[customPreset] : undefined;
            const configKey = customPre
              ? customPre.providerKey
              : (provider === "custom" && baseURL) ? deriveCustomConfigKey(baseURL) : provider;
            const existingProv = config.models.providers[configKey];

            if (existingProv) {
              const existingModels = Array.isArray(existingProv.models) ? existingProv.models : [];
              const hasModel = existingModels.some((m: any) => {
                const id = typeof m === "string" ? m : m?.id;
                return id === modelID;
              });
              if (hasModel) {
                return { success: false, message: `模型已存在: ${configKey}/${modelID}` };
              }
              existingProv.apiKey = apiKey;
              if (!Array.isArray(existingProv.models)) existingProv.models = [];
              const input = supportImage !== false ? ["text", "image"] : ["text"];
              existingProv.models.push({ id: modelID, name: modelID, input });
            } else {
              // provider 不存在 → 创建新 provider entry
              config.models.providers[configKey] = buildProviderConfig(provider, apiKey, modelID, baseURL, api, supportImage, customPreset);
            }

            // 应用别名
            applyModelAlias(config.models.providers[configKey], modelID, modelAlias);

            // 明确 setAsDefault 时才设默认
            if (setAsDefault === true) {
              config.agents.defaults.model.primary = `${configKey}/${modelID}`;
            }
          }
        } else {
          // === 兼容旧调用（无 action 字段）：走旧逻辑 ===
          if (provider === "moonshot") {
            const sub = MOONSHOT_SUB_PLATFORMS[subPlatform || "moonshot-cn"];
            const provKey = sub?.providerKey || "moonshot";
            const prevModels: any[] = config.models.providers[provKey]?.models ?? [];

            const prevPrimary = config.agents.defaults.model.primary;
            saveMoonshotConfig(config, apiKey, modelID, subPlatform);

            if (setAsDefault === false && prevPrimary) {
              config.agents.defaults.model.primary = prevPrimary;
            }

            if (subPlatform === "kimi-code" && getProxyPort() > 0) {
              writeKimiApiKey(apiKey);
              setProxyAccessToken(apiKey);
              const provKeyProxy = sub?.providerKey || "kimi-coding";
              config.models.providers[provKeyProxy].apiKey = "proxy-managed";
              config.models.providers[provKeyProxy].baseUrl = `http://127.0.0.1:${getProxyPort()}/coding`;
            }

            mergeModels(config.models.providers[provKey], modelID, prevModels);
            applyModelAlias(config.models.providers[provKey], modelID, modelAlias);
          } else {
            const customPre = customPreset ? CUSTOM_PROVIDER_PRESETS[customPreset] : undefined;
            const configKey = customPre
              ? customPre.providerKey
              : (provider === "custom" && baseURL) ? deriveCustomConfigKey(baseURL) : provider;
            const prevModels: any[] = config.models.providers[configKey]?.models ?? [];

            const providerConfig = buildProviderConfig(provider, apiKey, modelID, baseURL, api, supportImage, customPreset);
            config.models.providers[configKey] = providerConfig;

            if (setAsDefault !== false) {
              config.agents.defaults.model.primary = `${configKey}/${modelID}`;
            }

            mergeModels(config.models.providers[configKey], modelID, prevModels);
            applyModelAlias(config.models.providers[configKey], modelID, modelAlias);
          }
        }

        // 配置 kimi-code 时自动启用搜索插件 + 记忆搜索 embedding
        if (provider === "moonshot" && subPlatform === "kimi-code") {
          saveKimiSearchConfig(config, { enabled: true });
          ensureMemorySearchProxyConfig(config, getProxyPort());
        }

        writeUserConfigAndRestart(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 读取频道配置 ──
  ipcMain.handle("settings:get-channel-config", async () => {
    try {
      const config = readUserConfig();
      const feishu = config?.channels?.feishu ?? {};
      const enabled = isFeishuEnabled(config);
      const dmPolicy = normalizeDmPolicy(feishu?.dmPolicy, "open");
      const allowFrom = normalizeAllowFromEntries(feishu?.allowFrom);
      const dmPolicyOpen = dmPolicy === "open" || allowFrom.includes(WILDCARD_ALLOW_ENTRY);
      const dmScope = normalizeDmScope(config?.session?.dmScope, "main");
      const groupPolicy = normalizeGroupPolicy(feishu?.groupPolicy, "allowlist");
      const groupAllowFrom = normalizeAllowFromEntries(feishu?.groupAllowFrom);
      const topicSessionMode = normalizeTopicSessionMode(feishu?.topicSessionMode, "disabled");
      return {
        success: true,
        data: {
          appId: feishu.appId ?? "",
          appSecret: feishu.appSecret ?? "",
          enabled,
          dmPolicy,
          dmPolicyOpen,
          dmScope,
          groupPolicy,
          groupAllowFrom,
          topicSessionMode,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存频道配置（支持 enabled=false 仅切换开关） ──
  ipcMain.handle("settings:save-channel", async (_event, params) => {
    const { appId, appSecret, enabled } = params;
    const dmPolicy = normalizeDmPolicy(
      params?.dmPolicy,
      params?.dmPolicyOpen === false ? "pairing" : "open"
    );
    const dmScopeInput = params?.dmScope;
    const groupPolicy = normalizeGroupPolicy(params?.groupPolicy, "allowlist");
    const groupAllowFrom = normalizeAllowFromEntries(params?.groupAllowFrom);
    const trackedProps = {
      platform: FEISHU_CHANNEL,
      enabled,
      dm_policy: dmPolicy,
      group_policy: groupPolicy,
    };
    return runTrackedSettingsAction("save_channel", trackedProps, async () => {
      if (groupPolicy === "allowlist") {
        const hasInvalidGroupId = groupAllowFrom.some((entry) => !looksLikeFeishuGroupId(entry));
        if (hasInvalidGroupId) {
          return { success: false, message: "群聊白名单只能填写以 oc_ 开头的群 ID。" };
        }
      }
      try {
        const config = readUserConfig();
        const dmScope = normalizeDmScope(
          dmScopeInput,
          normalizeDmScope(config?.session?.dmScope, "main")
        );

        // 仅禁用 → 不校验凭据
        if (enabled === false) {
          setFeishuChannelEnabled(config, false);
          writeUserConfigAndRestart(config);
          return { success: true };
        }

        // 保存前验证凭据
        try {
          await verifyFeishu(appId, appSecret);
        } catch (err: any) {
          return { success: false, message: err.message || "飞书凭据验证失败" };
        }

        config.channels ??= {};
        // 保留已有飞书策略字段，避免每次保存凭据都把 dmPolicy/allowFrom 覆盖丢失
        const prevFeishu =
          config.channels.feishu && typeof config.channels.feishu === "object"
            ? config.channels.feishu
            : {};
        config.channels.feishu = {
          ...prevFeishu,
          appId,
          appSecret,
        };
        setFeishuChannelEnabled(config, true);

        const currentAllowFrom = normalizeAllowFromEntries(config.channels.feishu.allowFrom);
        const allowFromWithoutWildcard = currentAllowFrom.filter((entry) => entry !== WILDCARD_ALLOW_ENTRY);

        if (dmPolicy === "open") {
          config.channels.feishu.dmPolicy = "open";
          config.channels.feishu.allowFrom = dedupeEntries([
            ...allowFromWithoutWildcard,
            WILDCARD_ALLOW_ENTRY,
          ]);
        } else {
          config.channels.feishu.dmPolicy = dmPolicy;
          if (allowFromWithoutWildcard.length > 0) {
            config.channels.feishu.allowFrom = allowFromWithoutWildcard;
          } else {
            delete config.channels.feishu.allowFrom;
          }
        }
        config.channels.feishu.groupPolicy = groupPolicy;
        if (groupAllowFrom.length > 0) {
          config.channels.feishu.groupAllowFrom = groupAllowFrom;
        } else {
          delete config.channels.feishu.groupAllowFrom;
        }

        // 私聊会话隔离属于全局 session 配置，不是飞书子配置。
        config.session ??= {};
        if (dmScope === "main") {
          delete config.session.dmScope;
          if (Object.keys(config.session).length === 0) {
            delete config.session;
          }
        } else {
          config.session.dmScope = dmScope;
        }
        writeUserConfigAndRestart(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 读取 QQ Bot 配置 ──
  function resolveQqbotMissingMessage(): string {
    // dev 模式最常见的问题是还没执行 package:resources，把 qqbot 插件注入目标资源目录。
    if (!app.isPackaged) {
      return `开发模式未检测到 QQ Bot 插件，请先运行 npm run package:resources（当前目标：${process.platform}-${process.arch}）。`;
    }
    return "QQ Bot 组件缺失，请重新安装 OneClaw。";
  }

  function resolveDingtalkMissingMessage(): string {
    // dev 模式最常见的问题是还没执行 package:resources，把钉钉插件注入目标资源目录。
    if (!app.isPackaged) {
      return `开发模式未检测到钉钉连接器插件，请先运行 npm run package:resources（当前目标：${process.platform}-${process.arch}）。`;
    }
    return "钉钉连接器组件缺失，请重新安装 OneClaw。";
  }

  function resolveWecomMissingMessage(): string {
    // dev 模式最常见的问题是还没执行 package:resources，把企业微信插件注入目标资源目录。
    if (!app.isPackaged) {
      return `开发模式未检测到企业微信插件，请先运行 npm run package:resources（当前目标：${process.platform}-${process.arch}）。`;
    }
    return "企业微信插件组件缺失，请重新安装 OneClaw。";
  }

  ipcMain.handle("settings:get-qqbot-config", async () => {
    try {
      const config = readUserConfig();
      const bundled = isQqbotPluginBundled();
      return {
        success: true,
        data: {
          ...extractQqbotConfig(config),
          bundled,
          bundleMessage: bundled ? "" : resolveQqbotMissingMessage(),
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存 QQ Bot 配置（支持 enabled=false 仅切换开关） ──
  ipcMain.handle("settings:save-qqbot-config", async (_event, params) => {
    const enabled = params?.enabled === true;
    const appId = typeof params?.appId === "string" ? params.appId.trim() : "";
    const clientSecret = typeof params?.clientSecret === "string" ? params.clientSecret.trim() : "";
    const markdownSupport = params?.markdownSupport === true;
    return runTrackedSettingsAction(
      "save_channel",
      { platform: "qqbot", enabled, markdown_support: markdownSupport },
      async () => {
        try {
          const config = readUserConfig();

          if (!enabled) {
            saveQqbotConfig(config, { enabled: false });
            writeUserConfigAndRestart(config);
            return { success: true };
          }

          if (!appId) {
            return { success: false, message: "QQ Bot App ID 不能为空。" };
          }
          if (!clientSecret) {
            return { success: false, message: "QQ Bot Client Secret 不能为空。" };
          }
          if (!isQqbotPluginBundled()) {
            return { success: false, message: resolveQqbotMissingMessage() };
          }

          // 保存前验证凭据
          try {
            await verifyQqbot(appId, clientSecret);
          } catch (err: any) {
            return { success: false, message: err.message || "QQ Bot 凭据验证失败" };
          }

          saveQqbotConfig(config, {
            enabled: true,
            appId,
            clientSecret,
            markdownSupport,
          });
          writeUserConfigAndRestart(config);
          return { success: true };
        } catch (err: any) {
          return { success: false, message: err.message || String(err) };
        }
      }
    );
  });

  // ── 读取钉钉配置 ──
  ipcMain.handle("settings:get-dingtalk-config", async () => {
    try {
      const config = readUserConfig();
      const bundled = isDingtalkPluginBundled();
      return {
        success: true,
        data: {
          ...extractDingtalkConfig(config),
          bundled,
          bundleMessage: bundled ? "" : resolveDingtalkMissingMessage(),
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存钉钉配置（支持 enabled=false 仅切换开关） ──
  ipcMain.handle("settings:save-dingtalk-config", async (_event, params) => {
    const enabled = params?.enabled === true;
    const clientId = typeof params?.clientId === "string" ? params.clientId.trim() : "";
    const clientSecret = typeof params?.clientSecret === "string" ? params.clientSecret.trim() : "";
    const rawSessionTimeout = params?.sessionTimeout;
    const sessionTimeout =
      typeof rawSessionTimeout === "number"
        ? rawSessionTimeout
        : typeof rawSessionTimeout === "string"
          ? Number(rawSessionTimeout.trim())
          : DEFAULT_DINGTALK_SESSION_TIMEOUT_MS;

    return runTrackedSettingsAction(
      "save_channel",
      { platform: "dingtalk", enabled, session_timeout: sessionTimeout },
      async () => {
        try {
          const config = readUserConfig();

          if (!enabled) {
            saveDingtalkConfig(config, { enabled: false });
            writeUserConfigAndRestart(config);
            return { success: true };
          }

          if (!clientId) {
            return { success: false, message: "钉钉 Client ID / AppKey 不能为空。" };
          }
          if (!clientSecret) {
            return { success: false, message: "钉钉 Client Secret / AppSecret 不能为空。" };
          }
          if (!Number.isFinite(sessionTimeout) || sessionTimeout <= 0) {
            return { success: false, message: "会话超时必须是大于 0 的毫秒数。" };
          }
          if (!isDingtalkPluginBundled()) {
            return { success: false, message: resolveDingtalkMissingMessage() };
          }

          // 保存前验证凭据
          try {
            await verifyDingtalk(clientId, clientSecret);
          } catch (err: any) {
            return { success: false, message: err.message || "钉钉凭据验证失败" };
          }

          saveDingtalkConfig(config, {
            enabled: true,
            clientId,
            clientSecret,
            sessionTimeout,
          });
          writeUserConfigAndRestart(config);
          return { success: true };
        } catch (err: any) {
          return { success: false, message: err.message || String(err) };
        }
      }
    );
  });

  // ── 读取企业微信配置 ──
  ipcMain.handle("settings:get-wecom-config", async () => {
    try {
      const config = readUserConfig();
      const bundled = isWecomPluginBundled();
      return {
        success: true,
        data: {
          ...extractWecomConfig(config),
          bundled,
          bundleMessage: bundled ? "" : resolveWecomMissingMessage(),
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存企业微信配置（支持 enabled=false 仅切换开关） ──
  ipcMain.handle("settings:save-wecom-config", async (_event, params) => {
    const enabled = params?.enabled === true;
    const botId = typeof params?.botId === "string" ? params.botId.trim() : "";
    const secret = typeof params?.secret === "string" ? params.secret.trim() : "";
    const dmPolicy = typeof params?.dmPolicy === "string" ? params.dmPolicy.trim() : "";
    const groupPolicy = typeof params?.groupPolicy === "string" ? params.groupPolicy.trim() : "";
    const groupAllowFrom = Array.isArray(params?.groupAllowFrom) ? params.groupAllowFrom : [];

    return runTrackedSettingsAction(
      "save_channel",
      { platform: "wecom", enabled, dm_policy: dmPolicy || undefined, group_policy: groupPolicy || undefined },
      async () => {
        try {
          const config = readUserConfig();

          if (!enabled) {
            saveWecomConfig(config, { enabled: false });
            writeUserConfigAndRestart(config);
            return { success: true };
          }

          if (!botId) {
            return { success: false, message: "企业微信 Bot ID 不能为空。" };
          }
          if (!secret) {
            return { success: false, message: "企业微信 Secret 不能为空。" };
          }
          if (!isWecomPluginBundled()) {
            return { success: false, message: resolveWecomMissingMessage() };
          }

          // 保存前验证凭据，避免坏配置写入后导致 gateway 启动失败
          try {
            await verifyWecom(botId, secret);
          } catch (err: any) {
            return { success: false, message: err.message || "企业微信凭据验证失败" };
          }

          saveWecomConfig(config, {
            enabled: true,
            botId,
            secret,
            dmPolicy,
            groupPolicy,
            groupAllowFrom,
          });
          writeUserConfigAndRestart(config);
          return { success: true };
        } catch (err: any) {
          return { success: false, message: err.message || String(err) };
        }
      }
    );
  });

  // ── 列出企业微信已授权用户与群聊 ──
  ipcMain.handle("settings:list-wecom-approved", async () => {
    try {
      const config = readUserConfig();
      const wecomConfig = config?.channels?.[WECOM_CHANNEL_ID] ?? {};
      const userEntries = collectApprovedUserIds(
        WECOM_CHANNEL_ID,
        wecomConfig?.allowFrom,
      ).map((id) => ({ kind: "user" as const, id, name: id }));
      const groupEntries = normalizeAllowFromEntries(wecomConfig?.groupAllowFrom)
        .map((id) => ({ kind: "group" as const, id, name: id }));
      const entries: FeishuAuthorizedEntryView[] = [...userEntries, ...groupEntries];
      entries.sort(compareAuthorizedEntry);
      return { success: true, data: { entries } };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 删除企业微信已授权用户/群聊 ──
  ipcMain.handle("settings:remove-wecom-approved", async (_event, params) => {
    const kind = params?.kind === "group" ? "group" : "user";
    const id = typeof params?.id === "string" ? params.id.trim() : "";
    if (!id) {
      return { success: false, message: "授权 ID 不能为空。" };
    }
    try {
      const config = readUserConfig();
      config.channels ??= {};
      config.channels[WECOM_CHANNEL_ID] ??= {};

      if (kind === "group") {
        const nextGroupAllowFrom = normalizeAllowFromEntries(config.channels[WECOM_CHANNEL_ID].groupAllowFrom)
          .filter((entry) => entry !== id);
        config.channels[WECOM_CHANNEL_ID].groupAllowFrom = nextGroupAllowFrom;
      } else {
        const nextAllowFrom = normalizeAllowFromEntries(config.channels[WECOM_CHANNEL_ID].allowFrom)
          .filter((entry) => entry !== id && entry !== WILDCARD_ALLOW_ENTRY);
        if (nextAllowFrom.length > 0) {
          config.channels[WECOM_CHANNEL_ID].allowFrom = nextAllowFrom;
        } else {
          delete config.channels[WECOM_CHANNEL_ID].allowFrom;
        }

        const nextStoreAllowFrom = readChannelAllowFromStore(WECOM_CHANNEL_ID).filter((entry) => entry !== id);
        writeChannelAllowFromStore(WECOM_CHANNEL_ID, nextStoreAllowFrom);
      }

      writeUserConfigAndRestart(config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 读取微信配置 ──
  ipcMain.handle("settings:get-weixin-config", async () => {
    try {
      const config = readUserConfig();
      const extracted = extractWeixinConfig(config);
      const accounts = listWeixinAccountIds();
      return {
        success: true,
        data: {
          ...extracted,
          bundled: isWeixinPluginBundled(),
          accounts,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 保存微信配置（仅 enabled 开关） ──
  ipcMain.handle("settings:save-weixin-config", async (_event, params) => {
    const enabled = params?.enabled === true;
    return runTrackedSettingsAction(
      "save_channel",
      { platform: "weixin", enabled },
      async () => {
        try {
          const config = readUserConfig();
          saveWeixinConfig(config, { enabled });
          writeUserConfigAndRestart(config);
          return { success: true };
        } catch (err: any) {
          return { success: false, message: err.message || String(err) };
        }
      },
    );
  });

  // ── 微信扫码登录 — 启动（直接调用 iLink HTTP API，绕过 Gateway RPC） ──
  ipcMain.handle("settings:weixin-login-start", async () => {
    try {
      const result = await startWeixinQrLogin();
      return {
        success: true,
        data: {
          qrDataUrl: result.qrcodeUrl,
          qrcode: result.qrcode,
          message: result.message,
        },
      };
    } catch (err: any) {
      console.error("[weixin] login-start error:", err.message);
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 微信扫码登录 — 轮询扫码结果（直接调用 iLink HTTP API） ──
  ipcMain.handle("settings:weixin-login-wait", async (_event, params) => {
    try {
      const qrcode = typeof params?.qrcode === "string" ? params.qrcode : "";
      if (!qrcode) {
        return { success: false, message: "缺少 qrcode。" };
      }
      const result = await pollWeixinQrStatus(qrcode);

      // 扫码确认成功 → 保存凭据并重启 Gateway
      if (result.status === "confirmed" && result.accountId && result.botToken) {
        const config = readUserConfig();
        const normalizedId = persistWeixinLoginSuccess(config, result);
        writeUserConfigAndRestart(config);
        return {
          success: true,
          data: {
            connected: true,
            message: "✅ 与微信连接成功！",
            accountId: normalizedId,
          },
        };
      }

      return {
        success: true,
        data: {
          connected: false,
          status: result.status,
          message:
            result.status === "scaned" ? "已扫码，请在微信中确认…" :
            result.status === "expired" ? "二维码已过期，请重新生成。" :
            "等待扫码…",
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 清除微信账号（断开连接） ──
  ipcMain.handle("settings:weixin-clear-accounts", async () => {
    try {
      clearWeixinAccounts();
      opts.requestGatewayRestart?.();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 列出飞书已授权列表（用户 + 群聊，优先展示可读名称） ──
  ipcMain.handle("settings:list-feishu-approved", async () => {
    try {
      const config = readUserConfig();
      const feishuConfig = config?.channels?.feishu ?? {};
      const configEntries = normalizeAllowFromEntries(feishuConfig?.allowFrom);
      const storeEntries = readFeishuAllowFromStore();
      const aliases = readFeishuAliasStore();

      const userEntries = dedupeEntries([...storeEntries, ...configEntries])
        .filter((entry) => entry !== WILDCARD_ALLOW_ENTRY)
        .map((id) => toAuthorizedEntryView("user", id, aliases))
        .sort((a, b) => compareAuthorizedEntry(a, b));

      const groupEntries = normalizeAllowFromEntries(feishuConfig?.groupAllowFrom)
        .map((id) => toAuthorizedEntryView("group", id, aliases))
        .sort((a, b) => compareAuthorizedEntry(a, b));

      const entries: FeishuAuthorizedEntryView[] = [...userEntries, ...groupEntries];
      const enrichedEntries = await enrichFeishuEntryNames(entries, feishuConfig);
      enrichedEntries.sort((a, b) => compareAuthorizedEntry(a, b));
      return { success: true, data: { entries: enrichedEntries } };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 添加群聊白名单条目（仅允许群 ID） ──
  ipcMain.handle("settings:add-feishu-group-allow-from", async (_event, params) => {
    const id = String(params?.id ?? "").trim();
    if (!looksLikeFeishuGroupId(id)) {
      return { success: false, message: "仅允许填写以 oc_ 开头的群 ID。" };
    }

    try {
      const config = readUserConfig();
      config.channels ??= {};
      config.channels.feishu ??= {};
      const nextGroupAllowFrom = dedupeEntries([
        ...normalizeAllowFromEntries(config.channels.feishu.groupAllowFrom),
        id,
      ]);
      config.channels.feishu.groupAllowFrom = nextGroupAllowFrom;
      writeUserConfigAndRestart(config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 删除飞书已授权条目（用户/群聊） ──
  ipcMain.handle("settings:remove-feishu-approved", async (_event, params) => {
    const kind = String(params?.kind ?? "").trim().toLowerCase() === "group" ? "group" : "user";
    const id = String(params?.id ?? "").trim();
    if (!id) {
      return { success: false, message: "授权条目标识不能为空。" };
    }

    try {
      const config = readUserConfig();
      config.channels ??= {};
      config.channels.feishu ??= {};

      if (kind === "group") {
        const nextGroupAllowFrom = normalizeAllowFromEntries(config.channels.feishu.groupAllowFrom)
          .filter((entry) => entry !== id);
        if (nextGroupAllowFrom.length > 0) {
          config.channels.feishu.groupAllowFrom = nextGroupAllowFrom;
        } else {
          delete config.channels.feishu.groupAllowFrom;
        }
        removeFeishuAlias("group", id);
        writeUserConfigAndRestart(config);
        return { success: true };
      }

      const nextAllowFrom = normalizeAllowFromEntries(config.channels.feishu.allowFrom)
        .filter((entry) => entry !== id);
      if (nextAllowFrom.length > 0) {
        config.channels.feishu.allowFrom = nextAllowFrom;
      } else {
        delete config.channels.feishu.allowFrom;
      }

      const nextStoreAllowFrom = readFeishuAllowFromStore().filter((entry) => entry !== id);
      writeFeishuAllowFromStore(nextStoreAllowFrom);
      removeFeishuAlias("user", id);
      writeUserConfigAndRestart(config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 读取 Kimi 插件配置 ──
  ipcMain.handle("settings:get-kimi-config", async () => {
    try {
      const config = readUserConfig();
      return { success: true, data: extractKimiConfig(config) };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存 Kimi 插件配置（支持 enabled=false 仅切换开关；wsURL/kimiapiHost 为可选覆盖） ──
  ipcMain.handle("settings:save-kimi-config", async (_event, params) => {
    const botToken = typeof params?.botToken === "string" ? params.botToken.trim() : "";
    const wsURL = typeof params?.wsURL === "string" ? params.wsURL.trim() : "";
    const kimiapiHost = typeof params?.kimiapiHost === "string" ? params.kimiapiHost.trim() : "";
    const enabled = params?.enabled;
    return runTrackedSettingsAction("save_kimi", { enabled }, async () => {
      try {
        const config = readUserConfig();
        config.plugins ??= {};
        config.plugins.entries ??= {};

        // 仅禁用 → 不校验 token
        if (enabled === false) {
          if (config.plugins.entries["kimi-claw"]) {
            config.plugins.entries["kimi-claw"].enabled = false;
          }
          if (config.plugins.entries["kimi-search"]) {
            config.plugins.entries["kimi-search"].enabled = false;
          }
          writeUserConfigAndRestart(config);
          return { success: true };
        }

        if (!botToken) {
          return { success: false, message: "Kimi Bot Token 不能为空。" };
        }
        if (!isKimiPluginBundled()) {
          return { success: false, message: "Kimi Channel 组件缺失，请重新安装 OneClaw。" };
        }

        const gatewayToken = ensureGatewayAuthTokenInConfig(config);
        // kimiapiHost 同时控制 kimi-claw（IM subscribe base_url）与 kimi-search（serviceBaseUrl）
        // 传 undefined（未提供）→ 保留存量；传空串 → 清回默认。
        saveKimiPluginConfig(config, {
          botToken,
          gatewayToken,
          wsURL: wsURL || undefined,
          kimiapiHost: typeof params?.kimiapiHost === "string" ? kimiapiHost : undefined,
        });
        // kimi-search 联动：显式提供 kimiapiHost（含空串）都同步写；未提供则保留存量
        if (typeof params?.kimiapiHost === "string") {
          saveKimiSearchConfig(config, { enabled: true, serviceBaseUrl: kimiapiHost });
        }
        writeUserConfigAndRestart(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 读取 Kimi Search 配置 ──
  ipcMain.handle("settings:get-kimi-search-config", async () => {
    try {
      const config = readUserConfig();
      return { success: true, data: extractKimiSearchConfig(config) };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存 Kimi Search 配置 ──
  ipcMain.handle("settings:save-kimi-search-config", async (_event, params) => {
    const enabled = params?.enabled === true;
    const apiKey = typeof params?.apiKey === "string" ? params.apiKey : undefined;
    const serviceBaseUrl = typeof params?.serviceBaseUrl === "string" ? params.serviceBaseUrl : undefined;
    return runTrackedSettingsAction("save_kimi_search", { enabled }, async () => {
      try {
        if (enabled && !isKimiSearchPluginBundled()) {
          return { success: false, message: "Kimi Search 组件缺失，请重新安装 OneClaw。" };
        }
        // 专属 key 存到 sidecar 文件，不写入 openclaw.json
        if (typeof apiKey === "string") {
          writeKimiSearchDedicatedApiKey(apiKey);
          setProxySearchDedicatedKey(apiKey);
        }
        const config = readUserConfig();
        saveKimiSearchConfig(config, { enabled, serviceBaseUrl });
        writeUserConfigAndRestart(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 读取记忆配置 ──
  ipcMain.handle("settings:get-memory-config", async () => {
    try {
      const config = readUserConfig();
      // session-memory hook
      const hookEntry = config?.hooks?.internal?.entries?.["session-memory"];
      const sessionMemoryEnabled = hookEntry?.enabled !== false;
      // embedding：有 provider + model 配置即为启用（memorySearch.enabled 控制整个搜索工具，不在此处判断）
      const ms = config?.agents?.defaults?.memorySearch;
      const embeddingEnabled = ms?.provider === "openai" && !!ms?.model;
      // kimi-code 是否已配置
      const isKimiCodeConfigured = !!(config?.models?.providers?.["kimi-coding"]?.apiKey);
      return { success: true, data: { sessionMemoryEnabled, embeddingEnabled, isKimiCodeConfigured } };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存记忆配置 ──
  ipcMain.handle("settings:save-memory-config", async (_event, params) => {
    try {
      const config = readUserConfig();
      // session-memory hook
      config.hooks ??= {};
      config.hooks.internal ??= {};
      config.hooks.internal.entries ??= {};
      config.hooks.internal.entries["session-memory"] = {
        ...(config.hooks.internal.entries["session-memory"] ?? {}),
        enabled: params?.sessionMemoryEnabled !== false,
      };
      // embedding 开关：只控制 provider/model，不碰 memorySearch.enabled（关键词搜索始终可用）
      if (params?.embeddingEnabled === true) {
        ensureMemorySearchProxyConfig(config, getProxyPort());
      } else if (params?.embeddingEnabled === false && config?.agents?.defaults?.memorySearch) {
        delete config.agents.defaults.memorySearch.provider;
        delete config.agents.defaults.memorySearch.model;
        delete config.agents.defaults.memorySearch.remote;
      }
      writeUserConfigAndRestart(config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 查询 Kimi 会员用量（GET /v1/usages） ──
  ipcMain.handle("kimi:get-usage", async () => {
    try {
      const config = readUserConfig();
      const info = extractProviderInfo(config);
      // 仅 kimi-code 子平台支持用量查询
      if (info.provider !== "moonshot" || info.subPlatform !== "kimi-code") {
        return { success: false, message: "Usage is only available for Kimi." };
      }
      const { loadOAuthToken, refreshOAuthToken } = await import("./kimi-oauth");
      const url = "https://api.kimi.com/coding/v1/usages";

      // 解析 API Key：优先 OAuth token，回退到配置中的 key
      const resolveApiKey = (): string => {
        const oauthToken = loadOAuthToken();
        if (oauthToken?.access_token) return oauthToken.access_token;
        return readKimiApiKey() || "";
      };

      let apiKey = resolveApiKey();
      if (!apiKey) {
        return { success: false, message: "No API key available." };
      }

      // 首次请求
      let resp = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15000),
      });

      // 401 且有 OAuth token → 尝试刷新后重试一次
      if (resp.status === 401) {
        const oauthToken = loadOAuthToken();
        if (oauthToken?.refresh_token) {
          try {
            await refreshOAuthToken(oauthToken);
            apiKey = resolveApiKey();
            resp = await fetch(url, {
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(15000),
            });
          } catch {
            // 刷新失败，返回原始 401
          }
        }
      }

      if (!resp.ok) {
        return { success: false, message: `HTTP ${resp.status}` };
      }
      const payload = await resp.json();
      return { success: true, data: payload };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 读取高级配置（browser profile + iMessage） ──
  ipcMain.handle("settings:get-advanced", async () => {
    try {
      const config = readUserConfig();
      const launchAtLoginState = getLaunchAtLoginState(app);
      // session-memory hook：未配置过视为开启（存量用户默认开启）
      const sessionMemoryEntry = config?.hooks?.internal?.entries?.["session-memory"];
      const sessionMemoryEnabled = sessionMemoryEntry?.enabled !== false;
      return {
        success: true,
        data: {
          browserProfile: config?.browser?.defaultProfile ?? "openclaw",
          imessageEnabled: config?.channels?.imessage?.enabled !== false,
          launchAtLoginSupported: launchAtLoginState.supported,
          launchAtLogin: launchAtLoginState.enabled,
          sessionMemoryEnabled,
          clawHubRegistry: readSkillStoreRegistry(),
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存高级配置 ──
  ipcMain.handle("settings:save-advanced", async (_event, params) => {
    const { browserProfile, imessageEnabled } = params;
    const launchAtLogin = typeof params?.launchAtLogin === "boolean" ? params.launchAtLogin : undefined;
    const sessionMemoryEnabled = typeof params?.sessionMemoryEnabled === "boolean" ? params.sessionMemoryEnabled : undefined;
    const clawHubRegistry = typeof params?.clawHubRegistry === "string" ? params.clawHubRegistry.trim() : undefined;
    return runTrackedSettingsAction(
      "save_advanced",
      { browser_profile: browserProfile, imessage_enabled: imessageEnabled, launch_at_login: launchAtLogin, session_memory: sessionMemoryEnabled },
      async () => {
        try {
          const config = readUserConfig();

          config.browser ??= {};
          // Settings 的 UI 值可能来自旧版本，保存前统一规整到当前 gateway 支持的 profile。
          config.browser.defaultProfile = normalizeRequestedBrowserProfileForSave(config, browserProfile);
          migrateBrowserProfileForCurrentGateway(config);

          config.channels ??= {};
          config.channels.imessage ??= {};
          config.channels.imessage.enabled = imessageEnabled;

          if (typeof launchAtLogin === "boolean") {
            setLaunchAtLoginEnabled(app, launchAtLogin);
          }

          // 写入 session-memory hook 开关
          if (typeof sessionMemoryEnabled === "boolean") {
            config.hooks ??= {};
            config.hooks.internal ??= { enabled: true, entries: {} };
            config.hooks.internal.enabled = true;
            config.hooks.internal.entries ??= {};
            config.hooks.internal.entries["session-memory"] = { enabled: sessionMemoryEnabled };
          }

          // ClawHub Registry URL 写入独立文件（不污染 gateway config）
          if (clawHubRegistry !== undefined) {
            writeSkillStoreRegistry(clawHubRegistry);
          }

          writeUserConfigAndRestart(config);
          return { success: true };
        } catch (err: any) {
          return { success: false, message: err.message || String(err) };
        }
      }
    );
  });

  // ── 读取 CLI 状态（enabled=用户偏好，installed=当前/旧版 wrapper 足迹） ──
  ipcMain.handle("settings:get-cli-status", async () => {
    try {
      return {
        success: true,
        data: getCliStatus(),
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 安装 CLI（老用户迁移入口，默认不阻断其它设置流程） ──
  ipcMain.handle("settings:install-cli", async () => {
    const result = await installCli();
    if (result.success) {
      analytics.track("cli_installed", { method: "settings" });
    } else {
      analytics.track("cli_install_failed", { method: "settings", error: result.message });
    }
    return result;
  });

  // ── 卸载 CLI（移除 wrapper + PATH 注入块） ──
  ipcMain.handle("settings:uninstall-cli", async () => {
    const result = await uninstallCli();
    if (result.success) {
      analytics.track("cli_uninstalled", { method: "settings" });
    } else {
      analytics.track("cli_uninstall_failed", { method: "settings", error: result.message });
    }
    return result;
  });

  // ── 列出配置备份与恢复元数据 ──
  ipcMain.handle("settings:list-config-backups", async () => {
    try {
      return { success: true, data: getConfigRecoveryData() };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 从指定备份文件恢复配置 ──
  ipcMain.handle("settings:restore-config-backup", async (_event, params) => {
    const fileName = typeof params?.fileName === "string" ? params.fileName : "";
    try {
      if (!fileName) {
        return { success: false, message: "请选择要恢复的备份文件。" };
      }
      restoreUserConfigBackup(fileName);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 一键恢复最近一次可启动快照 ──
  ipcMain.handle("settings:restore-last-known-good", async () => {
    try {
      restoreLastKnownGoodConfigSnapshot();
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 恢复配置：删除 openclaw.json 并重启应用，保留历史目录 ──
  // 返回 OneClaw 和 OpenClaw 版本信息
  ipcMain.handle("settings:get-about-info", async () => {
    const oneClawVersion = app.getVersion();
    let openClawVersion = "unknown";
    try {
      const pkgPath = path.join(resolveGatewayPackageDir(), "package.json");
      const raw = fs.readFileSync(pkgPath, "utf-8");
      const pkg = JSON.parse(raw);
      if (pkg.version) openClawVersion = pkg.version;
    } catch {}
    return { oneClawVersion, openClawVersion };
  });

  ipcMain.handle("settings:reset-config-and-relaunch", async () => {
    try {
      const configPath = resolveUserConfigPath();
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
      }

      // 删除所有影响 detectOwnership() 判定的标记文件，确保重启后进入 Setup
      const stateDir = resolveUserStateDir();
      for (const marker of [
        resolveOneclawConfigPath(),                                   // "oneclaw" 归属标记
        path.join(stateDir, "openclaw-setup-baseline.json"),          // "legacy-oneclaw" 标记
        path.join(stateDir, "openclaw.last-known-good.json"),         // last-known-good 快照
      ]) {
        if (fs.existsSync(marker)) {
          fs.unlinkSync(marker);
        }
      }

      // 清除 BrowserWindow 的 localStorage（分享弹窗计数器等），确保恢复出厂后状态彻底重置
      try {
        await session.defaultSession.clearStorageData({ storages: ["localstorage"] });
      } catch {
        // 清理失败不阻塞重启
      }

      app.relaunch();
      setTimeout(() => {
        app.exit(0);
      }, 100);

      return {
        success: true,
        data: {
          configPath,
          preservedStateDir: resolveUserStateDir(),
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

}

// 列出飞书待审批请求：解析 CLI 输出并统一成前端可消费结构。
export async function listFeishuPairingRequests(): Promise<{
  success: boolean;
  requests: FeishuPairingRequestView[];
  message?: string;
}> {
  return listChannelPairingRequests(FEISHU_CHANNEL, "读取飞书待审批列表失败", "解析飞书待审批列表失败");
}

// 列出企业微信待审批请求：解析 CLI 输出并统一成前端可消费结构。
export async function listWecomPairingRequests(): Promise<{
  success: boolean;
  requests: PairingRequestView[];
  message?: string;
}> {
  return listChannelPairingRequests(WECOM_CHANNEL_ID, "读取企业微信待审批列表失败", "解析企业微信待审批列表失败");
}

// 批准飞书配对请求：调用 CLI 并在成功后缓存用户别名用于展示。
export async function approveFeishuPairingRequest(params: Record<string, unknown>): Promise<{
  success: boolean;
  message?: string;
}> {
  const id = typeof params?.id === "string" ? params.id.trim() : "";
  const name = typeof params?.name === "string" ? params.name.trim() : "";
  const result = await approveChannelPairingRequest(FEISHU_CHANNEL, params);
  if (result.success && id && name) {
    saveFeishuAlias("user", id, name);
  }
  return result;
}

// 批准企业微信配对请求：调用 CLI，并在成功后清理本地拒绝码。
export async function approveWecomPairingRequest(params: Record<string, unknown>): Promise<{
  success: boolean;
  message?: string;
}> {
  return approveChannelPairingRequest(WECOM_CHANNEL_ID, params);
}

// 拒绝飞书配对请求：当前 openclaw pairing 无 reject 子命令，改为本地忽略当前配对码。
export async function rejectFeishuPairingRequest(params: Record<string, unknown>): Promise<{
  success: boolean;
  message?: string;
}> {
  return rejectChannelPairingRequest(FEISHU_CHANNEL, params);
}

// 拒绝企业微信配对请求：当前 openclaw pairing 无 reject 子命令，改为本地忽略当前配对码。
export async function rejectWecomPairingRequest(params: Record<string, unknown>): Promise<{
  success: boolean;
  message?: string;
}> {
  return rejectChannelPairingRequest(WECOM_CHANNEL_ID, params);
}

// 统一解析某个渠道的待审批列表，并过滤本地 sidecar 里的拒绝码。
async function listChannelPairingRequests(
  channel: string,
  listErrorMessage: string,
  parseErrorMessage: string,
): Promise<{
  success: boolean;
  requests: PairingRequestView[];
  message?: string;
}> {
  try {
    const run = await runGatewayCli(["pairing", "list", channel, "--json"]);
    if (run.code !== 0) {
      return {
        success: false,
        requests: [],
        message: compactCliError(run, listErrorMessage),
      };
    }

    const parsed = parseJsonSafe(run.stdout);
    if (!parsed || !Array.isArray(parsed?.requests)) {
      return {
        success: false,
        requests: [],
        message: compactCliError(run, parseErrorMessage),
      };
    }

    const rawRequests = Array.isArray(parsed?.requests) ? parsed.requests : [];
    const parsedRequests: PairingRequestView[] = rawRequests.map((item: any) => ({
      code: String(item?.code ?? ""),
      id: String(item?.id ?? ""),
      name: String(item?.meta?.name ?? item?.name ?? ""),
      createdAt: String(item?.createdAt ?? ""),
      lastSeenAt: String(item?.lastSeenAt ?? ""),
    }));
    const rejectedCodes = new Set(readRejectedPairingCodes(resolveRejectedPairingStoreFile(channel)));
    const requests = parsedRequests.filter((item) => !rejectedCodes.has(item.code));
    if (rejectedCodes.size > 0) {
      const activeCodes = new Set(parsedRequests.map((item) => item.code));
      pruneRejectedPairingCodes(resolveRejectedPairingStoreFile(channel), activeCodes);
    }
    return { success: true, requests };
  } catch (err: any) {
    return {
      success: false,
      requests: [],
      message: err?.message || String(err),
    };
  }
}

// 统一执行渠道 pairing approve，避免每个渠道重复拼 CLI 参数。
async function approveChannelPairingRequest(
  channel: string,
  params: Record<string, unknown>,
): Promise<{
  success: boolean;
  message?: string;
}> {
  const code = typeof params?.code === "string" ? params.code.trim() : "";
  if (!code) {
    return { success: false, message: "配对码不能为空。" };
  }

  try {
    const run = await runGatewayCli(["pairing", "approve", channel, code, "--notify"]);
    if (run.code !== 0) {
      return {
        success: false,
        message: compactCliError(run, `批准配对码失败: ${code}`),
      };
    }
    removeRejectedPairingCode(resolveRejectedPairingStoreFile(channel), code);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) };
  }
}

// 当前 openclaw pairing 暂无 reject 子命令，这里统一用本地 sidecar 忽略当前 pairing code。
async function rejectChannelPairingRequest(
  channel: string,
  params: Record<string, unknown>,
): Promise<{
  success: boolean;
  message?: string;
}> {
  const code = typeof params?.code === "string" ? params.code.trim() : "";
  if (!code) {
    return { success: false, message: "配对码不能为空。" };
  }
  appendRejectedPairingCode(resolveRejectedPairingStoreFile(channel), code);
  return { success: true };
}

// 根据配置与授权存储统计当前已授权用户，排除通配符与空值。
function collectApprovedUserIds(channel: string, configAllowFrom: unknown): string[] {
  const configEntries = normalizeAllowFromEntries(configAllowFrom).filter(
    (entry) => entry !== WILDCARD_ALLOW_ENTRY
  );
  const storeEntries = readChannelAllowFromStore(channel);
  return dedupeEntries([...configEntries, ...storeEntries]);
}

// 统一运行 openclaw CLI 子命令，复用 OneClaw 内嵌 runtime 与网关入口。
async function runGatewayCli(args: string[]): Promise<CliRunResult> {
  const nodeBin = resolveNodeBin();
  const entry = resolveGatewayEntry();
  const cwd = resolveGatewayCwd();
  const runtimeDir = path.join(resolveResourcesPath(), "runtime");
  const envPath = runtimeDir + path.delimiter + (process.env.PATH ?? "");

  return new Promise((resolve, reject) => {
    const child = spawn(nodeBin, [entry, ...args], {
      cwd,
      env: {
        ...process.env,
        ...resolveNodeExtraEnv(),
        // 统一关闭入口二次 respawn，保证所有短命 CLI 子命令都静默运行
        OPENCLAW_NO_RESPAWN: "1",
        PATH: envPath,
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        code: typeof code === "number" ? code : -1,
        stdout,
        stderr,
      });
    });
  });
}

// 安全解析 JSON，失败时返回 null，避免界面因格式波动崩溃。
function parseJsonSafe(text: string): any | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // CLI 可能在 JSON 前打印插件日志，这里回退到“提取末尾 JSON 对象”策略。
    const match = trimmed.match(/\{[\s\S]*\}\s*$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

// 压缩 CLI 错误信息，优先保留有用输出并附带兜底描述。
function compactCliError(run: CliRunResult, fallback: string): string {
  const out = run.stderr.trim() || run.stdout.trim();
  if (!out) return fallback;
  const firstLine = out.split(/\r?\n/).find((line) => line.trim().length > 0);
  return firstLine ? firstLine.trim() : fallback;
}

// 规范化 allowFrom 列表，统一转换为非空字符串并去重。
function normalizeAllowFromEntries(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return dedupeEntries(
    input
      .map((entry) => String(entry ?? "").trim())
      .filter((entry) => entry.length > 0)
  );
}

// 数组去重并保持原始顺序。
function dedupeEntries(items: string[]): string[] {
  return [...new Set(items)];
}

// 统一解析 pairing allowFrom store 文件（由 openclaw pairing approve 写入）。
function readChannelAllowFromStore(channel: string): string[] {
  return readChannelAllowFromStoreEntriesFromFs(
    path.join(resolveUserStateDir(), "credentials"),
    channel,
  );
}

// 写入 pairing allowFrom store 文件（兼容保留原有字段）。
function writeChannelAllowFromStore(channel: string, entries: string[]): void {
  writeChannelAllowFromStoreEntriesFromFs(
    path.join(resolveUserStateDir(), "credentials"),
    channel,
    entries,
  );
}

// 读取本地"已拒绝配对码"sidecar，用于过滤待审批列表。
function readRejectedPairingStore(fileName: string): FeishuRejectedPairingStore {
  const filePath = path.join(resolveUserStateDir(), "credentials", fileName);
  if (!fs.existsSync(filePath)) {
    return { version: 1, codes: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = parseJsonSafe(raw);
    const codes = normalizeAllowFromEntries(parsed?.codes);
    return { version: 1, codes };
  } catch {
    return { version: 1, codes: [] };
  }
}

// 写入本地"已拒绝配对码"sidecar，空数组时删除文件。
function writeRejectedPairingStore(fileName: string, codes: string[]): void {
  const normalized = normalizeAllowFromEntries(codes);
  const dir = path.join(resolveUserStateDir(), "credentials");
  const filePath = path.join(dir, fileName);
  if (normalized.length === 0) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }
  fs.mkdirSync(dir, { recursive: true });
  const payload: FeishuRejectedPairingStore = {
    version: 1,
    codes: normalized,
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

function readRejectedPairingCodes(fileName: string): string[] {
  return readRejectedPairingStore(fileName).codes;
}

function appendRejectedPairingCode(fileName: string, code: string): void {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return;
  const store = readRejectedPairingStore(fileName);
  if (store.codes.includes(trimmed)) return;
  store.codes.push(trimmed);
  writeRejectedPairingStore(fileName, store.codes);
}

function removeRejectedPairingCode(fileName: string, code: string): void {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return;
  const store = readRejectedPairingStore(fileName);
  const nextCodes = store.codes.filter((item) => item !== trimmed);
  if (nextCodes.length === store.codes.length) return;
  writeRejectedPairingStore(fileName, nextCodes);
}

function pruneRejectedPairingCodes(fileName: string, activeCodes: Set<string>): void {
  const store = readRejectedPairingStore(fileName);
  if (store.codes.length === 0) return;
  const nextCodes = store.codes.filter((code) => activeCodes.has(code));
  if (nextCodes.length === store.codes.length) return;
  writeRejectedPairingStore(fileName, nextCodes);
}

function resolveRejectedPairingStoreFile(channel: string): string {
  if (channel === WECOM_CHANNEL_ID) {
    return WECOM_REJECTED_PAIRING_STORE_FILE;
  }
  return FEISHU_REJECTED_PAIRING_STORE_FILE;
}

// 读取飞书 allowFrom store 文件（由 openclaw pairing approve 写入）。
function readFeishuAllowFromStore(): string[] {
  return readChannelAllowFromStore(FEISHU_CHANNEL);
}

// 写入飞书 allowFrom store 文件（兼容保留原有字段）。
function writeFeishuAllowFromStore(entries: string[]): void {
  writeChannelAllowFromStore(FEISHU_CHANNEL, entries);
}

// 补全授权条目的可读名称：用户/群聊优先查缓存，未命中则实时查询并回写缓存。
async function enrichFeishuEntryNames(
  entries: FeishuAuthorizedEntryView[],
  feishuConfig: Record<string, unknown>,
): Promise<FeishuAuthorizedEntryView[]> {
  const appId = String(feishuConfig?.appId ?? "").trim();
  const appSecret = String(feishuConfig?.appSecret ?? "").trim();
  if (!appId || !appSecret || entries.length === 0) {
    return entries;
  }

  const userTargets = entries.filter(
    (entry) => entry.kind === "user" && !entry.name && looksLikeFeishuUserId(entry.id)
  );
  const groupTargets = entries.filter(
    (entry) => entry.kind === "group" && !entry.name && looksLikeFeishuGroupId(entry.id)
  );
  if (userTargets.length === 0 && groupTargets.length === 0) {
    return entries;
  }

  const token = await resolveFeishuTenantAccessToken(appId, appSecret);
  if (!token) {
    return entries;
  }

  await Promise.all(
    userTargets.map(async (entry) => {
      const name = await fetchFeishuUserNameByOpenId(token, entry.id);
      if (name) {
        entry.name = name;
        saveFeishuAlias("user", entry.id, name);
      }
    })
  );

  await Promise.all(
    groupTargets.map(async (entry) => {
      const name = await fetchFeishuChatNameById(token, entry.id);
      if (name) {
        entry.name = name;
        saveFeishuAlias("group", entry.id, name);
      }
    })
  );

  return entries;
}

// 获取 tenant_access_token（内存缓存，过期前一分钟自动刷新）。
async function resolveFeishuTenantAccessToken(appId: string, appSecret: string): Promise<string> {
  const now = Date.now();
  if (
    feishuTenantTokenCache &&
    feishuTenantTokenCache.appId === appId &&
    feishuTenantTokenCache.appSecret === appSecret &&
    feishuTenantTokenCache.expireAt > now + FEISHU_TOKEN_SAFETY_MS
  ) {
    return feishuTenantTokenCache.token;
  }

  const payload = await fetchJsonWithTimeout(`${FEISHU_OPEN_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const code = Number(payload?.code ?? -1);
  const token = String(payload?.tenant_access_token ?? "").trim();
  const expire = Number(payload?.expire ?? 0);
  if (code !== 0 || !token || !Number.isFinite(expire) || expire <= 0) {
    return "";
  }

  feishuTenantTokenCache = {
    appId,
    appSecret,
    token,
    expireAt: now + expire * 1000,
  };
  return token;
}

// 根据 open_id 查询用户名。
async function fetchFeishuUserNameByOpenId(token: string, openId: string): Promise<string> {
  const encodedId = encodeURIComponent(openId);
  const url = `${FEISHU_OPEN_API_BASE}/contact/v3/users/${encodedId}?user_id_type=open_id`;
  const payload = await fetchJsonWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
  if (Number(payload?.code ?? -1) !== 0) return "";
  return String(payload?.data?.user?.name ?? payload?.data?.name ?? "").trim();
}

// 根据 chat_id 查询群名称。
async function fetchFeishuChatNameById(token: string, chatId: string): Promise<string> {
  const encodedId = encodeURIComponent(chatId);
  const url = `${FEISHU_OPEN_API_BASE}/im/v1/chats/${encodedId}`;
  const payload = await fetchJsonWithTimeout(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
  if (Number(payload?.code ?? -1) !== 0) return "";
  return String(payload?.data?.chat?.name ?? payload?.data?.name ?? "").trim();
}

// 带超时的 JSON 请求；失败返回 null，不阻塞主流程。
async function fetchJsonWithTimeout(url: string, init: RequestInit): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    const text = await response.text();
    return parseJsonSafe(text);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 归一化 DM 策略，非法值回退为默认值。
function normalizeDmPolicy(input: unknown, fallback: "open" | "pairing" | "allowlist"): "open" | "pairing" | "allowlist" {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "open" || value === "pairing" || value === "allowlist") {
    return value;
  }
  return fallback;
}

// 归一化群聊策略，非法值回退为默认值。
function normalizeGroupPolicy(input: unknown, fallback: "open" | "allowlist" | "disabled"): "open" | "allowlist" | "disabled" {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "open" || value === "allowlist" || value === "disabled") {
    return value;
  }
  return fallback;
}

// 归一化话题会话策略，非法值回退为默认值。
function normalizeTopicSessionMode(input: unknown, fallback: "enabled" | "disabled"): "enabled" | "disabled" {
  const value = String(input ?? "").trim().toLowerCase();
  if (value === "enabled" || value === "disabled") {
    return value;
  }
  return fallback;
}

// 归一化私聊会话范围，非法值回退为默认值。
function normalizeDmScope(
  input: unknown,
  fallback: "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer"
): "main" | "per-peer" | "per-channel-peer" | "per-account-channel-peer" {
  const value = String(input ?? "").trim().toLowerCase();
  if (
    value === "main" ||
    value === "per-peer" ||
    value === "per-channel-peer" ||
    value === "per-account-channel-peer"
  ) {
    return value;
  }
  return fallback;
}

// 判断字符串是否像飞书用户 open_id。
function looksLikeFeishuUserId(value: string): boolean {
  return /^ou_[A-Za-z0-9]/.test(value);
}

// 判断字符串是否像飞书群聊 chat_id。
function looksLikeFeishuGroupId(value: string): boolean {
  return /^oc_[A-Za-z0-9]/.test(value);
}

// 将授权条目转换为前端展示模型，优先返回可读名称。
function toAuthorizedEntryView(kind: "user" | "group", id: string, aliases: FeishuAliasStore): FeishuAuthorizedEntryView {
  const trimmedId = String(id ?? "").trim();
  const aliasName = kind === "user" ? aliases.users[trimmedId] : aliases.groups[trimmedId];
  if (aliasName) {
    return { kind, id: trimmedId, name: aliasName };
  }

  if (kind === "user" && !looksLikeFeishuUserId(trimmedId)) {
    return { kind, id: trimmedId, name: trimmedId };
  }
  if (kind === "group" && !looksLikeFeishuGroupId(trimmedId)) {
    return { kind, id: trimmedId, name: trimmedId };
  }
  return { kind, id: trimmedId, name: "" };
}

// 授权条目排序：优先按可读名称，再按原始 ID。
function compareAuthorizedEntry(a: FeishuAuthorizedEntryView, b: FeishuAuthorizedEntryView): number {
  const aLabel = (a.name || a.id).toLowerCase();
  const bLabel = (b.name || b.id).toLowerCase();
  const byLabel = aLabel.localeCompare(bLabel, "en");
  if (byLabel !== 0) return byLabel;
  return a.id.localeCompare(b.id, "en");
}

// 读取飞书授权别名（用于把 ID 显示成用户/群聊名称）。
function readFeishuAliasStore(): FeishuAliasStore {
  const filePath = path.join(resolveUserStateDir(), "credentials", FEISHU_ALIAS_STORE_FILE);
  if (!fs.existsSync(filePath)) {
    return { version: 1, users: {}, groups: {} };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = parseJsonSafe(raw);
    const users = parsed && typeof parsed.users === "object" && !Array.isArray(parsed.users)
      ? Object.fromEntries(
          Object.entries(parsed.users).map(([id, name]) => [String(id).trim(), String(name ?? "").trim()])
        )
      : {};
    const groups = parsed && typeof parsed.groups === "object" && !Array.isArray(parsed.groups)
      ? Object.fromEntries(
          Object.entries(parsed.groups).map(([id, name]) => [String(id).trim(), String(name ?? "").trim()])
        )
      : {};
    return {
      version: 1,
      users: Object.fromEntries(Object.entries(users).filter(([id, name]) => id && name)),
      groups: Object.fromEntries(Object.entries(groups).filter(([id, name]) => id && name)),
    };
  } catch {
    return { version: 1, users: {}, groups: {} };
  }
}

// 写入飞书授权别名存储。
function writeFeishuAliasStore(store: FeishuAliasStore): void {
  const dir = path.join(resolveUserStateDir(), "credentials");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, FEISHU_ALIAS_STORE_FILE);
  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), "utf-8");
}

// 保存单条飞书授权别名，供列表展示优先使用名称。
function saveFeishuAlias(kind: "user" | "group", id: string, name: string): void {
  const trimmedId = String(id ?? "").trim();
  const trimmedName = String(name ?? "").trim();
  if (!trimmedId || !trimmedName) return;
  const store = readFeishuAliasStore();
  if (kind === "user") {
    store.users[trimmedId] = trimmedName;
  } else {
    store.groups[trimmedId] = trimmedName;
  }
  writeFeishuAliasStore(store);
}

// 删除单条飞书授权别名。
function removeFeishuAlias(kind: "user" | "group", id: string): void {
  const trimmedId = String(id ?? "").trim();
  if (!trimmedId) return;
  const store = readFeishuAliasStore();
  if (kind === "user") {
    delete store.users[trimmedId];
  } else {
    delete store.groups[trimmedId];
  }
  writeFeishuAliasStore(store);
}

// ── 从配置中提取当前 provider 信息（apiKey 掩码） ──

function extractProviderInfo(config: any): any {
  const primary: string = config?.agents?.defaults?.model?.primary ?? "";
  const providers = config?.models?.providers ?? {};
  const env = config?.env ?? {};

  // 解析 "provider/model" 格式
  const slashIdx = primary.indexOf("/");
  const providerKey = slashIdx > 0 ? primary.slice(0, slashIdx) : "";
  const modelID = slashIdx > 0 ? primary.slice(slashIdx + 1) : primary;

  let provider = providerKey;
  let subPlatform = "";
  let customPreset = "";
  let apiKey = "";
  let baseURL = "";
  let api = "";
  let supportsImage = true;
  let configuredModels: string[] = [];

  // 从 provider 入口的 models 数组提取 id 列表
  const extractModelIds = (prov: any): string[] => {
    if (!Array.isArray(prov?.models)) return [];
    return prov.models.map((m: any) => (typeof m === "string" ? m : m?.id)).filter(Boolean);
  };

  // Kimi Code 特殊路径：provider key = kimi-coding
  if (providerKey === "kimi-coding") {
    provider = "moonshot";
    subPlatform = "kimi-code";
    // 代理模式下 config 中是 "proxy-managed"，从 sidecar / OAuth 读取真实 key
    const configKey = providers["kimi-coding"]?.apiKey ?? "";
    if (configKey === "proxy-managed") {
      const { loadOAuthToken } = require("./kimi-oauth");
      const oauthToken = loadOAuthToken();
      apiKey = oauthToken?.access_token || readKimiApiKey() || "";
    } else {
      apiKey = configKey;
    }
    configuredModels = extractModelIds(providers["kimi-coding"]);
  } else if (providerKey === "moonshot") {
    provider = "moonshot";
    const prov = providers.moonshot;
    if (prov?.baseUrl?.includes("moonshot.ai")) {
      subPlatform = "moonshot-ai";
    } else {
      subPlatform = "moonshot-cn";
    }
    apiKey = prov?.apiKey ?? "";
    configuredModels = extractModelIds(prov);
  } else if (providers[providerKey]) {
    const prov = providers[providerKey];
    apiKey = prov?.apiKey ?? "";
    baseURL = prov?.baseUrl ?? "";
    api = prov?.api ?? "";
    configuredModels = extractModelIds(prov);

    // 检查是否匹配某个 custom 预设（通过 providerKey + baseUrl 反查）
    const matchedPreset = Object.entries(CUSTOM_PROVIDER_PRESETS).find(
      ([, preset]) => preset.providerKey === providerKey && preset.baseUrl === baseURL
    );
    if (matchedPreset) {
      // 映射回 custom provider + 预设 key，前端可恢复下拉状态
      provider = "custom";
      customPreset = matchedPreset[0];
    }

    // 从当前选中模型（primary）推断 custom provider 是否支持图像，避免读取到旧模型条目。
    const models = Array.isArray(prov?.models) ? prov.models : [];
    const matchedModel = models.find((item: any) => item && typeof item === "object" && item.id === modelID);
    const modelEntry = matchedModel ?? models[0];
    if (modelEntry && typeof modelEntry === "object" && Array.isArray(modelEntry.input)) {
      supportsImage = modelEntry.input.includes("image");
    }
  }

  // 构建所有已保存 provider 的摘要（供前端切换时自动回填）
  const savedProviders: Record<string, any> = {};
  for (const [key, prov] of Object.entries(providers)) {
    if (!prov || typeof prov !== "object") continue;
    const p = prov as any;
    if (!p.apiKey) continue;
    savedProviders[key] = {
      apiKey: p.apiKey ?? "",
      baseURL: p.baseUrl ?? "",
      api: p.api ?? "",
      configuredModels: extractModelIds(p),
    };
  }

  return {
    provider,
    subPlatform,
    customPreset,
    modelID,
    apiKey,
    baseURL,
    api,
    supportImage: supportsImage,
    configuredModels,
    raw: primary,
    savedProviders,
  };
}

// 合并模型列表：保留历史模型，同时用最新配置覆盖当前选中模型（如 input 能力变更）。
function mergeModels(provEntry: any, selectedID: string, prevModels: any[]): void {
  if (!provEntry || !prevModels.length) return;
  const newEntry = (provEntry.models ?? [])[0]; // buildProviderConfig 生成的单条目
  const merged = [...prevModels];
  const currentIndex = merged.findIndex((m: any) => m?.id === selectedID);
  if (currentIndex >= 0) {
    if (newEntry) {
      merged[currentIndex] = {
        ...(merged[currentIndex] && typeof merged[currentIndex] === "object"
          ? merged[currentIndex]
          : {}),
        ...newEntry,
      };
    }
  } else if (newEntry) {
    merged.push(newEntry);
  }
  provEntry.models = merged;
}

// 给指定模型设置别名（name 字段），空别名时移除 name 让 UI 回退显示 id
function applyModelAlias(provEntry: any, modelId: string, alias?: string): void {
  if (!provEntry || !Array.isArray(provEntry.models)) return;
  const idx = provEntry.models.findIndex((m: any) => {
    const id = typeof m === "string" ? m : m?.id;
    return id === modelId;
  });
  if (idx < 0) return;
  // 字符串条目升级为对象格式
  let entry = provEntry.models[idx];
  if (typeof entry === "string") {
    entry = { id: entry, name: entry, input: ["text"] };
    provEntry.models[idx] = entry;
  }
  const trimmed = typeof alias === "string" ? alias.trim() : "";
  // name 是 gateway schema 必填字段，空别名时回退到 id
  entry.name = trimmed || entry.id;
}

// API Key 掩码：保留首尾各 4 字符
function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}
