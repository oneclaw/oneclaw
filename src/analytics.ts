import { app } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { resolveResourcesPath } from "./constants";
import { ensureDeviceId, getChannelId } from "./oneclaw-config";
import * as log from "./logger";
import {
  AnalyticsErrorType,
  buildActionResultProps,
  buildActionStartedProps,
  classifyAnalyticsErrorType,
} from "./analytics-events";

const HEARTBEAT_MS = 60 * 60 * 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_RETRY_DELAYS_MS = [0, 500, 1_500];
const SHUTDOWN_FLUSH_TIMEOUT_MS = 1_500;
const BUILD_CONFIG_NAME = "build-config.json";

// darwin 返回 "Apple M1 Pro" 这类；其他平台 DataFinder 允许留空。模块加载时算一次。
const DEVICE_MODEL = process.platform === "darwin"
  ? (os.cpus()[0]?.model ?? "").trim()
  : "";

// ── PostHog 配置（沿用原结构） ──

interface PostHogConfig {
  enabled: boolean;
  captureURL: string;
  captureFallbackURL: string;
  apiKey: string;
  requestTimeoutMs: number;
  retryDelaysMs: number[];
}

// ── 火山 DataFinder 配置 ──

interface VolcanoConfig {
  enabled: boolean;
  appKey: string;
  endpoint: string;
  fallbackEndpoint: string;
  requestTimeoutMs: number;
  retryDelaysMs: number[];
}

// ── Sink 抽象：每个 sink 持有自己的 payload 构建、鉴权头、endpoint、retry 参数 ──

interface SinkConfig {
  name: string;
  enabled: boolean;
  endpoints: string[];
  buildPayload: (event: string, eventProps: AnalyticsEventProps) => Record<string, unknown>;
  headers: Record<string, string>;
  requestTimeoutMs: number;
  retryDelaysMs: number[];
  currentURL: string;
}

type AnalyticsEventProps = object;
export type SetupAction = "verify_key" | "save_config" | "complete";
export type SettingsAction =
  | "verify_key"
  | "save_provider"
  | "save_channel"
  | "save_kimi"
  | "save_kimi_search"
  | "save_advanced";

interface TrackActionResultOptions {
  success: boolean;
  latencyMs: number;
  errorType?: AnalyticsErrorType;
  props?: Record<string, unknown>;
}

type PartialBuildConfig = { posthog: Partial<PostHogConfig>; volcano: Partial<VolcanoConfig> };

let sinks: SinkConfig[] = [];
let deviceId = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let pendingSends = new Set<Promise<void>>();
let resolvedConfigPath = "";

// 读取或生成持久化 device ID（委托给 oneclaw-config 统一管理）
function getDeviceId(): string {
  return ensureDeviceId();
}

// 每个事件附带的公共属性（PostHog 平铺使用）
function commonProps(): Record<string, string> {
  const props: Record<string, string> = {
    app_version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron_version: process.versions.electron,
  };
  const channelId = getChannelId();
  if (channelId) props.channel_id = channelId;
  return props;
}

// DataFinder `header.custom` 用的公共属性：只放 header 标准字段之外、OneClaw 独有的字段
// （app_version/platform 已由 header.app_version/header.os_name 承载，不重复塞进来）
function volcanoCustomProps(): Record<string, string> {
  const props: Record<string, string> = {
    arch: process.arch,
    electron_version: process.versions.electron,
  };
  const channelId = getChannelId();
  if (channelId) props.channel_id = channelId;
  return props;
}

// 构建 build-config.json 候选路径，兼容打包安装与本地 unpacked 运行。
function buildConfigPathCandidates(): string[] {
  const appPath = app.getAppPath();
  const appDir = path.dirname(appPath);
  const candidates = [
    path.join(resolveResourcesPath(), BUILD_CONFIG_NAME),
    path.join(process.resourcesPath, "resources", BUILD_CONFIG_NAME),
    path.join(process.resourcesPath, BUILD_CONFIG_NAME),
    path.join(appDir, "resources", BUILD_CONFIG_NAME),
    path.join(appDir, BUILD_CONFIG_NAME),
  ];
  return Array.from(new Set(candidates));
}

function emptyBuildConfig(): PartialBuildConfig {
  return { posthog: {} as Partial<PostHogConfig>, volcano: {} as Partial<VolcanoConfig> };
}

function looksLikeLegacyPostHogConfig(value: unknown): value is Partial<PostHogConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return [
    "enabled",
    "captureURL",
    "captureFallbackURL",
    "apiKey",
    "requestTimeoutMs",
    "retryDelaysMs",
  ].some((key) => key in value);
}

export function parseAnalyticsBuildConfig(raw: unknown): PartialBuildConfig {
  const empty = emptyBuildConfig();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return empty;

  const parsed = raw as Record<string, unknown>;
  const legacyPostHog = parsed.analytics ?? (looksLikeLegacyPostHogConfig(parsed) ? parsed : undefined);
  const posthog = (parsed.posthog ?? legacyPostHog ?? {}) as Partial<PostHogConfig>;
  const volcano = (parsed.volcano ?? {}) as Partial<VolcanoConfig>;

  return { posthog, volcano };
}

// 从打包注入的 build-config.json 读取全量配置。
function readPackagedConfig(): PartialBuildConfig {
  const empty = emptyBuildConfig();
  const candidates = buildConfigPathCandidates();
  const cfgPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!cfgPath) return empty;
  resolvedConfigPath = cfgPath;

  try {
    // 优先读新 schema 的 posthog/volcano 字段；若开发机残留旧 build-config.json（嵌套 analytics
    // 或扁平 PostHog），由 parseAnalyticsBuildConfig 负责回退，避免静默把 PostHog 关掉。
    return parseAnalyticsBuildConfig(JSON.parse(fs.readFileSync(cfgPath, "utf-8")));
  } catch (err) {
    log.warn(`[analytics] 配置解析失败: ${String(err)}`);
    return empty;
  }
}

// 公共：解析 retryDelaysMs 数组。
function normalizeRetryDelays(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_RETRY_DELAYS_MS];
  const delays = raw
    .map((value) => Number.parseInt(String(value), 10))
    .filter((value) => Number.isFinite(value) && value >= 0);
  return delays.length > 0 ? delays : [...DEFAULT_RETRY_DELAYS_MS];
}

// 规范化 PostHog 配置：缺少关键字段时自动关闭，避免运行时半残状态。
function normalizePostHogConfig(raw: Partial<PostHogConfig>): PostHogConfig {
  const captureURL = (raw.captureURL ?? "").trim();
  const apiKey = (raw.apiKey ?? "").trim();
  const captureFallbackURL = (raw.captureFallbackURL ?? "").trim() || captureURL;
  const requestTimeoutMs =
    typeof raw.requestTimeoutMs === "number" && raw.requestTimeoutMs > 0
      ? raw.requestTimeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const retryDelaysMs = normalizeRetryDelays(raw.retryDelaysMs);
  const hasCore = captureURL.length > 0 && apiKey.length > 0;
  const enabled = raw.enabled === true && hasCore;

  return { enabled, captureURL, captureFallbackURL, apiKey, requestTimeoutMs, retryDelaysMs };
}

// 规范化火山 DataFinder 配置。
export function normalizeVolcanoConfig(raw: Partial<VolcanoConfig>): VolcanoConfig {
  const appKey = (typeof raw.appKey === "string" ? raw.appKey : "").trim();
  const endpoint = (typeof raw.endpoint === "string" ? raw.endpoint : "").trim();
  const fallbackEndpoint = (typeof raw.fallbackEndpoint === "string" ? raw.fallbackEndpoint : "").trim() || endpoint;
  const requestTimeoutMs =
    typeof raw.requestTimeoutMs === "number" && raw.requestTimeoutMs > 0
      ? raw.requestTimeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const retryDelaysMs = normalizeRetryDelays(raw.retryDelaysMs);
  const hasCore = endpoint.length > 0 && appKey.length > 0;
  const enabled = raw.enabled === true && hasCore;

  return { enabled, appKey, endpoint, fallbackEndpoint, requestTimeoutMs, retryDelaysMs };
}

// 映射 process.platform 到 DataFinder 的 os_name 枚举。
function volcanoOsName(): string {
  switch (process.platform) {
    case "darwin": return "mac";
    case "win32": return "windows";
    default: return "linux";
  }
}

// 创建 PostHog sink。
function createPostHogSink(config: PostHogConfig): SinkConfig {
  const endpoints = Array.from(
    new Set([config.captureURL, config.captureFallbackURL].filter((u) => u.length > 0)),
  );
  return {
    name: "posthog",
    enabled: config.enabled,
    endpoints,
    buildPayload: (event, eventProps) => ({
      api_key: config.apiKey,
      event,
      distinct_id: deviceId,
      properties: { ...commonProps(), ...(eventProps as Record<string, unknown>) },
      timestamp: new Date().toISOString(),
    }),
    headers: { "Content-Type": "application/json" },
    requestTimeoutMs: config.requestTimeoutMs,
    retryDelaysMs: config.retryDelaysMs,
    currentURL: config.captureURL,
  };
}

// 创建火山 DataFinder sink。
export function createVolcanoSink(config: VolcanoConfig): SinkConfig {
  const endpoints = Array.from(
    new Set([config.endpoint, config.fallbackEndpoint].filter((u) => u.length > 0)),
  );
  return {
    name: "volcano",
    enabled: config.enabled,
    endpoints,
    buildPayload: (event, eventProps) => ({
      user: { user_unique_id: deviceId },
      header: {
        app_name: "OneClaw",
        app_version: app.getVersion(),
        os_name: volcanoOsName(),
        os_version: typeof process.getSystemVersion === "function" ? process.getSystemVersion() : "",
        device_model: DEVICE_MODEL,
        custom: JSON.stringify(volcanoCustomProps()),
      },
      events: [{
        event,
        params: JSON.stringify(eventProps),
        local_time_ms: Date.now(),
      }],
    }),
    headers: {
      "Content-Type": "application/json",
      "X-MCS-AppKey": config.appKey,
      "User-Agent": `OneClaw/${app.getVersion()}`,
    },
    requestTimeoutMs: config.requestTimeoutMs,
    retryDelaysMs: config.retryDelaysMs,
    currentURL: config.endpoint,
  };
}

// 格式化错误文本，尽量保留底层 cause 便于排障。
function formatErr(err: unknown): string {
  if (!err) return "unknown";
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeText = cause ? ` cause=${String(cause)}` : "";
    return `${err.name}: ${err.message}${causeText}`;
  }
  return String(err);
}

// 发送 JSON 请求并校验 HTTP 状态，非 2xx 直接报错。
async function postJSON(
  url: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<void> {
  const body = JSON.stringify(payload);
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(timeoutMs)
      : undefined;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    signal: timeoutSignal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const detail = text ? ` body=${text.slice(0, 200)}` : "";
    throw new Error(`HTTP ${response.status}${detail}`);
  }
}

// 简单 sleep，给重试退避使用。
async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// 向单个 sink 发送事件：支持重试并在主/备地址之间切换。
async function sendToSink(sink: SinkConfig, event: string, eventProps: AnalyticsEventProps): Promise<void> {
  if (!sink.enabled) return;

  let payload: Record<string, unknown>;
  try {
    payload = sink.buildPayload(event, eventProps);
  } catch (err) {
    log.error(`[analytics] drop event=${event} sink=${sink.name} err=${formatErr(err)}`);
    return;
  }
  const targets = Array.from(
    new Set(
      (sink.currentURL === sink.endpoints[0]
        ? sink.endpoints
        : [...sink.endpoints].reverse()
      ).filter((u) => u.length > 0),
    ),
  );

  let lastErr = "";
  for (let i = 0; i < sink.retryDelaysMs.length; i++) {
    const delay = sink.retryDelaysMs[i];
    if (delay > 0) {
      await sleep(delay);
    }

    for (const url of targets) {
      try {
        await postJSON(url, payload, sink.headers, sink.requestTimeoutMs);
        sink.currentURL = url;
        log.info(`[analytics] sent event=${event} sink=${sink.name} attempt=${i + 1}`);
        return;
      } catch (err) {
        lastErr = formatErr(err);
        log.warn(`[analytics] retry event=${event} sink=${sink.name} attempt=${i + 1} err=${lastErr}`);
      }
    }
  }

  log.error(`[analytics] give up event=${event} sink=${sink.name} lastErr=${lastErr}`);
}

async function flushPendingSends(timeoutMs: number): Promise<void> {
  if (pendingSends.size === 0) return;

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  const flushPromise = Promise.allSettled(Array.from(pendingSends)).then(() => "flushed" as const);
  const result = await Promise.race([flushPromise, timeoutPromise]);

  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  if (result === "timeout" && pendingSends.size > 0) {
    log.warn(`[analytics] shutdown flush timed out pending=${pendingSends.size} timeoutMs=${timeoutMs}`);
  }
}

// 初始化埋点模块并启动心跳上报。
export function init(): void {
  deviceId = getDeviceId();
  const raw = readPackagedConfig();

  const postHogConfig = normalizePostHogConfig(raw.posthog);
  const volcanoConfig = normalizeVolcanoConfig(raw.volcano);

  sinks = [createPostHogSink(postHogConfig), createVolcanoSink(volcanoConfig)];

  for (const sink of sinks) {
    if (sink.enabled) {
      log.info(`[analytics] ${sink.name} enabled config=${resolvedConfigPath || "none"}`);
    } else {
      log.info(`[analytics] ${sink.name} disabled`);
    }
  }

  // 每次 track() 会向所有 enabled sink 并发 fetch。init 期打印扇出规模，便于
  // 排查 setup/settings 高频操作时的请求量放大。
  const enabledNames = sinks.filter((s) => s.enabled).map((s) => s.name);
  log.info(`[analytics] track fan-out=${enabledNames.length} sinks=[${enabledNames.join(",")}]`);

  heartbeatTimer = setInterval(() => {
    track("app_heartbeat");
  }, HEARTBEAT_MS);
}

// 上报事件（唯一入口）。
export function track(event: string, eventProps: AnalyticsEventProps = {}): void {
  if (!deviceId) {
    deviceId = getDeviceId();
  }
  for (const sink of sinks) {
    const pending = sendToSink(sink, event, eventProps)
      .catch((err) => {
        log.error(`[analytics] unexpected failure event=${event} sink=${sink.name} err=${formatErr(err)}`);
      })
      .finally(() => {
        pendingSends.delete(pending);
      });
    pendingSends.add(pending);
  }
}

// 暴露统一错误分类，供 setup/settings 处理层复用同一套错误枚举。
export function classifyErrorType(input: unknown): AnalyticsErrorType {
  return classifyAnalyticsErrorType(input);
}

// 统一上报 action_started，保证 setup/settings 事件属性结构一致。
function trackActionStarted(
  event: "setup_action_started" | "settings_action_started",
  action: string,
  props: Record<string, unknown> = {},
): void {
  track(event, buildActionStartedProps(action, props));
}

// 统一上报 action_result，保证 success/latency/error_type 字段稳定。
function trackActionResult(
  event: "setup_action_result" | "settings_action_result",
  action: string,
  options: TrackActionResultOptions,
): void {
  track(
    event,
    buildActionResultProps(action, {
      success: options.success,
      latencyMs: options.latencyMs,
      errorType: options.errorType,
      extra: options.props,
    }),
  );
}

// 上报 setup 流程动作开始。
export function trackSetupActionStarted(action: SetupAction, props: Record<string, unknown> = {}): void {
  trackActionStarted("setup_action_started", action, props);
}

// 上报 setup 流程动作结果。
export function trackSetupActionResult(action: SetupAction, options: TrackActionResultOptions): void {
  trackActionResult("setup_action_result", action, options);
}

// 上报 setup 流程被用户中断。
export function trackSetupAbandoned(props: Record<string, unknown> = {}): void {
  track("setup_abandoned", props);
}

// 上报 settings 流程动作开始。
export function trackSettingsActionStarted(
  action: SettingsAction,
  props: Record<string, unknown> = {},
): void {
  trackActionStarted("settings_action_started", action, props);
}

// 上报 settings 流程动作结果。
export function trackSettingsActionResult(action: SettingsAction, options: TrackActionResultOptions): void {
  trackActionResult("settings_action_result", action, options);
}

// 停止心跳；退出阶段给 in-flight 请求一个很短的 flush 窗口，尽量送达终态事件。
export async function shutdown(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
  await flushPendingSends(SHUTDOWN_FLUSH_TIMEOUT_MS);
}
