import { app } from "electron";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { resolveResourcesPath, resolveUserStateDir } from "./constants";
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
const ANALYTICS_CONFIG_NAME = "analytics-config.json";

interface AnalyticsConfig {
  enabled: boolean;
  captureURL: string;
  captureFallbackURL: string;
  apiKey: string;
  requestTimeoutMs: number;
  retryDelaysMs: number[];
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

let analyticsConfig: AnalyticsConfig = {
  enabled: false,
  captureURL: "",
  captureFallbackURL: "",
  apiKey: "",
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  retryDelaysMs: [...DEFAULT_RETRY_DELAYS_MS],
};
let currentCaptureURL = "";
let deviceId = "";
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let resolvedConfigPath = "";

// 读取或生成持久化 device ID（固定写入 ~/.openclaw/.device-id）
function getDeviceId(): string {
  const dir = resolveUserStateDir();
  const idFile = path.join(dir, ".device-id");

  try {
    const id = fs.readFileSync(idFile, "utf-8").trim();
    if (id) return id;
  } catch { }

  const id = crypto.randomUUID();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(idFile, id, "utf-8");
  } catch { }
  return id;
}

// 每个事件附带的公共属性
function commonProps(): Record<string, string> {
  return {
    app_version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron_version: process.versions.electron,
  };
}

// 构建 analytics 配置文件候选路径，兼容打包安装与本地 unpacked 运行。
function buildConfigPathCandidates(): string[] {
  const appPath = app.getAppPath();
  const appDir = path.dirname(appPath);
  const candidates = [
    path.join(resolveResourcesPath(), ANALYTICS_CONFIG_NAME),
    path.join(process.resourcesPath, "resources", ANALYTICS_CONFIG_NAME),
    path.join(process.resourcesPath, ANALYTICS_CONFIG_NAME),
    path.join(appDir, "resources", ANALYTICS_CONFIG_NAME),
    path.join(appDir, ANALYTICS_CONFIG_NAME),
  ];
  return Array.from(new Set(candidates));
}

// 从打包注入的 analytics-config.json 读取配置。
function readPackagedConfig(): Partial<AnalyticsConfig> {
  const candidates = buildConfigPathCandidates();
  const cfgPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!cfgPath) return {};
  resolvedConfigPath = cfgPath;

  try {
    const parsed = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Partial<AnalyticsConfig>;
  } catch (err) {
    log.warn(`[analytics] 配置解析失败: ${String(err)}`);
    return {};
  }
}

// 规范化配置：缺少关键字段时自动关闭埋点，避免运行时半残状态。
function normalizeConfig(raw: Partial<AnalyticsConfig>): AnalyticsConfig {
  const captureURL = (raw.captureURL ?? "").trim();
  const apiKey = (raw.apiKey ?? "").trim();
  const captureFallbackURL = (raw.captureFallbackURL ?? "").trim() || captureURL;
  const requestTimeoutMs =
    typeof raw.requestTimeoutMs === "number" && raw.requestTimeoutMs > 0
      ? raw.requestTimeoutMs
      : DEFAULT_REQUEST_TIMEOUT_MS;
  const retryDelaysMs =
    Array.isArray(raw.retryDelaysMs) && raw.retryDelaysMs.length > 0
      ? raw.retryDelaysMs
        .map((value) => Number.parseInt(String(value), 10))
        .filter((value) => Number.isFinite(value) && value >= 0)
      : [...DEFAULT_RETRY_DELAYS_MS];
  const hasCore = captureURL.length > 0 && apiKey.length > 0;
  const enabled = raw.enabled === true && hasCore;

  return {
    enabled,
    captureURL,
    captureFallbackURL,
    apiKey,
    requestTimeoutMs,
    retryDelaysMs: retryDelaysMs.length > 0 ? retryDelaysMs : [...DEFAULT_RETRY_DELAYS_MS],
  };
}

// 初始化配置（仅使用打包注入配置）。
function loadAnalyticsConfig(): AnalyticsConfig {
  const cfg = normalizeConfig(readPackagedConfig());
  if (!cfg.enabled) {
    log.info(
      `[analytics] disabled config=${resolvedConfigPath || "none"} appPath=${app.getAppPath()} resourcesPath=${process.resourcesPath}`
    );
  } else {
    log.info(`[analytics] enabled config=${resolvedConfigPath || "none"}`);
  }
  return cfg;
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

// 构建 capture 接口 payload。
function buildPayload(event: string, eventProps: AnalyticsEventProps = {}): Record<string, unknown> {
  return {
    api_key: analyticsConfig.apiKey,
    event,
    distinct_id: deviceId,
    properties: {
      ...commonProps(),
      ...(eventProps as Record<string, unknown>),
    },
    timestamp: new Date().toISOString(),
  };
}

// 发送 JSON 请求并校验 HTTP 状态，非 2xx 直接报错。
async function postJSON(url: string, payload: Record<string, unknown>): Promise<void> {
  const body = JSON.stringify(payload);
  const timeoutSignal =
    typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
      ? AbortSignal.timeout(analyticsConfig.requestTimeoutMs)
      : undefined;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

// 统一发送埋点：支持重试并在主/备地址之间切换。
async function sendEvent(event: string, eventProps: AnalyticsEventProps = {}): Promise<void> {
  if (!analyticsConfig.enabled) return;

  const payload = buildPayload(event, eventProps);
  const targets = Array.from(
    new Set(
      (currentCaptureURL === analyticsConfig.captureURL
        ? [analyticsConfig.captureURL, analyticsConfig.captureFallbackURL]
        : [analyticsConfig.captureFallbackURL, analyticsConfig.captureURL]
      ).filter((item) => item.length > 0)
    )
  );

  let lastErr = "";
  for (let i = 0; i < analyticsConfig.retryDelaysMs.length; i++) {
    const delay = analyticsConfig.retryDelaysMs[i];
    if (delay > 0) {
      await sleep(delay);
    }

    for (const url of targets) {
      try {
        await postJSON(url, payload);
        currentCaptureURL = url;
        log.info(`[analytics] sent event=${event} attempt=${i + 1}`);
        return;
      } catch (err) {
        lastErr = formatErr(err);
        log.warn(`[analytics] retry event=${event} attempt=${i + 1} err=${lastErr}`);
      }
    }
  }

  log.error(`[analytics] give up event=${event} lastErr=${lastErr}`);
}

// 初始化埋点模块并启动心跳上报。
export function init(): void {
  deviceId = getDeviceId();
  analyticsConfig = loadAnalyticsConfig();
  currentCaptureURL = analyticsConfig.captureURL;

  heartbeatTimer = setInterval(() => {
    track("app_heartbeat");
  }, HEARTBEAT_MS);
}

// 上报事件（唯一入口）。
export function track(event: string, eventProps: AnalyticsEventProps = {}): void {
  if (!deviceId) {
    deviceId = getDeviceId();
  }
  void sendEvent(event, eventProps);
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

// 停止心跳；埋点是即时发送，不需要额外 flush。
export async function shutdown(): Promise<void> {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}
