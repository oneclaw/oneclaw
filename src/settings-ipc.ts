import { app, ipcMain } from "electron";
import { spawn } from "child_process";
import {
  resolveNodeBin,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveResourcesPath,
  resolveUserConfigPath,
  resolveUserStateDir,
} from "./constants";
import {
  getConfigRecoveryData,
  restoreLastKnownGoodConfigSnapshot,
  restoreUserConfigBackup,
} from "./config-backup";
import {
  PROVIDER_PRESETS,
  MOONSHOT_SUB_PLATFORMS,
  verifyProvider,
  buildProviderConfig,
  saveMoonshotConfig,
  readUserConfig,
  writeUserConfig,
} from "./provider-config";
import { getLatestShareCopyPayload } from "./share-copy";
import {
  extractKimiConfig,
  saveKimiPluginConfig,
  isKimiPluginBundled,
  DEFAULT_KIMI_BRIDGE_WS_URL,
  extractKimiSearchConfig,
  saveKimiSearchConfig,
  isKimiSearchPluginBundled,
  writeKimiSearchDedicatedApiKey,
} from "./kimi-config";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";
import { getLaunchAtLoginState, setLaunchAtLoginEnabled } from "./launch-at-login";
import { installCli, uninstallCli, isCliInstalled } from "./cli-integration";
import * as analytics from "./analytics";
import * as path from "path";
import * as fs from "fs";

type CliRunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type FeishuPairingRequestView = {
  code: string;
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
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

const FEISHU_CHANNEL = "feishu";
const WILDCARD_ALLOW_ENTRY = "*";
const FEISHU_ALIAS_STORE_FILE = "feishu-allowFrom-aliases.json";
const FEISHU_REJECTED_PAIRING_STORE_FILE = "feishu-rejected-pairing-codes.json";
const FEISHU_FIRST_PAIRING_WINDOW_FILE = "feishu-first-pairing-window.json";
const FEISHU_FIRST_PAIRING_WINDOW_TTL_MS = 10 * 60 * 1000;
const FEISHU_OPEN_API_BASE = "https://open.feishu.cn/open-apis";
const FEISHU_TOKEN_SAFETY_MS = 60_000;

type FeishuFirstPairingWindowState = {
  openedAtMs: number;
  expiresAtMs: number;
  consumedAtMs: number | null;
  consumedBy: string;
};

type FeishuTenantTokenCache = {
  appId: string;
  appSecret: string;
  token: string;
  expireAt: number;
};

type FeishuRejectedPairingStore = {
  version: 1;
  codes: string[];
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

// 注册 Settings 相关 IPC
export function registerSettingsIpc(): void {
  // ── 读取当前 provider/model 配置（apiKey 掩码返回） ──
  ipcMain.handle("settings:get-config", async () => {
    try {
      const config = readUserConfig();
      return { success: true, data: extractProviderInfo(config) };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 验证 API Key（复用 provider-config） ──
  ipcMain.handle("settings:verify-key", async (_event, params) => {
    const provider = typeof params?.provider === "string" ? params.provider : "";
    return runTrackedSettingsAction("verify_key", { provider }, async () => verifyProvider(params));
  });

  // ── 读取最新分享文案（服务端维护中英文版本） ──
  ipcMain.handle("settings:get-share-copy", async () => {
    try {
      return {
        success: true,
        data: await getLatestShareCopyPayload(),
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message || String(err),
      };
    }
  });

  // ── 保存 provider 配置 ──
  ipcMain.handle("settings:save-provider", async (_event, params) => {
    const { provider, apiKey, modelID, baseURL, api, subPlatform, supportImage } = params;
    const trackedProps = {
      provider,
      model: modelID,
      sub_platform: subPlatform || undefined,
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

        if (provider === "moonshot") {
          // 记住现有 models 再写入（saveMoonshotConfig 会覆盖）
          const sub = MOONSHOT_SUB_PLATFORMS[subPlatform || "moonshot-cn"];
          const provKey = sub?.providerKey || "moonshot";
          const prevModels: any[] = config.models.providers[provKey]?.models ?? [];

          saveMoonshotConfig(config, apiKey, modelID, subPlatform);

          // 合并：保留已有模型，确保选中模型在列表中
          mergeModels(config.models.providers[provKey], modelID, prevModels);
        } else {
          const prevModels: any[] = config.models.providers[provider]?.models ?? [];

          const providerConfig = buildProviderConfig(provider, apiKey, modelID, baseURL, api, supportImage);
          config.models.providers[provider] = providerConfig;
          config.agents.defaults.model.primary = `${provider}/${modelID}`;

          mergeModels(config.models.providers[provider], modelID, prevModels);
        }

        // 配置 kimi-code 时自动启用搜索插件
        if (provider === "moonshot" && subPlatform === "kimi-code") {
          saveKimiSearchConfig(config, { enabled: true });
        }

        writeUserConfig(config);
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
      const enabled = config?.plugins?.entries?.feishu?.enabled === true;
      const dmPolicy = normalizeDmPolicy(feishu?.dmPolicy, "pairing");
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
      params?.dmPolicyOpen === true ? "open" : "pairing"
    );
    const dmScopeInput = params?.dmScope;
    const groupPolicy = normalizeGroupPolicy(params?.groupPolicy, "allowlist");
    const groupAllowFrom = normalizeAllowFromEntries(params?.groupAllowFrom);
    const trackedProps = {
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
        config.plugins ??= {};
        config.plugins.entries ??= {};

        // 仅禁用 → 不校验凭据
        if (enabled === false) {
          config.plugins.entries.feishu = { ...(config.plugins.entries.feishu ?? {}), enabled: false };
          writeUserConfig(config);
          // 禁用飞书时关闭“首配自动批准”窗口，但保留已消费标记，防止重复自动批准。
          closeFeishuFirstPairingWindow();
          return { success: true };
        }

        config.plugins.entries.feishu = { enabled: true };
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
        writeUserConfig(config);
        // 保存完成后按当前策略维护首配窗口，确保仅在 pairing 且无授权用户时才开启。
        reconcileFeishuFirstPairingWindow(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 列出飞书待审批配对请求（走 openclaw pairing list，避免重复实现存储协议） ──
  ipcMain.handle("settings:list-feishu-pairing", async () => {
    const listed = await listFeishuPairingRequests();
    if (!listed.success) {
      return { success: false, message: listed.message || "读取飞书待审批列表失败" };
    }
    return { success: true, data: { requests: listed.requests } };
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

  // ── 批准飞书配对请求（走 openclaw pairing approve，统一写入 allowlist store） ──
  ipcMain.handle("settings:approve-feishu-pairing", async (_event, params) => {
    return approveFeishuPairingRequest(params);
  });

  // ── 拒绝飞书配对请求（openclaw 暂无 reject 命令，使用本地 sidecar 忽略该 pairing code） ──
  ipcMain.handle("settings:reject-feishu-pairing", async (_event, params) => {
    return rejectFeishuPairingRequest(params);
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
      writeUserConfig(config);
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
        writeUserConfig(config);
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
      writeUserConfig(config);
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

  // ── 保存 Kimi 插件配置（支持 enabled=false 仅切换开关） ──
  ipcMain.handle("settings:save-kimi-config", async (_event, params) => {
    const botToken = typeof params?.botToken === "string" ? params.botToken.trim() : "";
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
          writeUserConfig(config);
          return { success: true };
        }

        if (!botToken) {
          return { success: false, message: "Kimi Bot Token 不能为空。" };
        }
        if (!isKimiPluginBundled()) {
          return { success: false, message: "Kimi Channel 组件缺失，请重新安装 OneClaw。" };
        }

        const gatewayToken = ensureGatewayAuthTokenInConfig(config);
        saveKimiPluginConfig(config, { botToken, gatewayToken, wsURL: DEFAULT_KIMI_BRIDGE_WS_URL });
        writeUserConfig(config);
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
    return runTrackedSettingsAction("save_kimi_search", { enabled }, async () => {
      try {
        if (enabled && !isKimiSearchPluginBundled()) {
          return { success: false, message: "Kimi Search 组件缺失，请重新安装 OneClaw。" };
        }
        // 专属 key 存到 sidecar 文件，不写入 openclaw.json
        if (typeof apiKey === "string") {
          writeKimiSearchDedicatedApiKey(apiKey);
        }
        // openclaw.json 只写 enabled
        const config = readUserConfig();
        saveKimiSearchConfig(config, { enabled });
        writeUserConfig(config);
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || String(err) };
      }
    });
  });

  // ── 读取高级配置（browser profile + iMessage） ──
  ipcMain.handle("settings:get-advanced", async () => {
    try {
      const config = readUserConfig();
      const launchAtLoginState = getLaunchAtLoginState(app);
      return {
        success: true,
        data: {
          browserProfile: config?.browser?.defaultProfile ?? "openclaw",
          imessageEnabled: config?.channels?.imessage?.enabled !== false,
          launchAtLoginSupported: launchAtLoginState.supported,
          launchAtLogin: launchAtLoginState.enabled,
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
    return runTrackedSettingsAction(
      "save_advanced",
      { browser_profile: browserProfile, imessage_enabled: imessageEnabled, launch_at_login: launchAtLogin },
      async () => {
        try {
          const config = readUserConfig();

          config.browser ??= {};
          config.browser.defaultProfile = browserProfile;

          config.channels ??= {};
          config.channels.imessage ??= {};
          config.channels.imessage.enabled = imessageEnabled;

          if (typeof launchAtLogin === "boolean") {
            setLaunchAtLoginEnabled(app, launchAtLogin);
          }

          writeUserConfig(config);
          return { success: true };
        } catch (err: any) {
          return { success: false, message: err.message || String(err) };
        }
      }
    );
  });

  // ── 读取 CLI 安装状态（设置页用于切换“安装/卸载”按钮文案） ──
  ipcMain.handle("settings:get-cli-status", async () => {
    try {
      return {
        success: true,
        data: {
          installed: isCliInstalled(),
          command: "openclaw",
        },
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
  ipcMain.handle("settings:reset-config-and-relaunch", async () => {
    try {
      const configPath = resolveUserConfigPath();
      if (fs.existsSync(configPath)) {
        fs.unlinkSync(configPath);
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

// 读取当前飞书配对模式状态，供主进程轮询器判断是否需要继续监听。
export function getFeishuPairingModeState(): {
  enabled: boolean;
  dmPolicy: "open" | "pairing" | "allowlist";
  approvedUserCount: number;
} {
  const config = readUserConfig();
  const feishu = config?.channels?.feishu ?? {};
  const enabled = config?.plugins?.entries?.feishu?.enabled === true;
  const dmPolicy = normalizeDmPolicy(feishu?.dmPolicy, "pairing");
  const approvedUserIds = collectFeishuApprovedUserIds(config);
  return {
    enabled,
    dmPolicy,
    approvedUserCount: approvedUserIds.length,
  };
}

// 列出飞书待审批请求：解析 CLI 输出并统一成前端可消费结构。
export async function listFeishuPairingRequests(): Promise<{
  success: boolean;
  requests: FeishuPairingRequestView[];
  message?: string;
}> {
  try {
    const run = await runGatewayCli(["pairing", "list", "feishu", "--json"]);
    if (run.code !== 0) {
      return {
        success: false,
        requests: [],
        message: compactCliError(run, "读取飞书待审批列表失败"),
      };
    }

    const parsed = parseJsonSafe(run.stdout);
    if (!parsed || !Array.isArray(parsed?.requests)) {
      return {
        success: false,
        requests: [],
        message: compactCliError(run, "解析飞书待审批列表失败"),
      };
    }
    const rawRequests = Array.isArray(parsed?.requests) ? parsed.requests : [];
    const parsedRequests: FeishuPairingRequestView[] = rawRequests.map((item: any) => ({
      code: String(item?.code ?? ""),
      id: String(item?.id ?? ""),
      name: String(item?.meta?.name ?? ""),
      createdAt: String(item?.createdAt ?? ""),
      lastSeenAt: String(item?.lastSeenAt ?? ""),
    }));
    const rejectedCodes = new Set(readFeishuRejectedPairingCodes());
    const requests = parsedRequests.filter((item) => !rejectedCodes.has(item.code));
    // 仅保留“当前仍在 pending 列表里”的拒绝码，防止 sidecar 无限制增长。
    if (rejectedCodes.size > 0) {
      const activeCodes = new Set(parsedRequests.map((item) => item.code));
      pruneFeishuRejectedPairingCodes(activeCodes);
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

// 批准飞书配对请求：调用 CLI 并在成功后缓存用户别名用于展示。
export async function approveFeishuPairingRequest(params: Record<string, unknown>): Promise<{
  success: boolean;
  message?: string;
}> {
  const code = typeof params?.code === "string" ? params.code.trim() : "";
  const id = typeof params?.id === "string" ? params.id.trim() : "";
  const name = typeof params?.name === "string" ? params.name.trim() : "";
  if (!code) {
    return { success: false, message: "配对码不能为空。" };
  }

  try {
    const run = await runGatewayCli(["pairing", "approve", "feishu", code, "--notify"]);
    if (run.code !== 0) {
      return {
        success: false,
        message: compactCliError(run, `批准配对码失败: ${code}`),
      };
    }
    if (id && name) {
      saveFeishuAlias("user", id, name);
    }
    removeFeishuRejectedPairingCode(code);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message || String(err) };
  }
}

// 拒绝飞书配对请求：当前 openclaw pairing 无 reject 子命令，改为本地忽略当前配对码。
export async function rejectFeishuPairingRequest(params: Record<string, unknown>): Promise<{
  success: boolean;
  message?: string;
}> {
  const code = typeof params?.code === "string" ? params.code.trim() : "";
  if (!code) {
    return { success: false, message: "配对码不能为空。" };
  }
  appendFeishuRejectedPairingCode(code);
  return { success: true };
}

// 根据配置与授权存储统计当前已授权飞书用户，排除通配符与空值。
function collectFeishuApprovedUserIds(config: any): string[] {
  const feishu = config?.channels?.feishu ?? {};
  const configEntries = normalizeAllowFromEntries(feishu?.allowFrom).filter(
    (entry) => entry !== WILDCARD_ALLOW_ENTRY
  );
  const storeEntries = readFeishuAllowFromStore();
  return dedupeEntries([...configEntries, ...storeEntries]);
}

// 返回首配自动批准窗口文件路径（sidecar，不污染 openclaw.json schema）。
function resolveFeishuFirstPairingWindowPath(): string {
  return path.join(resolveUserStateDir(), "credentials", FEISHU_FIRST_PAIRING_WINDOW_FILE);
}

// 读取首配自动批准窗口状态；解析失败返回 null，保证调用端逻辑简单。
function readFeishuFirstPairingWindowState(): FeishuFirstPairingWindowState | null {
  const filePath = resolveFeishuFirstPairingWindowPath();
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = parseJsonSafe(fs.readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    const openedAtMs = Number((parsed as Record<string, unknown>).openedAtMs);
    const expiresAtMs = Number((parsed as Record<string, unknown>).expiresAtMs);
    const consumedAtRaw = (parsed as Record<string, unknown>).consumedAtMs;
    const consumedAtMs = consumedAtRaw == null ? null : Number(consumedAtRaw);
    const consumedBy = String((parsed as Record<string, unknown>).consumedBy ?? "").trim();
    if (!Number.isFinite(openedAtMs) || !Number.isFinite(expiresAtMs)) {
      return null;
    }
    return {
      openedAtMs,
      expiresAtMs,
      consumedAtMs: consumedAtMs == null || !Number.isFinite(consumedAtMs) ? null : consumedAtMs,
      consumedBy,
    };
  } catch {
    return null;
  }
}

// 原子写入首配窗口状态文件，所有窗口相关状态变更都通过这个函数落盘。
function writeFeishuFirstPairingWindowState(state: FeishuFirstPairingWindowState): void {
  const filePath = resolveFeishuFirstPairingWindowPath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

// 开启首配自动批准时间窗；若已消费过则保持熔断，不再重开窗口。
function openFeishuFirstPairingWindow(nowMs = Date.now()): void {
  const prev = readFeishuFirstPairingWindowState();
  if (prev?.consumedAtMs) {
    return;
  }
  writeFeishuFirstPairingWindowState({
    openedAtMs: nowMs,
    expiresAtMs: nowMs + FEISHU_FIRST_PAIRING_WINDOW_TTL_MS,
    consumedAtMs: null,
    consumedBy: "",
  });
}

// 关闭首配自动批准窗口：未消费场景删除文件；已消费场景保留熔断标记。
export function closeFeishuFirstPairingWindow(): void {
  const filePath = resolveFeishuFirstPairingWindowPath();
  const prev = readFeishuFirstPairingWindowState();
  if (prev?.consumedAtMs) {
    return;
  }
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

// 标记首配窗口已消费，无论批准成功或失败都熔断，避免重试风暴。
export function consumeFeishuFirstPairingWindow(userId: string): void {
  const nowMs = Date.now();
  const prev = readFeishuFirstPairingWindowState();
  if (prev) {
    writeFeishuFirstPairingWindowState({
      ...prev,
      consumedAtMs: prev.consumedAtMs ?? nowMs,
      consumedBy: prev.consumedBy || String(userId ?? "").trim(),
    });
    return;
  }
  writeFeishuFirstPairingWindowState({
    openedAtMs: nowMs,
    expiresAtMs: nowMs,
    consumedAtMs: nowMs,
    consumedBy: String(userId ?? "").trim(),
  });
}

// 判断首配窗口是否处于生效期；过期或已消费都返回 false，并自动清理过期窗口。
export function isFeishuFirstPairingWindowActive(nowMs = Date.now()): boolean {
  const state = readFeishuFirstPairingWindowState();
  if (!state) {
    return false;
  }
  if (state.consumedAtMs) {
    return false;
  }
  if (nowMs > state.expiresAtMs) {
    closeFeishuFirstPairingWindow();
    return false;
  }
  return nowMs >= state.openedAtMs;
}

// 根据当前飞书配置与授权状态维护首配窗口，避免把窗口状态散落在多个调用点。
function reconcileFeishuFirstPairingWindow(config: any): void {
  const enabled = config?.plugins?.entries?.feishu?.enabled === true;
  if (!enabled) {
    closeFeishuFirstPairingWindow();
    return;
  }

  const feishu = config?.channels?.feishu ?? {};
  const dmPolicy = normalizeDmPolicy(feishu?.dmPolicy, "pairing");
  if (dmPolicy !== "pairing") {
    closeFeishuFirstPairingWindow();
    return;
  }

  const approvedUserIds = collectFeishuApprovedUserIds(config);
  if (approvedUserIds.length > 0) {
    closeFeishuFirstPairingWindow();
    return;
  }

  openFeishuFirstPairingWindow();
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

// 读取飞书 allowFrom store 文件（由 openclaw pairing approve 写入）。
function readFeishuAllowFromStore(): string[] {
  const filePath = path.join(resolveUserStateDir(), "credentials", `${FEISHU_CHANNEL}-allowFrom.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = parseJsonSafe(raw);
    return normalizeAllowFromEntries(parsed?.allowFrom);
  } catch {
    return [];
  }
}

// 写入飞书 allowFrom store 文件（兼容保留原有字段）。
function writeFeishuAllowFromStore(entries: string[]): void {
  const normalized = normalizeAllowFromEntries(entries);
  const dir = path.join(resolveUserStateDir(), "credentials");
  const filePath = path.join(dir, `${FEISHU_CHANNEL}-allowFrom.json`);
  if (normalized.length === 0) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  let payload: Record<string, unknown> = {};
  if (fs.existsSync(filePath)) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = parseJsonSafe(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      payload = {};
    }
  }
  payload.allowFrom = normalized;
  if (typeof payload.channel !== "string" || !payload.channel) {
    payload.channel = FEISHU_CHANNEL;
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

// 读取本地“已拒绝配对码”sidecar，用于过滤待审批列表。
function readFeishuRejectedPairingStore(): FeishuRejectedPairingStore {
  const filePath = path.join(resolveUserStateDir(), "credentials", FEISHU_REJECTED_PAIRING_STORE_FILE);
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

// 写入本地“已拒绝配对码”sidecar，空数组时删除文件。
function writeFeishuRejectedPairingStore(codes: string[]): void {
  const normalized = normalizeAllowFromEntries(codes);
  const dir = path.join(resolveUserStateDir(), "credentials");
  const filePath = path.join(dir, FEISHU_REJECTED_PAIRING_STORE_FILE);
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

// 读取拒绝码列表。
function readFeishuRejectedPairingCodes(): string[] {
  return readFeishuRejectedPairingStore().codes;
}

// 追加单个拒绝码（幂等）。
function appendFeishuRejectedPairingCode(code: string): void {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return;
  const store = readFeishuRejectedPairingStore();
  if (store.codes.includes(trimmed)) return;
  store.codes.push(trimmed);
  writeFeishuRejectedPairingStore(store.codes);
}

// 移除单个拒绝码（批准后自动清理）。
function removeFeishuRejectedPairingCode(code: string): void {
  const trimmed = String(code ?? "").trim();
  if (!trimmed) return;
  const store = readFeishuRejectedPairingStore();
  const nextCodes = store.codes.filter((item) => item !== trimmed);
  if (nextCodes.length === store.codes.length) return;
  writeFeishuRejectedPairingStore(nextCodes);
}

// 清理过期拒绝码：只保留当前 pending 列表里仍存在的 code。
function pruneFeishuRejectedPairingCodes(activeCodes: Set<string>): void {
  const store = readFeishuRejectedPairingStore();
  if (store.codes.length === 0) return;
  const nextCodes = store.codes.filter((code) => activeCodes.has(code));
  if (nextCodes.length === store.codes.length) return;
  writeFeishuRejectedPairingStore(nextCodes);
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
    apiKey = providers["kimi-coding"]?.apiKey ?? "";
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
    modelID,
    apiKey,
    baseURL,
    api,
    supportsImage,
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

// API Key 掩码：保留首尾各 4 字符
function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}
