import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { resolveGatewayPackageDir, resolveUserExtensionsDir, resolveUserStateDir } from "./constants";

export const WEIXIN_PLUGIN_ID = "openclaw-weixin";
export const WEIXIN_CHANNEL_ID = "openclaw-weixin";

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_BOT_TYPE = "3";
const QR_POLL_TIMEOUT_MS = 35_000;

export interface ExtractedWeixinConfig {
  enabled: boolean;
}

export interface SaveWeixinConfigParams {
  enabled: boolean;
}

// 统一解析微信插件目录。微信插件已迁出 gateway.asar，由 extension-mirror reconcile
// 到 ~/.openclaw/extensions/openclaw-weixin/ 后由 openclaw external-plugin scan 加载。
export function resolveWeixinPluginDir(): string {
  return path.join(resolveUserExtensionsDir(), WEIXIN_PLUGIN_ID);
}

// 检查微信插件是否已 reconcile 到用户目录。reconcile 在 main process 启动时执行，
// 因此本函数被调用时插件应已就位；缺失通常意味着 mirror 也缺（打包异常）。
export function isWeixinPluginBundled(): boolean {
  const pluginDir = resolveWeixinPluginDir();
  const hasEntry =
    fs.existsSync(path.join(pluginDir, "index.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.js"));
  return hasEntry && fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}

// 从当前用户配置中提取微信配置，供设置页回显。
export function extractWeixinConfig(config: any): ExtractedWeixinConfig {
  const entry = config?.plugins?.entries?.[WEIXIN_PLUGIN_ID];
  const channel = config?.channels?.[WEIXIN_CHANNEL_ID];
  return {
    enabled: entry?.enabled === true || channel?.enabled === true,
  };
}

// 写入微信配置时保留高级字段，仅覆盖设置页可管理的核心字段。
export function saveWeixinConfig(config: any, params: SaveWeixinConfigParams): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.channels ??= {};

  const existingEntry =
    typeof config.plugins.entries[WEIXIN_PLUGIN_ID] === "object" &&
    config.plugins.entries[WEIXIN_PLUGIN_ID] !== null
      ? config.plugins.entries[WEIXIN_PLUGIN_ID]
      : {};
  const existingChannel =
    typeof config.channels[WEIXIN_CHANNEL_ID] === "object" &&
    config.channels[WEIXIN_CHANNEL_ID] !== null
      ? config.channels[WEIXIN_CHANNEL_ID]
      : {};

  config.plugins.entries[WEIXIN_PLUGIN_ID] = {
    ...existingEntry,
    enabled: params.enabled === true,
  };

  config.channels[WEIXIN_CHANNEL_ID] = {
    ...existingChannel,
    enabled: params.enabled === true,
    // openclaw gateway 的 hasMeaningfulChannelConfig() 只有在 channels.<id> 里
    // 存在非 enabled 字段时才把该 channel 视作 "已配置"，进而纳入启动插件集合。
    // 写一个时间戳字段，让 weixin 通过 hasMeaningfulChannelConfig 检查。
    channelConfigUpdatedAt: new Date().toISOString(),
  };
}

// ── HTTP 请求工具（用 Node.js https 模块，避免 Electron main process fetch 兼容性问题） ──

function httpsGet(url: string, headers?: Record<string, string>, timeoutMs = 35_000): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf-8") }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("请求超时")); });
  });
}

// 下载远程图片并转为 base64 data URL。
function httpsGetBinary(url: string): Promise<{ mime: string; base64: string }> {
  return new Promise((resolve, reject) => {
    https.get(url, { timeout: 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const mime = res.headers["content-type"] || "image/png";
        resolve({ mime, base64: buf.toString("base64") });
      });
    }).on("error", reject);
  });
}

// ── QR 码生成（复用 gateway 内置的 qrcode-terminal vendor） ──

// 将文本编码为 QR 码 BMP data URL（用于 Settings UI 展示）。
function generateQrDataUrl(text: string): string {
  // 复用 gateway node_modules 中 qrcode-terminal 的 QR 编码器
  // qrcode-terminal 在 gateway/node_modules/ 下，与 openclaw 同级
  const qrVendorDir = path.join(resolveGatewayPackageDir(), "..", "qrcode-terminal", "vendor", "QRCode");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const QRCode = require(path.join(qrVendorDir, "index.js"));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const QRErrorCorrectLevel = require(path.join(qrVendorDir, "QRErrorCorrectLevel.js"));

  const qr = new QRCode(-1, QRErrorCorrectLevel.M);
  qr.addData(text);
  qr.make();

  const moduleCount = qr.getModuleCount();
  const margin = 4;
  const cellSize = 4;
  const imgSize = moduleCount * cellSize + margin * 2;

  // 生成未压缩 BMP（最简格式，无需 PNG 编码器）
  const rowBytes = Math.ceil(imgSize / 8);
  const rowPadded = (rowBytes + 3) & ~3;
  const pixelDataSize = rowPadded * imgSize;
  const fileSize = 62 + pixelDataSize; // BMP header(14) + DIB header(40) + palette(8) + pixel data

  const buf = Buffer.alloc(fileSize);
  // BMP 文件头
  buf.write("BM", 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(62, 10); // pixel data offset
  // DIB 头（BITMAPINFOHEADER）
  buf.writeUInt32LE(40, 14); // DIB header size
  buf.writeInt32LE(imgSize, 18); // width
  buf.writeInt32LE(-imgSize, 22); // height (负值 = top-down)
  buf.writeUInt16LE(1, 26); // planes
  buf.writeUInt16LE(1, 28); // bpp = 1
  buf.writeUInt32LE(0, 30); // no compression
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeUInt32LE(2835, 38); // h-res
  buf.writeUInt32LE(2835, 42); // v-res
  buf.writeUInt32LE(2, 46); // colors in palette
  buf.writeUInt32LE(2, 50); // important colors
  // 调色板: 0=白, 1=黑
  buf.writeUInt32LE(0x00FFFFFF, 54); // color 0 = white (BGR + reserved)
  buf.writeUInt32LE(0x00000000, 58); // color 1 = black

  // 像素数据
  const dataOffset = 62;
  for (let y = 0; y < imgSize; y++) {
    for (let x = 0; x < imgSize; x++) {
      const qrX = Math.floor((x - margin) / cellSize);
      const qrY = Math.floor((y - margin) / cellSize);
      const isDark =
        qrX >= 0 && qrX < moduleCount && qrY >= 0 && qrY < moduleCount
          ? qr.isDark(qrY, qrX)
          : false;
      if (isDark) {
        const byteIdx = dataOffset + y * rowPadded + Math.floor(x / 8);
        buf[byteIdx] |= 0x80 >> (x % 8);
      }
    }
  }

  return `data:image/bmp;base64,${buf.toString("base64")}`;
}

// ── 微信 QR 扫码登录（直接调用 iLink HTTP API，绕过 Gateway RPC） ──

export interface WeixinQrStartResult {
  qrcodeUrl?: string;
  qrcode?: string;
  message: string;
}

export interface WeixinQrPollResult {
  status: "wait" | "scaned" | "confirmed" | "expired";
  botToken?: string;
  accountId?: string;
  baseUrl?: string;
  userId?: string;
}

// 调用 iLink API 获取微信登录二维码。
export async function startWeixinQrLogin(): Promise<WeixinQrStartResult> {
  const base = DEFAULT_BASE_URL.endsWith("/") ? DEFAULT_BASE_URL : `${DEFAULT_BASE_URL}/`;
  const url = `${base}ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(DEFAULT_BOT_TYPE)}`;

  const res = await httpsGet(url);
  if (res.status !== 200) {
    throw new Error(`获取二维码失败: HTTP ${res.status}`);
  }

  const data = JSON.parse(res.body) as { qrcode: string; qrcode_img_content: string };

  // qrcode_img_content 是需要编码成二维码的 URL，用 QR 编码器生成 data URL。
  const qrDataUrl = generateQrDataUrl(data.qrcode_img_content);

  return {
    qrcodeUrl: qrDataUrl,
    qrcode: data.qrcode,
    message: "使用微信扫描以下二维码，以完成连接。",
  };
}

// 单次长轮询二维码扫码状态（约 35s 超时后返回 wait）。
export async function pollWeixinQrStatus(qrcode: string): Promise<WeixinQrPollResult> {
  const base = DEFAULT_BASE_URL.endsWith("/") ? DEFAULT_BASE_URL : `${DEFAULT_BASE_URL}/`;
  const url = `${base}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;

  try {
    const res = await httpsGet(url, { "iLink-App-ClientVersion": "1" }, QR_POLL_TIMEOUT_MS);
    if (res.status !== 200) {
      throw new Error(`轮询二维码状态失败: HTTP ${res.status}`);
    }

    const data = JSON.parse(res.body) as {
      status: "wait" | "scaned" | "confirmed" | "expired";
      bot_token?: string;
      ilink_bot_id?: string;
      baseurl?: string;
      ilink_user_id?: string;
    };

    return {
      status: data.status,
      botToken: data.bot_token,
      accountId: data.ilink_bot_id,
      baseUrl: data.baseurl,
      userId: data.ilink_user_id,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "请求超时") {
      return { status: "wait" };
    }
    throw err;
  }
}

// 规范化 account ID（与 openclaw/plugin-sdk 的 normalizeAccountId 一致）。
function normalizeAccountId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "default";
  return trimmed.replace(/[^a-z0-9-]/g, "-").replace(/^-+/, "").replace(/-+$/, "").slice(0, 64) || "default";
}

// 微信状态目录。
function resolveWeixinStateDir(): string {
  return path.join(resolveUserStateDir(), "openclaw-weixin");
}

// 账号索引文件。
function resolveAccountIndexPath(): string {
  return path.join(resolveWeixinStateDir(), "accounts.json");
}

// 账号数据目录。
function resolveAccountsDir(): string {
  return path.join(resolveWeixinStateDir(), "accounts");
}

// 读取已注册的微信账号列表。
export function listWeixinAccountIds(): string[] {
  const filePath = resolveAccountIndexPath();
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id: unknown): id is string => typeof id === "string" && (id as string).trim() !== "");
  } catch {
    return [];
  }
}

// 登录成功后保存账号凭据（与微信插件写入路径一致）。
export function saveWeixinLoginResult(result: WeixinQrPollResult): string {
  if (!result.accountId) throw new Error("缺少 accountId");
  if (!result.botToken) throw new Error("缺少 botToken");

  const normalizedId = normalizeAccountId(result.accountId);

  // 写账号数据
  const accountsDir = resolveAccountsDir();
  fs.mkdirSync(accountsDir, { recursive: true });

  const data = {
    ...(result.botToken ? { token: result.botToken, savedAt: new Date().toISOString() } : {}),
    ...(result.baseUrl ? { baseUrl: result.baseUrl } : {}),
    ...(result.userId ? { userId: result.userId } : {}),
  };

  const accountPath = path.join(accountsDir, `${normalizedId}.json`);
  fs.writeFileSync(accountPath, JSON.stringify(data, null, 2), "utf-8");
  try { fs.chmodSync(accountPath, 0o600); } catch {}

  // 注册到账号索引
  const stateDir = resolveWeixinStateDir();
  fs.mkdirSync(stateDir, { recursive: true });

  const indexPath = resolveAccountIndexPath();
  const existing = listWeixinAccountIds();
  if (!existing.includes(normalizedId)) {
    fs.writeFileSync(indexPath, JSON.stringify([...existing, normalizedId], null, 2), "utf-8");
  }

  return normalizedId;
}

// 登录成功后，账号凭据和 enabled 开关必须一起落盘；否则设置页会显示扫码成功，
// 但 Gateway 重启后不会真正启动微信 channel。
export function persistWeixinLoginSuccess(config: any, result: WeixinQrPollResult): string {
  const normalizedId = saveWeixinLoginResult(result);
  saveWeixinConfig(config, { enabled: true });
  return normalizedId;
}

// 清除所有微信账号凭据（断开连接时调用）。
export function clearWeixinAccounts(): void {
  const accountsDir = resolveAccountsDir();
  const indexPath = resolveAccountIndexPath();
  // 删除所有账号数据文件
  try {
    if (fs.existsSync(accountsDir)) {
      for (const file of fs.readdirSync(accountsDir)) {
        fs.unlinkSync(path.join(accountsDir, file));
      }
    }
  } catch {}
  // 清空账号索引
  try {
    fs.writeFileSync(indexPath, "[]", "utf-8");
  } catch {}
}
