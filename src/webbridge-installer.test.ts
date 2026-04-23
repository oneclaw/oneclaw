import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import {
  resolvePlatformBinaryName,
  buildDownloadUrl,
  resolveWebbridgeVersion,
  CDN_BASE_URL,
  readCacheManifest,
  writeCacheManifest,
  httpHead,
} from "./webbridge-installer";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "webbridge-test-"));
}

function startTestServer(
  handler: http.RequestListener,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") throw new Error("no address");
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        close: () =>
          new Promise<void>((r) => {
            server.close(() => r());
          }),
      });
    });
  });
}

test("resolvePlatformBinaryName 映射 darwin-arm64", () => {
  assert.equal(
    resolvePlatformBinaryName("darwin", "arm64"),
    "kimi-webbridge-darwin-arm64",
  );
});

test("resolvePlatformBinaryName 映射 darwin-x64", () => {
  assert.equal(
    resolvePlatformBinaryName("darwin", "x64"),
    "kimi-webbridge-darwin-amd64",
  );
});

test("resolvePlatformBinaryName 映射 win32-x64", () => {
  assert.equal(
    resolvePlatformBinaryName("win32", "x64"),
    "kimi-webbridge-windows-amd64.exe",
  );
});

test("resolvePlatformBinaryName win32-arm64 回退到 amd64（Windows 11 ARM 支持 x64 模拟）", () => {
  assert.equal(
    resolvePlatformBinaryName("win32", "arm64"),
    "kimi-webbridge-windows-amd64.exe",
  );
});

test("resolvePlatformBinaryName 未支持平台抛错", () => {
  assert.throws(
    () => resolvePlatformBinaryName("linux", "x64"),
    /Unsupported platform: linux-x64/,
  );
});

test("CDN_BASE_URL 指向 Moonshot 官方 CDN", () => {
  assert.equal(
    CDN_BASE_URL,
    "https://kimi-web-img.moonshot.cn/webbridge",
  );
});

test("buildDownloadUrl 拼接 version + filename", () => {
  assert.equal(
    buildDownloadUrl("latest", "kimi-webbridge-darwin-arm64"),
    "https://kimi-web-img.moonshot.cn/webbridge/latest/releases/kimi-webbridge-darwin-arm64",
  );
});

test("buildDownloadUrl 支持 pin 到具体版本", () => {
  assert.equal(
    buildDownloadUrl("0.3.0", "kimi-webbridge-windows-amd64.exe"),
    "https://kimi-web-img.moonshot.cn/webbridge/0.3.0/releases/kimi-webbridge-windows-amd64.exe",
  );
});

test("resolveWebbridgeVersion 默认 latest", () => {
  const original = process.env.KIMI_WEBBRIDGE_VERSION;
  delete process.env.KIMI_WEBBRIDGE_VERSION;
  try {
    assert.equal(resolveWebbridgeVersion(), "latest");
  } finally {
    if (original !== undefined) process.env.KIMI_WEBBRIDGE_VERSION = original;
  }
});

test("resolveWebbridgeVersion 读 KIMI_WEBBRIDGE_VERSION env", () => {
  const original = process.env.KIMI_WEBBRIDGE_VERSION;
  process.env.KIMI_WEBBRIDGE_VERSION = "0.3.0";
  try {
    assert.equal(resolveWebbridgeVersion(), "0.3.0");
  } finally {
    if (original === undefined) delete process.env.KIMI_WEBBRIDGE_VERSION;
    else process.env.KIMI_WEBBRIDGE_VERSION = original;
  }
});

test("resolveWebbridgeVersion 接受参数覆盖", () => {
  assert.equal(resolveWebbridgeVersion("1.0.0"), "1.0.0");
});

test("readCacheManifest 目录不存在返回 null", () => {
  const dir = path.join(os.tmpdir(), `webbridge-nonexistent-${Date.now()}`);
  assert.equal(readCacheManifest(dir), null);
});

test("readCacheManifest 文件损坏返回 null（不抛错）", () => {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, ".download-cache.json"), "{not json");
    assert.equal(readCacheManifest(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeCacheManifest + readCacheManifest 往返", () => {
  const dir = makeTempDir();
  try {
    writeCacheManifest(dir, {
      version: "latest",
      etag: "\"abc123\"",
      lastModified: "Mon, 23 Apr 2026 10:00:00 GMT",
      contentLength: 7345678,
    });
    const read = readCacheManifest(dir);
    assert.deepEqual(read, {
      version: "latest",
      etag: "\"abc123\"",
      lastModified: "Mon, 23 Apr 2026 10:00:00 GMT",
      contentLength: 7345678,
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writeCacheManifest 自动创建不存在的目录", () => {
  const parent = makeTempDir();
  const dir = path.join(parent, "nested", "deep");
  try {
    writeCacheManifest(dir, {
      version: "latest",
      etag: "e1",
      lastModified: null,
      contentLength: 1,
    });
    assert.ok(fs.existsSync(path.join(dir, ".download-cache.json")));
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("httpHead 返回 ETag / Last-Modified / Content-Length", async () => {
  const { url, close } = await startTestServer((req, res) => {
    assert.equal(req.method, "HEAD");
    res.writeHead(200, {
      ETag: "\"abc\"",
      "Last-Modified": "Mon, 23 Apr 2026 10:00:00 GMT",
      "Content-Length": "7345678",
    });
    res.end();
  });
  try {
    const head = await httpHead(`${url}/file`);
    assert.equal(head.etag, "\"abc\"");
    assert.equal(head.lastModified, "Mon, 23 Apr 2026 10:00:00 GMT");
    assert.equal(head.contentLength, 7345678);
  } finally {
    await close();
  }
});

test("httpHead 跟随 301 重定向", async () => {
  const { url, close } = await startTestServer((req, res) => {
    if (req.url === "/old") {
      res.writeHead(301, { Location: `${url}/new` });
      res.end();
      return;
    }
    res.writeHead(200, { ETag: "\"x\"" });
    res.end();
  });
  try {
    const head = await httpHead(`${url}/old`);
    assert.equal(head.etag, "\"x\"");
  } finally {
    await close();
  }
});

test("httpHead 对非 200 抛错", async () => {
  const { url, close } = await startTestServer((_req, res) => {
    res.writeHead(404);
    res.end();
  });
  try {
    await assert.rejects(httpHead(`${url}/missing`), /HTTP 404/);
  } finally {
    await close();
  }
});

test("httpHead 超过 5 次重定向抛错", async () => {
  const { url, close } = await startTestServer((req, res) => {
    const n = parseInt((req.url || "/0").slice(1), 10) || 0;
    res.writeHead(302, { Location: `${url}/${n + 1}` });
    res.end();
  });
  try {
    await assert.rejects(httpHead(`${url}/0`), /Too many redirects/);
  } finally {
    await close();
  }
});
