import { ipcMain } from "electron";
import { resolveUserStateDir } from "./constants";
import { readUserConfig } from "./provider-config";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as zlib from "zlib";

const DEFAULT_REGISTRY = "https://clawhub.ai";
const FETCH_TIMEOUT_MS = 15_000;
const SKILLS_DIR_NAME = "skills";

// ── 类型定义 ──

export type SkillSummary = {
  slug: string;
  name: string;
  description: string;
  version: string;
  downloads: number;
  highlighted: boolean;
  updatedAt: string;
};

export type SkillDetail = SkillSummary & {
  readme: string;
  author: string;
  tags: string[];
};

type ListResult = {
  skills: SkillSummary[];
  nextCursor: string | null;
};

// ── Registry URL 解析 ──

// 读取用户自定义 registry 地址，未配置时回退官方默认值
function registryUrl(): string {
  try {
    const config = readUserConfig();
    const custom = config?.skillStore?.registryUrl;
    if (typeof custom === "string" && custom.trim()) {
      return custom.trim().replace(/\/+$/, "");
    }
  } catch {
    // 配置读取失败回退默认
  }
  return DEFAULT_REGISTRY;
}

// ── HTTP 请求封装 ──

// 通用 JSON GET 请求，带超时控制
function jsonGet<T>(url: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve(JSON.parse(body) as T);
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("request timeout"));
    });
  });
}

// 下载二进制内容（ZIP），返回 Buffer
function downloadBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(url, { timeout: FETCH_TIMEOUT_MS * 2 }, (res) => {
      // 跟随重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        downloadBuffer(res.headers.location).then(resolve, reject);
        res.resume();
        return;
      }
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("download timeout"));
    });
  });
}

// ── API 调用 ──

// 获取精选技能列表（分页）
async function listSkills(opts: {
  sort?: string;
  limit?: number;
  cursor?: string;
}): Promise<ListResult> {
  const base = registryUrl();
  const params = new URLSearchParams();
  params.set("highlightedOnly", "true");
  if (opts.sort) params.set("sort", opts.sort);
  if (opts.limit) params.set("limit", String(opts.limit));
  if (opts.cursor) params.set("cursor", opts.cursor);
  return jsonGet<ListResult>(`${base}/api/v1/skills?${params}`);
}

// 搜索精选技能
async function searchSkills(opts: {
  q: string;
  limit?: number;
}): Promise<{ skills: SkillSummary[] }> {
  const base = registryUrl();
  const params = new URLSearchParams();
  params.set("q", opts.q);
  params.set("highlightedOnly", "true");
  if (opts.limit) params.set("limit", String(opts.limit));
  return jsonGet<{ skills: SkillSummary[] }>(`${base}/api/v1/skills/search?${params}`);
}

// 获取技能详情
async function getSkillDetail(slug: string): Promise<SkillDetail> {
  const base = registryUrl();
  return jsonGet<SkillDetail>(`${base}/api/v1/skills/${encodeURIComponent(slug)}`);
}

// ── 本地安装目录 ──

// 技能安装根目录：~/.openclaw/skills/
function skillsBaseDir(): string {
  return path.join(resolveUserStateDir(), SKILLS_DIR_NAME);
}

// 单个技能安装目录
function skillDir(slug: string): string {
  return path.join(skillsBaseDir(), slug);
}

// ── ZIP 解压（纯 Node.js 内置 zlib，解析 ZIP central directory） ──

// 最小 ZIP 解压：只处理 store + deflate 两种压缩方式
function extractZip(zipBuf: Buffer, destDir: string): void {
  // ZIP end-of-central-directory 签名
  const EOCD_SIG = 0x06054b50;
  const LOCAL_SIG = 0x04034b50;

  // 从末尾搜索 EOCD
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= 0; i--) {
    if (zipBuf.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("invalid ZIP: EOCD not found");

  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
  const cdEntries = zipBuf.readUInt16LE(eocdOffset + 10);

  let pos = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    // 读取 central directory entry
    const fnLen = zipBuf.readUInt16LE(pos + 28);
    const extraLen = zipBuf.readUInt16LE(pos + 30);
    const commentLen = zipBuf.readUInt16LE(pos + 32);
    const localOffset = zipBuf.readUInt32LE(pos + 42);
    const fileName = zipBuf.subarray(pos + 46, pos + 46 + fnLen).toString("utf-8");
    pos += 46 + fnLen + extraLen + commentLen;

    // 跳过目录条目
    if (fileName.endsWith("/")) {
      fs.mkdirSync(path.join(destDir, fileName), { recursive: true });
      continue;
    }

    // 读取 local file header 获取实际数据
    if (zipBuf.readUInt32LE(localOffset) !== LOCAL_SIG) continue;
    const method = zipBuf.readUInt16LE(localOffset + 8);
    const compSize = zipBuf.readUInt32LE(localOffset + 18);
    const localFnLen = zipBuf.readUInt16LE(localOffset + 26);
    const localExtraLen = zipBuf.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localFnLen + localExtraLen;
    const rawData = zipBuf.subarray(dataStart, dataStart + compSize);

    // 安全路径校验：禁止 .. 路径穿越
    const normalizedName = path.normalize(fileName);
    if (normalizedName.startsWith("..") || path.isAbsolute(normalizedName)) continue;

    const filePath = path.join(destDir, normalizedName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    if (method === 0) {
      // store（无压缩）
      fs.writeFileSync(filePath, rawData);
    } else if (method === 8) {
      // deflate
      const inflated = zlib.inflateRawSync(rawData);
      fs.writeFileSync(filePath, inflated);
    }
    // 其他压缩方式忽略
  }
}

// ── 安装 / 卸载 ──

// 安装技能：下载 ZIP → 解压到 ~/.openclaw/skills/<slug>/ → 校验 SKILL.md 存在
async function installSkill(slug: string, tag = "latest"): Promise<{ success: boolean; message?: string }> {
  try {
    const base = registryUrl();
    const params = new URLSearchParams();
    params.set("slug", slug);
    params.set("tag", tag);
    const zipUrl = `${base}/api/v1/download?${params}`;
    const zipBuf = await downloadBuffer(zipUrl);

    const dest = skillDir(slug);
    // 清除旧版本
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.mkdirSync(dest, { recursive: true });

    extractZip(zipBuf, dest);

    // 校验：必须包含 SKILL.md
    if (!fs.existsSync(path.join(dest, "SKILL.md"))) {
      fs.rmSync(dest, { recursive: true, force: true });
      return { success: false, message: "Invalid skill package: missing SKILL.md" };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) };
  }
}

// 卸载技能：删除整个目录
function uninstallSkill(slug: string): { success: boolean; message?: string } {
  try {
    const dest = skillDir(slug);
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) };
  }
}

// 列出本地已安装的技能 slug
function listInstalledSkills(): string[] {
  const base = skillsBaseDir();
  if (!fs.existsSync(base)) return [];
  try {
    return fs.readdirSync(base).filter((name) => {
      const dir = path.join(base, name);
      return fs.statSync(dir).isDirectory() && fs.existsSync(path.join(dir, "SKILL.md"));
    });
  } catch {
    return [];
  }
}

// ── IPC 注册 ──

// 注册技能商店相关 IPC handler
export function registerSkillStoreIpc(): void {
  ipcMain.handle("skill-store:list", async (_event, params) => {
    try {
      const result = await listSkills({
        sort: params?.sort,
        limit: params?.limit,
        cursor: params?.cursor,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("skill-store:search", async (_event, params) => {
    try {
      const result = await searchSkills({
        q: params?.q ?? "",
        limit: params?.limit,
      });
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("skill-store:detail", async (_event, params) => {
    try {
      const result = await getSkillDetail(params?.slug ?? "");
      return { success: true, data: result };
    } catch (err: any) {
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("skill-store:install", async (_event, params) => {
    return installSkill(params?.slug ?? "", params?.tag ?? "latest");
  });

  ipcMain.handle("skill-store:uninstall", async (_event, params) => {
    return uninstallSkill(params?.slug ?? "");
  });

  ipcMain.handle("skill-store:list-installed", async () => {
    return { success: true, data: listInstalledSkills() };
  });
}
