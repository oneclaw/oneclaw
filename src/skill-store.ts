import { app, ipcMain } from "electron";
import {
  resolveUserStateDir,
  resolveUserBinDir,
  resolveNodeBin,
  resolveNodeExtraEnv,
  resolveClawhubEntry,
  IS_WIN,
} from "./constants";
import { execFile } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as log from "./logger";

const DEFAULT_REGISTRY = "https://clawhub.ai";
const FETCH_TIMEOUT_MS = 15_000;
const SKILL_STORE_CONFIG = "skill-store.json";

// 开发模式下打印网络请求日志
const debugLog = (msg: string) => {
  if (!app.isPackaged) log.info(`[skill-store] ${msg}`);
};

// ── 类型定义 ──

export type SkillSummary = {
  slug: string;
  name: string;
  description: string;
  version: string;
  downloads: number;
  highlighted: boolean;
  updatedAt: string;
  author: string;
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

// ── 独立配置文件读写（不污染 gateway 的 openclaw.json） ──

// 技能商店配置文件路径：~/.openclaw/skill-store.json
function skillStoreConfigPath(): string {
  return path.join(resolveUserStateDir(), SKILL_STORE_CONFIG);
}

// 读取技能商店独立配置
function readSkillStoreConfig(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(skillStoreConfigPath(), "utf-8"));
  } catch {
    return {};
  }
}

// 写入技能商店独立配置
function writeSkillStoreConfig(data: Record<string, any>): void {
  fs.mkdirSync(path.dirname(skillStoreConfigPath()), { recursive: true });
  fs.writeFileSync(skillStoreConfigPath(), JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Registry URL 公开接口（供 settings-ipc 使用） ──

// 读取 registry URL（空字符串表示使用默认值）
export function readSkillStoreRegistry(): string {
  const config = readSkillStoreConfig();
  return typeof config?.registryUrl === "string" ? config.registryUrl : "";
}

// 写入 registry URL（空值时清除）
export function writeSkillStoreRegistry(url: string): void {
  const config = readSkillStoreConfig();
  if (url) {
    config.registryUrl = url;
  } else {
    delete config.registryUrl;
  }
  writeSkillStoreConfig(config);
}

// ── Registry URL 解析 ──

// 读取用户自定义 registry 地址，未配置时回退官方默认值
function registryUrl(): string {
  try {
    const config = readSkillStoreConfig();
    const custom = config?.registryUrl;
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
  debugLog(`GET ${url}`);
  const startMs = Date.now();
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.get(url, { timeout: FETCH_TIMEOUT_MS }, (res) => {
      if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
        debugLog(`GET ${url} → ${res.statusCode} (${Date.now() - startMs}ms)`);
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        debugLog(`GET ${url} → ${res.statusCode} ${body.length}B (${Date.now() - startMs}ms)\n${body}`);
        try {
          resolve(JSON.parse(body) as T);
        } catch (err) {
          debugLog(`GET ${url} → JSON parse error: ${err}`);
          reject(err);
        }
      });
    });
    req.on("error", (err) => {
      debugLog(`GET ${url} → error: ${err.message} (${Date.now() - startMs}ms)`);
      reject(err);
    });
    req.on("timeout", () => {
      debugLog(`GET ${url} → timeout (${Date.now() - startMs}ms)`);
      req.destroy();
      reject(new Error("request timeout"));
    });
  });
}

// ── API 响应 → 前端类型映射 ──

// 将 API 返回的原始条目转为前端 SkillSummary
function mapItem(raw: any): SkillSummary {
  return {
    slug: raw.slug ?? "",
    name: raw.displayName ?? raw.slug ?? "",
    description: raw.summary ?? "",
    version: raw.tags?.latest ?? raw.latestVersion?.version ?? raw.version ?? "",
    downloads: raw.stats?.downloads ?? raw.downloads ?? 0,
    highlighted: true,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : "",
    author: raw.author ?? raw.owner ?? "",
  };
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
  const raw = await jsonGet<any>(`${base}/api/v1/skills?${params}`);
  const items = Array.isArray(raw.items) ? raw.items : Array.isArray(raw.skills) ? raw.skills : [];
  return {
    skills: items.map(mapItem),
    nextCursor: raw.nextCursor ?? null,
  };
}

// 搜索技能（不限 highlighted，搜全量）
async function searchSkills(opts: {
  q: string;
  limit?: number;
}): Promise<{ skills: SkillSummary[] }> {
  const base = registryUrl();
  const params = new URLSearchParams();
  params.set("q", opts.q);
  if (opts.limit) params.set("limit", String(opts.limit));
  const raw = await jsonGet<any>(`${base}/api/v1/search?${params}`);
  // 搜索接口返回 results 数组，兼容 items/skills 回退
  const items = Array.isArray(raw.results) ? raw.results : Array.isArray(raw.items) ? raw.items : [];
  return { skills: items.map(mapItem) };
}

// 获取技能详情
async function getSkillDetail(slug: string): Promise<SkillDetail> {
  const base = registryUrl();
  const raw = await jsonGet<any>(`${base}/api/v1/skills/${encodeURIComponent(slug)}`);
  return {
    ...mapItem(raw),
    readme: raw.readme ?? "",
    author: raw.author ?? raw.owner ?? "",
    tags: Array.isArray(raw.tagsList) ? raw.tagsList : [],
  };
}

// ── clawhub CLI 调用 ──

// workspace 目录：~/.openclaw/workspace
function workspaceDir(): string {
  return path.join(resolveUserStateDir(), "workspace");
}

// 技能安装根目录：~/.openclaw/workspace/skills/
function skillsBaseDir(): string {
  return path.join(workspaceDir(), "skills");
}

// 执行 clawhub CLI 命令，返回 stdout
function execClawhub(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const nodeBin = resolveNodeBin();
  const clawhubEntry = resolveClawhubEntry();
  const registry = registryUrl();
  const workdir = workspaceDir();

  // 构建完整参数：node clawhub-entry --workdir <workdir> --registry <registry> --no-input <args>
  const fullArgs = [clawhubEntry, "--workdir", workdir, "--registry", registry, "--no-input", ...args];
  debugLog(`exec: ${nodeBin} ${fullArgs.join(" ")}`);

  return new Promise((resolve, reject) => {
    // 组装 PATH，确保内嵌 node 和 clawhub wrapper 可找到
    const userBinDir = resolveUserBinDir();
    const envPath = userBinDir + path.delimiter + (process.env.PATH ?? "");

    execFile(nodeBin, fullArgs, {
      timeout: 60_000,
      env: {
        ...process.env,
        ...resolveNodeExtraEnv(),
        PATH: envPath,
      },
      windowsHide: true,
    }, (err, stdout, stderr) => {
      const out = typeof stdout === "string" ? stdout : "";
      const errOut = typeof stderr === "string" ? stderr : "";
      debugLog(`exec result: exit=${err ? (err as any).code ?? "error" : 0} stdout=${out.length}B stderr=${errOut.length}B`);
      if (errOut.trim()) debugLog(`exec stderr: ${errOut.trim()}`);
      if (err) {
        reject(new Error(errOut.trim() || err.message));
        return;
      }
      resolve({ stdout: out, stderr: errOut });
    });
  });
}

// 通过 clawhub CLI 安装技能
async function installSkill(slug: string): Promise<{ success: boolean; message?: string }> {
  try {
    await execClawhub(["install", slug]);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) };
  }
}

// 根据名称或 slug 解析实际安装目录名
function resolveInstalledSlug(nameOrSlug: string): string {
  const installed = listInstalledSkills();
  // 直接匹配目录名
  if (installed.includes(nameOrSlug)) return nameOrSlug;
  // 从 SKILL.md 读取 name 字段反查（支持 frontmatter `name:` 和 Markdown `# title`）
  const base = skillsBaseDir();
  const needle = nameOrSlug.toLowerCase();
  for (const dir of installed) {
    try {
      const md = fs.readFileSync(path.join(base, dir, "SKILL.md"), "utf-8");
      // frontmatter: name: xxx
      const fm = md.match(/^name:\s*["']?(.+?)["']?\s*$/m);
      if (fm && fm[1].trim().toLowerCase() === needle) return dir;
      // Markdown heading: # xxx
      const h1 = md.match(/^#\s+(.+)/m);
      if (h1 && h1[1].trim().toLowerCase() === needle) return dir;
    } catch { /* skip */ }
  }
  return nameOrSlug;
}

// 通过 clawhub CLI 卸载技能
async function uninstallSkill(slug: string): Promise<{ success: boolean; message?: string }> {
  try {
    const resolved = resolveInstalledSlug(slug);
    debugLog(`uninstall: "${slug}" → resolved="${resolved}"`);
    await execClawhub(["uninstall", "--yes", resolved]);
    return { success: true };
  } catch (err: any) {
    return { success: false, message: err?.message ?? String(err) };
  }
}

// 列出本地已安装的技能 slug（直接读目录，不依赖 CLI）
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
    debugLog(`ipc list sort=${params?.sort} limit=${params?.limit} cursor=${params?.cursor ?? "none"}`);
    try {
      const result = await listSkills({
        sort: params?.sort,
        limit: params?.limit,
        cursor: params?.cursor,
      });
      debugLog(`ipc list → ${result.skills?.length ?? 0} skills`);
      return { success: true, data: result };
    } catch (err: any) {
      debugLog(`ipc list → error: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("skill-store:search", async (_event, params) => {
    debugLog(`ipc search q="${params?.q}" limit=${params?.limit}`);
    try {
      const result = await searchSkills({
        q: params?.q ?? "",
        limit: params?.limit,
      });
      debugLog(`ipc search → ${result.skills?.length ?? 0} skills`);
      return { success: true, data: result };
    } catch (err: any) {
      debugLog(`ipc search → error: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("skill-store:detail", async (_event, params) => {
    debugLog(`ipc detail slug=${params?.slug}`);
    try {
      const result = await getSkillDetail(params?.slug ?? "");
      debugLog(`ipc detail → ${result.name ?? "unknown"}`);
      return { success: true, data: result };
    } catch (err: any) {
      debugLog(`ipc detail → error: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  ipcMain.handle("skill-store:install", async (_event, params) => {
    debugLog(`ipc install slug=${params?.slug}`);
    const result = await installSkill(params?.slug ?? "");
    debugLog(`ipc install → ${result.success ? "ok" : result.message}`);
    return result;
  });

  ipcMain.handle("skill-store:uninstall", async (_event, params) => {
    debugLog(`ipc uninstall slug=${params?.slug}`);
    const result = await uninstallSkill(params?.slug ?? "");
    debugLog(`ipc uninstall → ${result.success ? "ok" : result.message}`);
    return result;
  });

  ipcMain.handle("skill-store:list-installed", async () => {
    const installed = listInstalledSkills();
    debugLog(`ipc list-installed → [${installed.join(", ")}]`);
    return { success: true, data: installed };
  });
}
