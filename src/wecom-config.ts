import * as crypto from "crypto";
import * as fs from "fs";
import * as https from "https";
import * as path from "path";
import { resolveUserExtensionsDir } from "./constants";

export const WECOM_PLUGIN_ID = "wecom-openclaw-plugin";
export const WECOM_CHANNEL_ID = "wecom";

export type WecomDmPolicy = "pairing" | "open";
export type WecomGroupPolicy = "open" | "allowlist" | "disabled";

export interface ExtractedWecomConfig {
  enabled: boolean;
  botId: string;
  secret: string;
  dmPolicy: WecomDmPolicy;
  groupPolicy: WecomGroupPolicy;
  groupAllowFrom: string[];
}

export interface SaveWecomConfigParams {
  enabled: boolean;
  botId?: string;
  secret?: string;
  dmPolicy?: string;
  groupPolicy?: string;
  groupAllowFrom?: unknown;
}

// 统一解析企业微信插件目录。已迁出 gateway.asar，由 extension-mirror reconcile
// 到 ~/.openclaw/extensions/wecom-openclaw-plugin/ 后由 openclaw external-plugin scan 加载。
export function resolveWecomPluginDir(): string {
  return path.join(resolveUserExtensionsDir(), WECOM_PLUGIN_ID);
}

// 检查企业微信插件是否已经随应用一起打包。
export function isWecomPluginBundled(): boolean {
  const pluginDir = resolveWecomPluginDir();
  const hasEntry =
    fs.existsSync(path.join(pluginDir, "index.ts")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.js")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.cjs.js")) ||
    fs.existsSync(path.join(pluginDir, "dist", "index.esm.js"));
  return hasEntry && fs.existsSync(path.join(pluginDir, "openclaw.plugin.json"));
}

// 统一规整企业微信私聊策略，非法值回退到默认 pairing。
function normalizeWecomDmPolicy(value: unknown): WecomDmPolicy {
  return value === "open" ? "open" : "pairing";
}

// 统一规整企业微信群策略，非法值回退到默认 open。
function normalizeWecomGroupPolicy(value: unknown): WecomGroupPolicy {
  if (value === "allowlist" || value === "disabled") {
    return value;
  }
  return "open";
}

// 规范化字符串数组，顺手去重并过滤空值。
function normalizeWecomEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
    )
  );
}

// 当私聊策略是 open 时，确保 allowFrom 含有通配符，避免行为和配置漂移。
function normalizeWecomAllowFrom(dmPolicy: WecomDmPolicy, value: unknown): string[] {
  if (dmPolicy !== "open") {
    return normalizeWecomEntries(value);
  }
  return ["*"];
}

// 从当前用户配置中提取企业微信配置，供设置页回显。
export function extractWecomConfig(config: any): ExtractedWecomConfig {
  const entry = config?.plugins?.entries?.[WECOM_PLUGIN_ID];
  const channel = config?.channels?.[WECOM_CHANNEL_ID];
  return {
    enabled: entry?.enabled === true || channel?.enabled === true,
    botId: typeof channel?.botId === "string" ? channel.botId : "",
    secret: typeof channel?.secret === "string" ? channel.secret : "",
    dmPolicy: normalizeWecomDmPolicy(channel?.dmPolicy),
    groupPolicy: normalizeWecomGroupPolicy(channel?.groupPolicy),
    groupAllowFrom: normalizeWecomEntries(channel?.groupAllowFrom),
  };
}

// 写入企业微信配置时保留高级字段，仅覆盖设置页可管理的核心字段。
export function saveWecomConfig(config: any, params: SaveWecomConfigParams): void {
  config.plugins ??= {};
  config.plugins.entries ??= {};
  config.channels ??= {};

  const existingEntry =
    typeof config.plugins.entries[WECOM_PLUGIN_ID] === "object" &&
    config.plugins.entries[WECOM_PLUGIN_ID] !== null
      ? config.plugins.entries[WECOM_PLUGIN_ID]
      : {};
  const existingChannel =
    typeof config.channels[WECOM_CHANNEL_ID] === "object" &&
    config.channels[WECOM_CHANNEL_ID] !== null
      ? config.channels[WECOM_CHANNEL_ID]
      : {};

  config.plugins.entries[WECOM_PLUGIN_ID] = {
    ...existingEntry,
    enabled: params.enabled === true,
  };

  if (params.enabled !== true) {
    config.channels[WECOM_CHANNEL_ID] = {
      ...existingChannel,
      enabled: false,
    };
    return;
  }

  const dmPolicy = normalizeWecomDmPolicy(params.dmPolicy ?? existingChannel.dmPolicy);
  const groupPolicy = normalizeWecomGroupPolicy(params.groupPolicy ?? existingChannel.groupPolicy);
  const nextGroupAllowFrom =
    params.groupAllowFrom === undefined
      ? normalizeWecomEntries(existingChannel.groupAllowFrom)
      : normalizeWecomEntries(params.groupAllowFrom);

  config.channels[WECOM_CHANNEL_ID] = {
    ...existingChannel,
    enabled: true,
    botId: String(params.botId ?? "").trim(),
    secret: String(params.secret ?? "").trim(),
    dmPolicy,
    groupPolicy,
    allowFrom: normalizeWecomAllowFrom(dmPolicy, existingChannel.allowFrom),
    groupAllowFrom: nextGroupAllowFrom,
  };
}

// 企业微信凭据验证（通过 WebSocket 认证帧校验 botId + secret）。
// Electron 主进程无 WebSocket 全局，用 https + 手动 upgrade 实现。
export function verifyWecom(botId: string, secret: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      err ? reject(err) : resolve();
    };

    // WebSocket 握手 key
    const wsKey = crypto.randomBytes(16).toString("base64");

    const req = https.request(
      {
        hostname: "openws.work.weixin.qq.com",
        path: "/",
        method: "GET",
        headers: {
          "Connection": "Upgrade",
          "Upgrade": "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": wsKey,
        },
        timeout: 15000,
      }
    );

    req.on("upgrade", (_res, socket) => {
      // 握手成功，发送认证帧（WebSocket text frame）
      const frame = JSON.stringify({
        cmd: "aibot_subscribe",
        headers: { req_id: `aibot_subscribe_${Date.now()}_${Math.random().toString(16).slice(2, 10)}` },
        body: { bot_id: botId, secret },
      });
      socket.write(buildWsTextFrame(frame));

      // 接收响应帧
      const chunks: Buffer[] = [];
      socket.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
        const payload = parseWsTextFrame(Buffer.concat(chunks));
        if (payload === null) return; // 帧不完整，继续等待
        socket.destroy();
        try {
          const data = JSON.parse(payload);
          if (data.errcode === 0) {
            finish();
          } else {
            finish(new Error(data.errmsg || `企业微信验证失败 (errcode: ${data.errcode})`));
          }
        } catch {
          finish(new Error(`企业微信响应解析失败: ${payload.slice(0, 200)}`));
        }
      });

      socket.on("error", (e) => finish(new Error(`连接异常: ${e.message}`)));
      socket.setTimeout(10000, () => { socket.destroy(); finish(new Error("验证超时")); });
    });

    req.on("error", (e) => finish(new Error(`网络错误: ${e.message}`)));
    req.on("timeout", () => { req.destroy(); finish(new Error("连接超时")); });

    // 非 upgrade 响应（服务端拒绝）
    req.on("response", (res) => {
      res.resume();
      finish(new Error(`服务端拒绝 WebSocket 连接 (HTTP ${res.statusCode})`));
    });

    req.end();
  });
}

// 构造 WebSocket text frame（客户端发送需 mask）
function buildWsTextFrame(payload: string): Buffer {
  const data = Buffer.from(payload, "utf-8");
  const mask = crypto.randomBytes(4);
  let header: Buffer;

  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81; // FIN + TEXT
    header[1] = 0x80 | data.length; // MASK + len
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }

  // 应用 mask
  const masked = Buffer.alloc(data.length);
  for (let i = 0; i < data.length; i++) {
    masked[i] = data[i] ^ mask[i & 3];
  }

  return Buffer.concat([header, mask, masked]);
}

// 解析服务端 WebSocket text frame（服务端发送无 mask）
function parseWsTextFrame(buf: Buffer): string | null {
  if (buf.length < 2) return null;

  const masked = !!(buf[1] & 0x80);
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) return null;
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) return null;
    payloadLen = Number(buf.readBigUInt64BE(2));
    offset = 10;
  }

  if (masked) offset += 4;
  if (buf.length < offset + payloadLen) return null;

  return buf.subarray(offset, offset + payloadLen).toString("utf-8");
}
