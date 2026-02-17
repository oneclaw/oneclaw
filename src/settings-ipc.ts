import { ipcMain } from "electron";
import { ChildProcess, spawn } from "child_process";
import { SettingsManager } from "./settings-manager";
import {
  resolveNodeBin,
  resolveGatewayEntry,
  resolveGatewayCwd,
  resolveResourcesPath,
  resolveUserStateDir,
} from "./constants";
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
import * as fs from "fs";

interface SettingsIpcDeps {
  settingsManager: SettingsManager;
}

type CliRunResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type FeishuPairingRequestView = {
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
const FEISHU_OPEN_API_BASE = "https://open.feishu.cn/open-apis";
const FEISHU_TOKEN_SAFETY_MS = 60_000;

type FeishuTenantTokenCache = {
  appId: string;
  appSecret: string;
  token: string;
  expireAt: number;
};

let doctorProc: ChildProcess | null = null;
let feishuTenantTokenCache: FeishuTenantTokenCache | null = null;

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
      return { success: true };
    } catch (err: any) {
      return { success: false, message: err.message || String(err) };
    }
  });

  // ── 列出飞书待审批配对请求（走 openclaw pairing list，避免重复实现存储协议） ──
  ipcMain.handle("settings:list-feishu-pairing", async () => {
    try {
      const run = await runGatewayCli(["pairing", "list", "feishu", "--json"]);
      if (run.code !== 0) {
        return {
          success: false,
          message: compactCliError(run, "读取飞书待审批列表失败"),
        };
      }

      const parsed = parseJsonSafe(run.stdout);
      if (!parsed || !Array.isArray(parsed?.requests)) {
        return {
          success: false,
          message: compactCliError(run, "解析飞书待审批列表失败"),
        };
      }
      const rawRequests = Array.isArray(parsed?.requests) ? parsed.requests : [];
      const requests: FeishuPairingRequestView[] = rawRequests.map((item: any) => ({
        code: String(item?.code ?? ""),
        id: String(item?.id ?? ""),
        name: String(item?.meta?.name ?? ""),
        createdAt: String(item?.createdAt ?? ""),
        lastSeenAt: String(item?.lastSeenAt ?? ""),
      }));

      return { success: true, data: { requests } };
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

  // ── 批准飞书配对请求（走 openclaw pairing approve，统一写入 allowlist store） ──
  ipcMain.handle("settings:approve-feishu-pairing", async (_event, params) => {
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
      return { success: true };
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
