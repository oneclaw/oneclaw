import * as https from "https";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { shell } from "electron";
import { resolveUserStateDir } from "./constants";
import * as log from "./logger";

// ── 常量 ──

const KIMI_CODE_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
const OAUTH_HOST = "auth.kimi.com";
const POLL_MAX_RETRIES = 120;

// token 刷新间隔（60 秒，对齐 kimi-cli）
const REFRESH_CHECK_INTERVAL_MS = 60 * 1000;
// 剩余不足 300 秒时触发刷新（对齐 kimi-cli 的 5 分钟阈值）
const REFRESH_THRESHOLD_S = 300;

// ── 类型 ──

interface DeviceAuthResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
  interval: number;
}

export interface OAuthToken {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string;
  token_type: string;
}

// ── Token 持久化（sidecar 文件） ──

// token 文件路径
function resolveOAuthTokenPath(): string {
  return path.join(resolveUserStateDir(), "credentials", "kimi-oauth-token.json");
}

// 读取已保存的 OAuth token
export function loadOAuthToken(): OAuthToken | null {
  try {
    const raw = fs.readFileSync(resolveOAuthTokenPath(), "utf-8");
    return JSON.parse(raw) as OAuthToken;
  } catch {
    return null;
  }
}

// 写入 token 并限制文件权限
function saveOAuthToken(token: OAuthToken): void {
  const filePath = resolveOAuthTokenPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(token, null, 2), "utf-8");
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {}
}

// 删除 token 文件
export function deleteOAuthToken(): void {
  try {
    fs.unlinkSync(resolveOAuthTokenPath());
  } catch {}
}

// ── 设备信息 HTTP 头 ──

function commonHeaders(): Record<string, string> {
  return {
    "X-Msh-Platform": "oneclaw",
    "X-Msh-Device-Name": os.hostname().replace(/[^\x20-\x7E]/g, ""),
    "X-Msh-Device-Model": `${os.type()} ${os.release()} ${os.arch()}`,
    "X-Msh-Os-Version": os.version?.() ?? os.release(),
  };
}

// ── HTTP 工具 ──

// POST application/x-www-form-urlencoded 到 OAuth 服务器
function postForm(
  urlPath: string,
  body: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const encoded = Object.entries(body)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const req = https.request(
      {
        hostname: OAUTH_HOST,
        path: urlPath,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...commonHeaders(),
        },
        timeout: 15000,
      },
      (res) => {
        let raw = "";
        res.on("data", (d) => (raw += d));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
          } catch {
            reject(new Error(`响应解析失败: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", (e) => reject(new Error(`网络错误: ${e.message}`)));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("请求超时"));
    });
    req.write(encoded);
    req.end();
  });
}

// ── 核心函数 ──

// 请求设备授权码
async function requestDeviceAuthorization(): Promise<DeviceAuthResponse> {
  const { status, data } = await postForm("/api/oauth/device_authorization", {
    client_id: KIMI_CODE_CLIENT_ID,
  });
  if (status < 200 || status >= 300) {
    throw new Error(`设备授权请求失败 (${status})`);
  }
  return data as unknown as DeviceAuthResponse;
}

// 等待指定毫秒
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// 轮询中止标志
let abortFlag = false;

// 取消正在进行的 OAuth 登录
export function kimiOAuthCancel(): void {
  abortFlag = true;
}

// 轮询等待用户完成授权
async function pollForToken(
  deviceCode: string,
  interval: number,
  onWaiting?: () => void,
): Promise<OAuthToken> {
  for (let i = 0; i < POLL_MAX_RETRIES; i++) {
    await sleep(interval * 1000);
    if (abortFlag) throw new Error("已取消");

    const { data } = await postForm("/api/oauth/token", {
      client_id: KIMI_CODE_CLIENT_ID,
      device_code: deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    // 授权成功
    if (data.access_token) {
      return {
        access_token: data.access_token as string,
        refresh_token: data.refresh_token as string,
        expires_at: Math.floor(Date.now() / 1000) + (data.expires_in as number),
        scope: (data.scope as string) ?? "",
        token_type: (data.token_type as string) ?? "Bearer",
      };
    }

    const errorCode = data.error as string | undefined;

    if (errorCode === "expired_token") {
      throw new Error("授权已过期，请重新登录");
    }

    // authorization_pending / slow_down：继续轮询
    if (errorCode === "authorization_pending" || errorCode === "slow_down") {
      onWaiting?.();
      continue;
    }

    // 未知错误
    if (errorCode) {
      throw new Error(`OAuth 错误: ${errorCode}`);
    }
  }
  throw new Error("轮询超时，请重新登录");
}

// 刷新 access_token
export async function refreshOAuthToken(token: OAuthToken): Promise<OAuthToken> {
  const { status, data } = await postForm("/api/oauth/token", {
    client_id: KIMI_CODE_CLIENT_ID,
    grant_type: "refresh_token",
    refresh_token: token.refresh_token,
  });

  if (status === 401 || status === 403) {
    deleteOAuthToken();
    throw new Error("Refresh token 已失效，请重新登录");
  }

  if (status < 200 || status >= 300) {
    throw new Error(`Token 刷新失败 (${status})`);
  }

  const refreshed: OAuthToken = {
    access_token: data.access_token as string,
    refresh_token: (data.refresh_token as string) ?? token.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (data.expires_in as number),
    scope: (data.scope as string) ?? token.scope,
    token_type: (data.token_type as string) ?? token.token_type,
  };
  saveOAuthToken(refreshed);
  return refreshed;
}

// 完整登录流程：设备授权 → 打开浏览器 → 轮询等待 → 保存 token（开始前重置中止标志）
export async function kimiOAuthLogin(): Promise<{
  success: boolean;
  accessToken?: string;
  message?: string;
}> {
  abortFlag = false;
  try {
    const auth = await requestDeviceAuthorization();
    log.info(`Kimi OAuth: 用户码 ${auth.user_code}，等待浏览器授权`);

    await shell.openExternal(auth.verification_uri_complete);

    const token = await pollForToken(auth.device_code, auth.interval);
    saveOAuthToken(token);
    log.info("Kimi OAuth: 登录成功");
    return { success: true, accessToken: token.access_token };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Kimi OAuth: 登录失败 — ${msg}`);
    return { success: false, message: msg };
  }
}

// ── Token 定时刷新 ──

let refreshTimer: ReturnType<typeof setInterval> | null = null;

// 单次检查并刷新（供定时器和启动时复用）
async function checkAndRefresh(onTokenRefreshed?: (token: OAuthToken) => void): Promise<void> {
  const token = loadOAuthToken();
  if (!token) return;

  const remaining = token.expires_at - Math.floor(Date.now() / 1000);
  if (remaining >= REFRESH_THRESHOLD_S) return;

  try {
    const refreshed = await refreshOAuthToken(token);
    log.info("Kimi OAuth: token 已自动刷新");
    onTokenRefreshed?.(refreshed);
  } catch (e: unknown) {
    log.error(`Kimi OAuth: 自动刷新失败 — ${e instanceof Error ? e.message : e}`);
  }
}

// 启动定时刷新（立即检查一次，之后每 60 秒轮询）
export function startTokenRefresh(onTokenRefreshed?: (token: OAuthToken) => void): void {
  stopTokenRefresh();
  // 启动时立即检查，不等第一个 interval（覆盖关闭超过 15 分钟后重启的场景）
  checkAndRefresh(onTokenRefreshed);
  refreshTimer = setInterval(() => checkAndRefresh(onTokenRefreshed), REFRESH_CHECK_INTERVAL_MS);
}

// 停止定时刷新
export function stopTokenRefresh(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}

// 返回当前 OAuth 登录状态
export function getOAuthStatus(): { loggedIn: boolean; expiresAt?: number } {
  const token = loadOAuthToken();
  if (!token) return { loggedIn: false };
  return { loggedIn: true, expiresAt: token.expires_at };
}

// 登出：删除 token 文件 + 停止自动刷新
export function kimiOAuthLogout(): void {
  deleteOAuthToken();
  stopTokenRefresh();
  log.info("Kimi OAuth: 已登出");
}
