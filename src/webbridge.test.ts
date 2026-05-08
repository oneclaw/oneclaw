// webbridge.test.ts — 关键链路：CDN 下载 / setup 编排 / 状态聚合 / precheck
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import {
  buildDownloadUrl,
  getWebbridgeInstallState,
  getWebbridgePrecheck,
  installWebbridge,
  installWebbridgeSkill,
  readCacheManifest,
  runWebbridgeSetupTask,
  writeCacheManifest,
  type WebbridgeSetupTaskDeps,
} from "./webbridge";
import { resolveWebbridgeDataDir } from "./constants";

const EXT = "abcdef0123456789abcdef0123456789";
const OK_CHROME = {
  browserId: "chrome", browserName: "Chrome",
  installed: true, configured: true, blocklisted: false,
  presentInChrome: true, extensionPendingEnable: false, running: false,
} as const;

function startCdn(body: Buffer, etag: string, onGet?: () => void): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      if (req.method === "HEAD") {
        res.writeHead(200, { ETag: etag, "Content-Length": String(body.length) }); res.end();
      } else { onGet?.(); res.writeHead(200, { "Content-Length": String(body.length) }); res.end(body); }
    });
    s.listen(0, "127.0.0.1", () => {
      const a = s.address(); if (!a || typeof a === "string") throw new Error("no addr");
      resolve({ url: `http://127.0.0.1:${a.port}`, close: () => new Promise((r) => s.close(() => r())) });
    });
  });
}

test("路径 + URL：resolveWebbridgeDataDir → HOME/.kimi-webbridge；buildDownloadUrl 拼 CDN", () => {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  assert.equal(resolveWebbridgeDataDir(), path.join(home, ".kimi-webbridge"));
  assert.equal(
    buildDownloadUrl("0.3.0", "kimi-webbridge-darwin-arm64"),
    "https://kimi-web-img.moonshot.cn/webbridge/0.3.0/releases/kimi-webbridge-darwin-arm64",
  );
});

test("installWebbridge: 首次下载 → installed + chmod + manifest；ETag 命中 → skipped 不发 GET", async () => {
  const body = Buffer.alloc(2048, 0x42);
  let getCalls = 0;
  const { url, close } = await startCdn(body, '"v1"', () => { getCalls++; });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-"));
  const bin = path.join(dir, "bin/kimi-webbridge");
  try {
    const fresh = await installWebbridge({ dataDir: dir, binaryPath: bin, platform: "darwin", arch: "arm64", cdnBaseUrl: url });
    assert.equal(fresh.installed, true);
    assert.equal(fs.statSync(bin).size, body.length);
    if (process.platform !== "win32") assert.equal(fs.statSync(bin).mode & 0o777, 0o755);
    assert.equal(readCacheManifest(dir)?.etag, '"v1"');
    assert.equal(getCalls, 1);

    writeCacheManifest(dir, { version: "latest", etag: '"v1"', lastModified: null, contentLength: null });
    const cached = await installWebbridge({ dataDir: dir, binaryPath: bin, platform: "darwin", arch: "arm64", cdnBaseUrl: url });
    assert.equal(cached.skipped, true);
    assert.equal(getCalls, 1, "ETag 命中不应再发 GET");
  } finally { await close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

function setupDeps(over: Partial<WebbridgeSetupTaskDeps> = {}): WebbridgeSetupTaskDeps {
  return {
    installer: async () => ({ installed: true, skipped: false, version: "1", binaryPath: "/x/kimi", etag: null }),
    installExtensions: async () => [{ browserId: "chrome", browserName: "Chrome", result: "installed" }],
    readConfig: () => ({}), writeConfig: () => {}, applyMode: (c, m) => ({ ...c, _m: m }),
    extensionId: EXT, installSkill: async () => ({ success: true, output: "ok" }),
    logger: { info: () => {}, error: () => {} }, ...over,
  };
}

test("runWebbridgeSetupTask: 全 OK → webbridge-ready；installer 抛错 → fell-back-to-openclaw + 改写 config + 通知", async () => {
  const ok = await runWebbridgeSetupTask(setupDeps());
  assert.equal(ok.outcome, "webbridge-ready");
  assert.equal(ok.binaryPath, "/x/kimi");

  const writes: any[] = []; let notified = 0;
  const fb = await runWebbridgeSetupTask(setupDeps({
    installer: async () => { throw new Error("CDN 500"); },
    writeConfig: (c) => writes.push(c),
    onConfigRewritten: () => { notified++; },
  }));
  assert.equal(fb.outcome, "fell-back-to-openclaw");
  assert.match(fb.error ?? "", /CDN 500/);
  assert.equal(writes[0]._m, "openclaw");
  assert.equal(notified, 1);
});

test("runWebbridgeSetupTask: installExtensions 返回 [] / 全 browser-not-installed 都判失败并降级", async () => {
  // 默认浏览器不是 Chrome/Edge，installForDefaultBrowser 返回 [] —— 必须降级
  const empty = await runWebbridgeSetupTask(setupDeps({
    installExtensions: async () => [],
  }));
  assert.equal(empty.outcome, "fell-back-to-openclaw");
  assert.match(empty.error ?? "", /no extension target/);

  // 浏览器探测到了但实际没装上（browser-not-installed） —— 同样降级
  const bni = await runWebbridgeSetupTask(setupDeps({
    installExtensions: async () => [
      { browserId: "chrome", browserName: "Chrome", result: "browser-not-installed" },
    ],
  }));
  assert.equal(bni.outcome, "fell-back-to-openclaw");

  // 带 error 的 summary 即便 result 看起来 OK 也判失败（防御性写法）
  const errored = await runWebbridgeSetupTask(setupDeps({
    installExtensions: async () => [
      { browserId: "chrome", browserName: "Chrome", result: "installed", error: "EACCES" },
    ],
  }));
  assert.equal(errored.outcome, "fell-back-to-openclaw");
});

test("getWebbridgeInstallState: binary 缺 → installed=false；存在 + manifest → version", async () => {
  const base = { binaryPath: "/x", dataDir: "/y", readExtensionStates: async () => [], extensionId: EXT };
  const miss = await getWebbridgeInstallState({ ...base, fileExists: () => false, readManifest: () => null });
  assert.equal(miss.installed, false);
  const ok = await getWebbridgeInstallState({
    ...base, fileExists: () => true,
    readManifest: () => ({ version: "1.2.3", etag: "W/abc", lastModified: null, contentLength: 1 }),
  });
  assert.equal(ok.installed, true); assert.equal(ok.version, "1.2.3");
});

test("installWebbridgeSkill: 调 install-skill -y；exec 抛错 → success=false", async () => {
  const calls: string[][] = [];
  const ok = await installWebbridgeSkill("/bin/kimi", {
    execFileAsync: async (_c, args) => { calls.push(args); return { stdout: "✓ ok", stderr: "" }; },
  });
  assert.equal(ok.success, true);
  assert.deepEqual(calls[0], ["install-skill", "-y"]);
  const fail = await installWebbridgeSkill("/bin/kimi", {
    execFileAsync: async () => { throw new Error("ENOENT"); },
  });
  assert.equal(fail.success, false);
  assert.match(fail.error ?? "", /ENOENT/);
});

test("getWebbridgePrecheck: 全 OK / binary 缺 / 默认浏览器不支持 / webbridge 漂移", async () => {
  const base = {
    binaryPath: "/x", extensionId: "id", skillPaths: ["/s"],
    getDefaultBrowser: async () => ({ target: { id: "chrome", name: "Chrome" } }),
    readExtensionStates: async () => [OK_CHROME],
  };
  assert.equal((await getWebbridgePrecheck({ ...base, fileExists: () => true })).ok, true);
  assert.equal((await getWebbridgePrecheck({ ...base, fileExists: (p) => p === "/s" })).missing.binary, true);
  const noBrowser = await getWebbridgePrecheck({ ...base, fileExists: () => true, getDefaultBrowser: async () => null });
  assert.equal(noBrowser.defaultUnsupported, true);
  assert.equal(noBrowser.missing.extension, true);
  const drift = await getWebbridgePrecheck({
    ...base, fileExists: () => true,
    readSkillEnabled: () => false, currentBrowserMode: "webbridge",
  });
  assert.equal(drift.missing.skill, true, "webbridge 模式下 skill enabled=false 算漂移");
});
