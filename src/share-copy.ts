import * as fs from "fs";
import * as path from "path";

export type ShareCopyLocale = "zh" | "en";

type ShareCopyLocaleContent = {
  title: string;
  subtitle: string;
  body: string;
};

export type ShareCopyPayload = {
  version: number;
  locales: Record<ShareCopyLocale, ShareCopyLocaleContent>;
};

const SHARE_COPY_JSON_PATH = path.resolve(__dirname, "../settings/share-copy-content.json");
const REMOTE_SHARE_COPY_URL = "https://oneclaw.cn/config/share-copy-content.json";
const REMOTE_FETCH_TIMEOUT_MS = 4000;
const REMOTE_CACHE_TTL_MS = 5 * 60 * 1000;

let shareCopyCache: { expiresAt: number; payload: ShareCopyPayload } | null = null;
let shareCopyPendingPromise: Promise<ShareCopyPayload> | null = null;

// 兜底文案：远端不可用且本地文件异常时，保证分享能力不失效。
const FALLBACK_SHARE_COPY_PAYLOAD: ShareCopyPayload = {
  version: 1,
  locales: {
    zh: {
      title: "分享 OneClaw 给朋友",
      subtitle: "复制下面这段文案分享给你的朋友或群聊，作者会非常感谢你哟😘",
      body: [
        "我最近在用 OneClaw，很快就安装好了 OpenClaw。",
        "",
        "OneClaw 是 OpenClaw 的一键安装包，几分钟就能装好并开始用。",
        "",
        "他们说 OpenClaw 可以做这些事：",
        "• 浏览器操作：自动搜索浏览、定时信息抓取、处理汇总",
        "• 内容创作：文案写作、生成 AI 图片",
        "• 数据处理：处理 Excel 数据、制作图表",
        "• 办公自动化：批量处理邮件、简历筛选、填写表单",
        "• 会议助手：会前整理文件制作 PPT、会后快速生成纪要",
        "",
        "想低成本把内容、运营、办公、招聘自动化，可以直接试试：oneclaw.cn",
      ].join("\n"),
    },
    en: {
      title: "Share OneClaw with friends",
      subtitle:
        "Copy this text and share it with your friends or group chats. The creator will really appreciate it 😘",
      body: [
        "I've been using OneClaw lately, and it seriously boosts execution speed.",
        "",
        "OneClaw is a one-click installer for OpenClaw, so you can get started in minutes.",
        "",
        "What OpenClaw can do:",
        "• Browser automation: auto search and browsing, scheduled information capture, and summary processing",
        "• Content creation: copywriting and AI image generation",
        "• Data processing: Excel handling and chart building",
        "• Office automation: batch email processing, resume screening, and form filling",
        "• Meeting assistant: pre-meeting file prep + PPT generation, and fast post-meeting minutes",
        "",
        "If you want low-cost automation for content, operations, office, and recruiting, try: oneclaw.cn",
      ].join("\n"),
    },
  },
};

// 返回“当前可用的最新文案”，优先远端，失败回退本地；并做短时缓存减轻请求压力。
export async function getLatestShareCopyPayload(): Promise<ShareCopyPayload> {
  const now = Date.now();
  if (shareCopyCache && shareCopyCache.expiresAt > now) {
    return shareCopyCache.payload;
  }
  if (shareCopyPendingPromise) {
    return shareCopyPendingPromise;
  }
  shareCopyPendingPromise = (async () => {
    const localFallback = readShareCopyPayloadFromLocalFile();
    const remotePayload = await fetchShareCopyPayloadFromRemote(localFallback);
    const payload = remotePayload ?? localFallback;
    shareCopyCache = {
      payload,
      expiresAt: Date.now() + REMOTE_CACHE_TTL_MS,
    };
    return payload;
  })();
  try {
    return await shareCopyPendingPromise;
  } finally {
    shareCopyPendingPromise = null;
  }
}

// 读取本地 JSON 文案（随安装包分发），并做字段规整。
function readShareCopyPayloadFromLocalFile(): ShareCopyPayload {
  try {
    const raw = fs.readFileSync(SHARE_COPY_JSON_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return normalizeShareCopyPayload(parsed, FALLBACK_SHARE_COPY_PAYLOAD);
  } catch {
    return FALLBACK_SHARE_COPY_PAYLOAD;
  }
}

// 请求网站上的最新文案 JSON；失败时返回 null，让上层自动回退本地。
async function fetchShareCopyPayloadFromRemote(
  fallback: ShareCopyPayload,
): Promise<ShareCopyPayload | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REMOTE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(REMOTE_SHARE_COPY_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    const text = await response.text();
    const parsed = JSON.parse(text);
    return normalizeShareCopyPayload(parsed, fallback);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// 统一清洗远端/本地配置：语言缺失互相兜底，版本缺失回退默认版本。
function normalizeShareCopyPayload(input: unknown, fallback: ShareCopyPayload): ShareCopyPayload {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const version = normalizeVersion(data.version, fallback.version);
  const localesRaw =
    data.locales && typeof data.locales === "object"
      ? (data.locales as Record<string, unknown>)
      : {};
  const zh = normalizeLocaleContent(localesRaw.zh, fallback.locales.zh);
  const en = normalizeLocaleContent(localesRaw.en, fallback.locales.en);
  return {
    version,
    locales: {
      zh,
      en,
    },
  };
}

// 规整单语言文案结构，字段缺失时回退对应语言默认值。
function normalizeLocaleContent(input: unknown, fallback: ShareCopyLocaleContent): ShareCopyLocaleContent {
  const data = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const title = normalizeCopyText(data.title, fallback.title);
  const subtitle = normalizeCopyText(data.subtitle, fallback.subtitle);
  const body = normalizeCopyText(data.body, fallback.body);
  return {
    title,
    subtitle,
    body,
  };
}

// 版本号规整：必须是整数，避免客户端“只弹一次”逻辑失效。
function normalizeVersion(input: unknown, fallback: number): number {
  if (typeof input === "number" && Number.isInteger(input) && input >= 0) {
    return input;
  }
  return fallback;
}

// 文案文本规整：统一换行并去除首尾空白，空值时回退默认文案。
function normalizeCopyText(input: unknown, fallback: string): string {
  const value = String(input ?? "").replace(/\r\n/g, "\n").trim();
  return value || fallback;
}
