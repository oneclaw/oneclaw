import { ipcMain, app, BrowserWindow } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { resolveUserStateDir } from "./constants";
import type { GatewayState } from "./gateway-process";
import * as log from "./logger";

// 反馈服务地址（构建时通过环境变量注入，回退到默认值）
const FEEDBACK_URL =
  process.env.ONECLAW_FEEDBACK_URL || "https://feedback.oneclaw.cn/api/v1/feedback";

// 反馈提交参数
interface FeedbackParams {
  content: string;
  screenshots: string[]; // base64 编码的图片数据
  includeLogs: boolean;
  email?: string;
}

// 反馈提交结果
interface FeedbackResult {
  ok: boolean;
  id?: number;
  error?: string;
}

// 依赖注入：gateway 状态获取
interface FeedbackIpcDeps {
  getGatewayState: () => GatewayState;
  getGatewayPort: () => number;
}

// 读取 deviceId（~/.openclaw/.device-id）
function readDeviceId(): string {
  const idPath = path.join(resolveUserStateDir(), ".device-id");
  try {
    return fs.readFileSync(idPath, "utf-8").trim();
  } catch {
    return "unknown";
  }
}

// multipart text 字段
function buildTextField(boundary: string, name: string, value: string): Buffer {
  return Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
}

// multipart file 字段
function buildFileField(
  boundary: string,
  name: string,
  filename: string,
  data: Buffer,
  contentType: string,
): Buffer {
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  return Buffer.concat([header, data, Buffer.from("\r\n")]);
}

// 通过 Node.js 原生 http/https 发送 multipart POST
function postMultipart(url: string, body: Buffer, boundary: string): Promise<FeedbackResult> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      parsed,
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
        timeout: 30_000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve({ ok: true, id: json.id });
            } else {
              resolve({ ok: false, error: json.error || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ ok: false, error: `HTTP ${res.statusCode}` });
          }
        });
      },
    );
    req.on("error", (err) => {
      log.error(`反馈提交网络错误: ${err.message}`);
      resolve({ ok: false, error: err.message });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.write(body);
    req.end();
  });
}

/** 对连续 15+ 个字母数字的片段打码：保留前 7 字符 + *** */
function maskAlphanumericRuns(value: string): string {
  return value.replace(/[a-zA-Z0-9]{15,}/g, (match) => match.slice(0, 7) + "***");
}

function maskConfigValues(obj: unknown): unknown {
  if (typeof obj === "string") {
    return maskAlphanumericRuns(obj);
  }
  if (Array.isArray(obj)) return obj.map(maskConfigValues);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = maskConfigValues(v);
    }
    return result;
  }
  return obj;
}

/** 递归遍历 .openclaw 状态目录，生成 CSV（path,bytes） */
function buildStateTree(): string {
  const stateDir = resolveUserStateDir();
  if (!fs.existsSync(stateDir)) return "(state directory does not exist)";

  const MAX_FILES = 1000;
  let fileCount = 0;
  const lines: string[] = ["path,bytes"];

  // 跳过的目录：node_modules 不递归，日志文件内容已单独采集
  const SKIP_DIRS = new Set(["node_modules"]);

  function walk(dir: string, depth: number): void {
    if (depth > 5 || fileCount >= MAX_FILES) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (fileCount >= MAX_FILES) return;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(stateDir, fullPath);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          fileCount++;
        } else {
          fileCount++;
          walk(fullPath, depth + 1);
        }
      } else {
        try {
          const stat = fs.statSync(fullPath);
          lines.push(`${relPath},${stat.size}`);
        } catch {
          lines.push(`${relPath},-1`);
        }
        fileCount++;
      }
    }
  }

  walk(stateDir, 0);
  return lines.join("\n") || "(empty)";
}

// 从 feedbackUrl 推导 user API 基础路径
// feedbackUrl = "https://feedback.oneclaw.cn/api/v1/feedback"
// userApiBase = "https://feedback.oneclaw.cn/api/v1/user/threads"
function resolveUserApiBase(): string {
  const base = FEEDBACK_URL.replace(/\/feedback\/?$/, "");
  return `${base}/user/threads`;
}

// 通过 Node.js 原生 http/https 发送 GET 请求
function httpGet(url: string): Promise<{ ok: boolean; data?: any; error?: string }> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === "https:" ? https : http;
    const req = mod.request(
      parsed,
      { method: "GET", timeout: 15_000 },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode === 200) {
              resolve({ ok: true, data: json });
            } else {
              resolve({ ok: false, error: json.error || `HTTP ${res.statusCode}` });
            }
          } catch {
            resolve({ ok: false, error: `HTTP ${res.statusCode}` });
          }
        });
      },
    );
    req.on("error", (err) => resolve({ ok: false, error: err.message }));
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
    req.end();
  });
}

// 注册反馈相关 IPC handler
export function registerFeedbackIpc(deps: FeedbackIpcDeps): void {
  // feedback:threads — 获取用户的反馈列表
  ipcMain.handle("feedback:threads", async () => {
    const deviceId = readDeviceId();
    const url = `${resolveUserApiBase()}?device_id=${encodeURIComponent(deviceId)}`;
    return httpGet(url);
  });

  // feedback:thread — 获取单个反馈详情 + 消息列表
  ipcMain.handle("feedback:thread", async (_event, id: number) => {
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "invalid thread id" };
    }
    const deviceId = readDeviceId();
    const url = `${resolveUserApiBase()}/${id}?device_id=${encodeURIComponent(deviceId)}`;
    return httpGet(url);
  });

  // feedback:reply — 用户追问
  ipcMain.handle("feedback:reply", async (_event, id: number, content: string) => {
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return { ok: false, error: "invalid thread id" };
    }
    if (typeof content !== "string" || content.trim().length === 0) {
      return { ok: false, error: "content is required" };
    }
    const deviceId = readDeviceId();
    const url = `${resolveUserApiBase()}/${id}/messages`;
    const boundary = `----FeedbackReplyBoundary${Date.now()}`;
    const parts: Buffer[] = [];
    parts.push(buildTextField(boundary, "device_id", deviceId));
    parts.push(buildTextField(boundary, "content", content));
    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);
    return postMultipart(url, body, boundary);
  });
  // 截取当前窗口截图，返回 base64 PNG
  ipcMain.handle("feedback:capture-window", async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return null;
      const image = await win.webContents.capturePage();
      return image.toPNG().toString("base64");
    } catch (err) {
      log.error(`截图失败: ${err}`);
      return null;
    }
  });

  ipcMain.handle("feedback:submit", async (_event, params: FeedbackParams): Promise<FeedbackResult> => {
    const { content, screenshots, includeLogs, email } = params;

    if (!content.trim()) {
      return { ok: false, error: "content is required" };
    }

    // 截图数量上限：最多 5 张
    if (screenshots.length > 5) {
      return { ok: false, error: "too many screenshots (max 5)" };
    }

    // 单张截图大小上限：~5MB 原始数据（base64 膨胀约 1.33x → 阈值 7MB）
    for (let i = 0; i < screenshots.length; i++) {
      if (screenshots[i].length > 7_000_000) {
        return { ok: false, error: `screenshot ${i + 1} exceeds 5MB limit` };
      }
    }

    // 采集诊断元数据
    const metadataObj: Record<string, unknown> = {
      appVersion: app.getVersion(),
      os: process.platform,
      arch: process.arch,
      deviceId: readDeviceId(),
      gatewayState: deps.getGatewayState(),
      gatewayPort: deps.getGatewayPort(),
    };
    if (email) metadataObj.email = email;
    const metadata = JSON.stringify(metadataObj);

    // 构造 multipart body
    const boundary = `----FeedbackBoundary${Date.now()}`;
    const parts: Buffer[] = [];

    // 文本字段
    parts.push(buildTextField(boundary, "content", content));
    parts.push(buildTextField(boundary, "metadata", metadata));

    // 截图文件（base64 → Buffer）
    for (let i = 0; i < screenshots.length; i++) {
      const buf = Buffer.from(screenshots[i], "base64");
      parts.push(buildFileField(boundary, "screenshots", `screenshot-${i + 1}.png`, buf, "image/png"));
    }

    // 日志文件：超过 10MB 只取末尾 10 万行，并脱敏含密钥的行
    if (includeLogs) {
      const stateDir = resolveUserStateDir();
      const sensitiveRe = /key=|token=|secret=|password=|authorization:|"apiKey"|"api_key"|"apikey"|bearer |sk-[a-zA-Z0-9]{8}/i;
      const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10 MB
      for (const name of ["app.log", "gateway.log"]) {
        const logPath = path.join(stateDir, name);
        try {
          if (!fs.existsSync(logPath)) continue;
          const stat = fs.statSync(logPath);
          let raw: string;
          if (stat.size <= MAX_LOG_SIZE) {
            raw = fs.readFileSync(logPath, "utf-8");
          } else {
            // 大文件：只读取末尾 10MB
            const fd = fs.openSync(logPath, "r");
            const buf = Buffer.alloc(MAX_LOG_SIZE);
            fs.readSync(fd, buf, 0, MAX_LOG_SIZE, stat.size - MAX_LOG_SIZE);
            fs.closeSync(fd);
            raw = buf.toString("utf-8");
            // 丢弃第一个不完整行
            const firstNewline = raw.indexOf("\n");
            if (firstNewline > 0) raw = raw.slice(firstNewline + 1);
          }
          const lines = raw.split("\n").filter((l) => !sensitiveRe.test(l));
          const tailBuf = Buffer.from(lines.join("\n"), "utf-8");
          parts.push(buildFileField(boundary, "logs", name, tailBuf, "text/plain"));
        } catch {
          // 读取日志失败不阻塞提交
        }
      }
    }

    // 诊断文件：打码后的配置 + workspace 目录树
    const stateDir2 = resolveUserStateDir();
    try {
      const configPath = path.join(stateDir2, "openclaw.json");
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        const masked = maskConfigValues(parsed);
        const maskedBuf = Buffer.from(JSON.stringify(masked, null, 2), "utf-8");
        parts.push(buildFileField(boundary, "diagnostics", "openclaw.masked.json", maskedBuf, "application/json"));
      }
    } catch {
      // 配置读取失败不阻塞提交
    }
    try {
      const tree = buildStateTree();
      const treeBuf = Buffer.from(tree, "utf-8");
      parts.push(buildFileField(boundary, "diagnostics", "state-tree.csv", treeBuf, "text/csv"));
    } catch {
      // workspace 树构建失败不阻塞提交
    }

    // 结束标记
    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);
    log.info(`反馈提交: content=${content.length}字, screenshots=${screenshots.length}, includeLogs=${includeLogs}`);

    const result = await postMultipart(FEEDBACK_URL, body, boundary);
    if (result.ok) {
      log.info(`反馈提交成功: id=${result.id}`);
    } else {
      log.error(`反馈提交失败: ${result.error}`);
    }
    return result;
  });
}
