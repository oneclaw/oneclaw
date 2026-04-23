import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

export const CDN_BASE_URL = "https://kimi-web-img.moonshot.cn/webbridge";

export function buildDownloadUrl(version: string, filename: string): string {
  return `${CDN_BASE_URL}/${version}/releases/${filename}`;
}

export function resolveWebbridgeVersion(override?: string): string {
  if (override) return override;
  const env = process.env.KIMI_WEBBRIDGE_VERSION?.trim();
  if (env) return env;
  return "latest";
}

export interface CacheManifest {
  version: string;
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
}

const CACHE_FILE_NAME = ".download-cache.json";

export function readCacheManifest(dataDir: string): CacheManifest | null {
  try {
    const raw = fs.readFileSync(path.join(dataDir, CACHE_FILE_NAME), "utf-8");
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    return {
      version: String(parsed.version ?? ""),
      etag: parsed.etag ?? null,
      lastModified: parsed.lastModified ?? null,
      contentLength:
        typeof parsed.contentLength === "number" ? parsed.contentLength : null,
    };
  } catch {
    return null;
  }
}

export function writeCacheManifest(
  dataDir: string,
  manifest: CacheManifest,
): void {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(
    path.join(dataDir, CACHE_FILE_NAME),
    JSON.stringify(manifest, null, 2),
    "utf-8",
  );
}

export interface HeadResult {
  etag: string | null;
  lastModified: string | null;
  contentLength: number | null;
}

const MAX_REDIRECTS = 5;

function chooseTransport(url: string): typeof https | typeof http {
  return new URL(url).protocol === "http:" ? http : https;
}

export function httpHead(initialUrl: string): Promise<HeadResult> {
  return new Promise((resolve, reject) => {
    let redirects = 0;
    const request = (url: string) => {
      chooseTransport(url)
        .request(url, { method: "HEAD" }, (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            if (++redirects > MAX_REDIRECTS) {
              reject(new Error(`Too many redirects (>${MAX_REDIRECTS})`));
              return;
            }
            request(new URL(res.headers.location, url).toString());
            res.resume();
            return;
          }
          if (status !== 200) {
            reject(new Error(`HTTP ${status} — ${url}`));
            res.resume();
            return;
          }
          const lenRaw = res.headers["content-length"];
          resolve({
            etag: (res.headers.etag as string | undefined) ?? null,
            lastModified:
              (res.headers["last-modified"] as string | undefined) ?? null,
            contentLength:
              typeof lenRaw === "string"
                ? Number.parseInt(lenRaw, 10) || null
                : null,
          });
          res.resume();
        })
        .on("error", reject)
        .end();
    };
    request(initialUrl);
  });
}

export interface ProgressEvent {
  downloaded: number;
  total: number | null;
  pct: number | null;
}

export type ProgressHandler = (event: ProgressEvent) => void;

const DOWNLOAD_TIMEOUT_MS = 60_000;
const PROGRESS_INTERVAL_MS = 200;
const PROGRESS_BYTES_THRESHOLD = 64 * 1024;

export function downloadToFile(
  initialUrl: string,
  dest: string,
  onProgress?: ProgressHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${dest}.tmp-${process.pid}-${Date.now()}`;
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    let redirects = 0;
    let settled = false;
    let lastProgressAt = 0;
    let lastProgressBytes = 0;

    const cleanupTmp = () => {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch {}
    };

    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanupTmp();
      reject(err);
    };

    const request = (url: string) => {
      const req = chooseTransport(url).get(url, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          if (++redirects > MAX_REDIRECTS) {
            fail(new Error(`Too many redirects (>${MAX_REDIRECTS})`));
            res.resume();
            return;
          }
          request(new URL(res.headers.location, url).toString());
          res.resume();
          return;
        }
        if (status !== 200) {
          fail(new Error(`HTTP ${status} — ${url}`));
          res.resume();
          return;
        }

        const lenRaw = res.headers["content-length"];
        const total =
          typeof lenRaw === "string"
            ? Number.parseInt(lenRaw, 10) || null
            : null;

        const file = fs.createWriteStream(tmpPath);
        let downloaded = 0;

        res.on("data", (chunk: Buffer) => {
          downloaded += chunk.length;
          if (!onProgress) return;
          const now = Date.now();
          if (
            now - lastProgressAt >= PROGRESS_INTERVAL_MS ||
            downloaded - lastProgressBytes >= PROGRESS_BYTES_THRESHOLD
          ) {
            lastProgressAt = now;
            lastProgressBytes = downloaded;
            onProgress({
              downloaded,
              total,
              pct: total ? (downloaded / total) * 100 : null,
            });
          }
        });

        res.on("error", fail);
        file.on("error", fail);

        file.on("finish", () => {
          file.close((closeErr) => {
            if (settled) return;
            if (closeErr) {
              fail(closeErr);
              return;
            }
            try {
              fs.renameSync(tmpPath, dest);
            } catch (err) {
              fail(err as Error);
              return;
            }
            onProgress?.({
              downloaded,
              total,
              pct: total ? 100 : null,
            });
            settled = true;
            resolve();
          });
        });

        res.pipe(file);
      });

      req.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
        req.destroy(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms`));
      });
      req.on("error", fail);
    };

    request(initialUrl);
  });
}

export function resolvePlatformBinaryName(
  platform: NodeJS.Platform | string,
  arch: string,
): string {
  const key = `${platform}-${arch}`;
  switch (key) {
    case "darwin-arm64":
      return "kimi-webbridge-darwin-arm64";
    case "darwin-x64":
      return "kimi-webbridge-darwin-amd64";
    case "win32-x64":
    case "win32-arm64":
      return "kimi-webbridge-windows-amd64.exe";
    default:
      throw new Error(`Unsupported platform: ${key}`);
  }
}
