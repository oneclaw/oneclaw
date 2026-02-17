import { ipcMain } from "electron";
import { ChildProcess, spawn } from "child_process";
import { SettingsManager } from "./settings-manager";
import { resolveNodeBin, resolveGatewayEntry, resolveGatewayCwd, resolveResourcesPath } from "./constants";
import {
  PROVIDER_PRESETS,
  MOONSHOT_SUB_PLATFORMS,
  verifyProvider,
  buildProviderConfig,
  saveMoonshotConfig,
  readUserConfig,
  writeUserConfig,
} from "./provider-config";
import { extractKimiConfig, saveKimiPluginConfig, isKimiPluginBundled, DEFAULT_KIMI_BRIDGE_WS_URL } from "./kimi-config";
import { ensureGatewayAuthTokenInConfig } from "./gateway-auth";
import * as path from "path";

interface SettingsIpcDeps {
  settingsManager: SettingsManager;
}

let doctorProc: ChildProcess | null = null;

// 注册 Settings 相关 IPC
export function registerSettingsIpc(deps: SettingsIpcDeps): void {
  const { settingsManager } = deps;

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
    return verifyProvider(params);
  });

  // ── 保存 provider 配置 ──
  ipcMain.handle("settings:save-provider", async (_event, params) => {
    const { provider, apiKey, modelID, baseURL, api, subPlatform, supportImage } = params;
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

      writeUserConfig(config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 读取频道配置 ──
  ipcMain.handle("settings:get-channel-config", async () => {
    try {
      const config = readUserConfig();
      const feishu = config?.channels?.feishu ?? {};
      const enabled = config?.plugins?.entries?.feishu?.enabled === true;
      return {
        success: true,
        data: {
          appId: feishu.appId ?? "",
          appSecret: feishu.appSecret ?? "",
          enabled,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存频道配置（支持 enabled=false 仅切换开关） ──
  ipcMain.handle("settings:save-channel", async (_event, params) => {
    const { appId, appSecret, enabled } = params;
    try {
      const config = readUserConfig();
      config.plugins ??= {};
      config.plugins.entries ??= {};

      // 仅禁用 → 不校验凭据
      if (enabled === false) {
        config.plugins.entries.feishu = { ...(config.plugins.entries.feishu ?? {}), enabled: false };
        writeUserConfig(config);
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

      // OneClaw 当前未提供 pairing 审批入口，首次配置时默认放开 DM 以避免“有配对码但无处审批”死锁
      if (!("dmPolicy" in config.channels.feishu)) {
        config.channels.feishu.dmPolicy = "open";
      }
      const hasAllowFrom = Array.isArray(config.channels.feishu.allowFrom);
      if (!hasAllowFrom || config.channels.feishu.allowFrom.length === 0) {
        config.channels.feishu.allowFrom = ["*"];
      }

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

  // ── 读取高级配置（browser profile + iMessage） ──
  ipcMain.handle("settings:get-advanced", async () => {
    try {
      const config = readUserConfig();
      return {
        success: true,
        data: {
          browserProfile: config?.browser?.defaultProfile ?? "openclaw",
          imessageEnabled: config?.channels?.imessage?.enabled !== false,
        },
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  });

  // ── 保存高级配置 ──
  ipcMain.handle("settings:save-advanced", async (_event, params) => {
    const { browserProfile, imessageEnabled } = params;
    try {
      const config = readUserConfig();

      config.browser ??= {};
      config.browser.defaultProfile = browserProfile;

      config.channels ??= {};
      config.channels.imessage ??= {};
      config.channels.imessage.enabled = imessageEnabled;

      writeUserConfig(config);
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── Doctor 子进程 ──
  ipcMain.handle("settings:run-doctor", async () => {
    // 防止并发
    if (doctorProc && doctorProc.exitCode == null) {
      return { success: false, message: "Doctor 正在运行中" };
    }

    const nodeBin = resolveNodeBin();
    const entry = resolveGatewayEntry();
    const cwd = resolveGatewayCwd();

    // 组装 PATH，内嵌 runtime 优先
    const runtimeDir = path.join(resolveResourcesPath(), "runtime");
    const envPath = runtimeDir + path.delimiter + (process.env.PATH ?? "");

    doctorProc = spawn(nodeBin, [entry, "doctor", "--non-interactive", "--repair"], {
      cwd,
      env: {
        ...process.env,
        PATH: envPath,
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const wc = settingsManager.getWebContents();

    // 流式推送 stdout/stderr
    const pushOutput = (data: Buffer) => {
      if (wc && !wc.isDestroyed()) {
        wc.send("settings:doctor-output", data.toString());
      }
    };
    doctorProc.stdout?.on("data", pushOutput);
    doctorProc.stderr?.on("data", pushOutput);

    // 完成时推送退出码
    doctorProc.on("exit", (code) => {
      if (wc && !wc.isDestroyed()) {
        wc.send("settings:doctor-exit", code ?? -1);
      }
      doctorProc = null;
    });

    doctorProc.on("error", (err) => {
      if (wc && !wc.isDestroyed()) {
        wc.send("settings:doctor-output", `Error: ${err.message}\n`);
        wc.send("settings:doctor-exit", -1);
      }
      doctorProc = null;
    });

    return { success: true, pid: doctorProc.pid };
  });
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
    // 从 models[0].input 推断 custom provider 是否支持图像
    const modelEntry = (prov?.models ?? [])[0];
    if (modelEntry?.input) {
      supportsImage = Array.isArray(modelEntry.input) && modelEntry.input.includes("image");
    }
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
  };
}

// 合并模型列表：保留 prevModels 中的全部条目，确保 selectedID 存在
function mergeModels(provEntry: any, selectedID: string, prevModels: any[]): void {
  if (!provEntry || !prevModels.length) return;
  const newEntry = (provEntry.models ?? [])[0]; // buildProviderConfig 生成的单条目
  const merged = [...prevModels];
  const exists = merged.some((m: any) => m.id === selectedID);
  if (!exists && newEntry) {
    merged.push(newEntry);
  }
  provEntry.models = merged;
}

// API Key 掩码：保留首尾各 4 字符
function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return key ? "••••••••" : "";
  return key.slice(0, 4) + "••••" + key.slice(-4);
}
