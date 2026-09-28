// webbridge.test.ts — 关键链路：CDN 下载 / setup 编排 / 状态聚合 / precheck
import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as http from "http";
import {
  buildDownloadUrl,
  createSingleFlight,
  getWebbridgeInstallState,
  getWebbridgePrecheck,
  installWebbridge,
  installWebbridgeSkill,
  KIMI_WEBBRIDGE_SKILL_PATHS,
  readCacheManifest,
  resolveWebbridgeVersion,
  runWebbridgeSetupTask,
  stopWebbridgeProcesses,
  wipeWebbridgeInstall,
  writeCacheManifest,
  type ExecFileAsync,
  type WebbridgeSetupTaskDeps,
} from "./webbridge";
import { resolveUserStateDir, resolveWebbridgeDataDir } from "./constants";

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

    // force=true 完全绕过 ETag 跳过：必然下载 + manifest 版本标签刷新——
    // 版本不一致修复的收敛兜底（即使旧安装没能移走，也强制装回固定版本）
    const forced = await installWebbridge({
      dataDir: dir, binaryPath: bin, platform: "darwin", arch: "arm64", cdnBaseUrl: url,
      version: "v9.9.9", force: true,
    });
    assert.equal(forced.skipped, false);
    assert.equal(forced.installed, true);
    assert.equal(getCalls, 2, "force 下 ETag 相同也必须重新下载");
    assert.equal(readCacheManifest(dir)?.version, "v9.9.9", "manifest 版本标签必须刷新为本次安装的版本");
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

// ───── 修复 #1330：webbridge 版本固定 + skill 路径新旧双路径兼容 ─────

test("resolveWebbridgeVersion: 默认锁定固定版本号而非 latest；override / 环境变量仍优先", () => {
  const saved = process.env.KIMI_WEBBRIDGE_VERSION;
  delete process.env.KIMI_WEBBRIDGE_VERSION;
  try {
    const v = resolveWebbridgeVersion();
    assert.notEqual(v, "latest", "webbridge 版本必须随 OneClaw 发版固定，不跟随 CDN latest 漂移");
    assert.match(v, /^v\d+\.\d+\.\d+$/);
    assert.equal(resolveWebbridgeVersion("v0.0.1"), "v0.0.1");
    process.env.KIMI_WEBBRIDGE_VERSION = "v0.0.2";
    assert.equal(resolveWebbridgeVersion(), "v0.0.2");
  } finally {
    if (saved === undefined) delete process.env.KIMI_WEBBRIDGE_VERSION;
    else process.env.KIMI_WEBBRIDGE_VERSION = saved;
  }
});

test("KIMI_WEBBRIDGE_SKILL_PATHS: 覆盖新路径（stateDir/skills）与旧路径（~/.agents/skills）", () => {
  const newPath = path.join(resolveUserStateDir(), "skills", "kimi-webbridge");
  assert.ok(
    KIMI_WEBBRIDGE_SKILL_PATHS.includes(newPath),
    `应包含 webbridge v1.9.12+ 的安装路径 ${newPath}，实际 ${JSON.stringify(KIMI_WEBBRIDGE_SKILL_PATHS)}`,
  );
  assert.ok(
    KIMI_WEBBRIDGE_SKILL_PATHS.some((p) => p.endsWith(path.join(".agents", "skills", "kimi-webbridge"))),
    "应保留 v1.9.11 及更早的旧路径 ~/.agents/skills/kimi-webbridge（老用户兼容）",
  );
});

test("getWebbridgePrecheck 版本一致性: manifest 版本≠期望 → versionMismatch 且 binary/skill 需重装；一致或缺 manifest → 不触发", async () => {
  const base = {
    binaryPath: "/x", extensionId: "id", skillPaths: ["/s"],
    getDefaultBrowser: async () => ({ target: { id: "chrome", name: "Chrome" } }),
    readExtensionStates: async () => [OK_CHROME],
    fileExists: () => true,
  };
  const manifest = (version: string) => ({ version, etag: '"e"', lastModified: null, contentLength: 1 });

  // 老用户：manifest 还是旧代码写的 "latest" → 视为版本不一致，binary+skill 都要重装
  const stale = await getWebbridgePrecheck({
    ...base, readManifest: () => manifest("latest"), expectedVersion: "v1.9.17",
  });
  assert.equal(stale.versionMismatch, true);
  assert.equal(stale.ok, false);
  assert.equal(stale.missing.binary, true, "版本不一致 → binary 应标记为需重装");
  assert.equal(stale.missing.skill, true, "版本不一致 → skill 应标记为需重装");

  // 版本一致 → 不触发
  const same = await getWebbridgePrecheck({
    ...base, readManifest: () => manifest("v1.9.17"), expectedVersion: "v1.9.17",
  });
  assert.equal(same.versionMismatch, false);
  assert.equal(same.ok, true);

  // 未注入 readManifest（旧调用方/测试）→ 检测不启用，保持宽容
  const none = await getWebbridgePrecheck({ ...base });
  assert.equal(none.versionMismatch, false);
  assert.equal(none.ok, true);

  // 注入了 readManifest 但读不到（缺失/损坏 JSON），而二进制存在 → 版本无从证明，按不一致收敛
  const unprovable = await getWebbridgePrecheck({ ...base, readManifest: () => null });
  assert.equal(unprovable.versionMismatch, true, "manifest 损坏/被删但 binary 在 → 应收敛重装");

  // 注入 readManifest 读不到 + 二进制也不存在 → 全新用户，走正常安装，不触发
  const freshUser = await getWebbridgePrecheck({
    ...base, fileExists: (p: string) => p === "/s", readManifest: () => null,
  });
  assert.equal(freshUser.versionMismatch, false, "全新用户不应被误判为版本不一致");

  // 不注入 expectedVersion → 默认与 resolveWebbridgeVersion()（固定版本）比较
  const pinned = await getWebbridgePrecheck({
    ...base, readManifest: () => manifest(resolveWebbridgeVersion()),
  });
  assert.equal(pinned.versionMismatch, false);
});

test("wipeWebbridgeInstall: 备份式清理——restore 回滚旧安装、commit 删备份；非法目标跳过", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-wipe-"));
  const dataDir = path.join(root, ".kimi-webbridge");
  const skillA = path.join(root, "openclaw-skills/kimi-webbridge");
  const skillB = path.join(root, ".agents/skills/kimi-webbridge");
  const mkInstall = () => {
    fs.mkdirSync(path.join(dataDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "bin/kimi-webbridge"), "old-binary");
    fs.writeFileSync(path.join(dataDir, ".download-cache.json"), "{}");
    fs.mkdirSync(skillA, { recursive: true });
    fs.writeFileSync(path.join(skillA, "SKILL.md"), "old-skill");
    // skillB 故意不创建——验证不存在的目标静默跳过
  };
  try {
    // 1) wipe：原位移走（让 ETag 跳过必不命中），removed 只报告真实存在的路径
    mkInstall();
    const wipe = wipeWebbridgeInstall({ dataDir, skillPaths: [skillA, skillB] });
    assert.equal(fs.existsSync(dataDir), false, "dataDir 应从原位移走（含 manifest）");
    assert.equal(fs.existsSync(skillA), false, "skill 目录应从原位移走");
    assert.deepEqual(wipe.removed, [dataDir, skillA], "只报告真实存在并被清掉的路径");

    // 2) restore：安装失败场景——中途部分产物也要被旧备份覆盖
    fs.mkdirSync(path.join(dataDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "bin/kimi-webbridge"), "partial-download");
    const restored = wipe.restore();
    assert.deepEqual(restored, [dataDir, skillA]);
    assert.equal(
      fs.readFileSync(path.join(dataDir, "bin/kimi-webbridge"), "utf-8"),
      "old-binary",
      "restore 后应是修复前的旧二进制，而不是部分下载的残留",
    );
    assert.equal(fs.readFileSync(path.join(skillA, "SKILL.md"), "utf-8"), "old-skill");

    // 3) commit：安装成功场景——备份删除、原位不复活；commit 后 restore 是安全 no-op
    const wipe2 = wipeWebbridgeInstall({ dataDir, skillPaths: [skillA, skillB] });
    wipe2.commit();
    assert.equal(fs.existsSync(dataDir), false);
    assert.equal(fs.existsSync(`${dataDir}.repair-bak`), false, "commit 应删掉备份");
    assert.deepEqual(wipe2.restore(), [], "commit 后再 restore 必须是 no-op（catch 兜底安全）");

    // 4) 防御：相对路径跳过；basename 不在白名单的绝对路径也不能删
    mkInstall();
    const evil = path.join(root, "Documents");
    fs.mkdirSync(evil, { recursive: true });
    const guarded = wipeWebbridgeInstall({
      dataDir,
      skillPaths: ["relative/skills/kimi-webbridge", evil],
    });
    assert.ok(fs.existsSync(evil), "basename 不是 kimi-webbridge 的绝对路径绝不能删");
    assert.deepEqual(guarded.removed, [dataDir], "非法目标应被跳过且不出现在 removed 里");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("wipeWebbridgeInstall: rename 失败（如父目录不可写）→ 目标原地不动，绝不退化为删除", { skip: process.platform === "win32" || process.getuid?.() === 0 }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-wipe-ro-"));
  const locked = path.join(root, "locked");
  const target = path.join(locked, ".kimi-webbridge");
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, "binary"), "old");
    fs.chmodSync(locked, 0o555); // 父目录只读 → renameSync 必然 EACCES

    const wipe = wipeWebbridgeInstall({ dataDir: target, skillPaths: [] });

    // 不变量：要么备份成功可还原，要么原地不动——绝不能"删了但还原不了"
    assert.ok(fs.existsSync(target), "rename 失败时目标必须原地保留（收敛由 force 安装兜底）");
    assert.deepEqual(wipe.removed, [], "未动过的目标不应出现在 removed 里");
    wipe.commit();
    assert.deepEqual(wipe.restore(), []);
    assert.ok(fs.existsSync(path.join(target, "binary")), "原内容完好");
  } finally {
    fs.chmodSync(locked, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stopWebbridgeProcesses: Windows taskkill 镜像名；POSIX pkill 二进制路径；无进程时不抛错", async () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const exec: ExecFileAsync = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: "", stderr: "" };
  };

  await stopWebbridgeProcesses({ platform: "win32", execFileAsync: exec });
  assert.deepEqual(calls[0], {
    cmd: "taskkill",
    args: ["/F", "/T", "/IM", "kimi-webbridge.exe"],
  });

  await stopWebbridgeProcesses({
    platform: "darwin",
    binaryPath: "/h/.kimi-webbridge/bin/kimi-webbridge",
    execFileAsync: exec,
  });
  assert.deepEqual(calls[1], {
    cmd: "pkill",
    args: ["-f", "/h/.kimi-webbridge/bin/kimi-webbridge"],
  });

  // 无匹配进程时 taskkill(128)/pkill(1) 退出码非 0 → execFile 抛错 → 必须吞掉视为"已停止"
  await stopWebbridgeProcesses({
    platform: "win32",
    execFileAsync: async () => {
      throw new Error("Command failed: taskkill exited with code 128");
    },
  });
});

test("installWebbridge: stopProcesses 只在真正替换二进制前调用；ETag 跳过时绝不杀进程", async () => {
  const body = Buffer.alloc(64, 0x42);
  const { url, close } = await startCdn(body, '"v1"');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-stop-"));
  const bin = path.join(dir, "bin/kimi-webbridge");
  let stops = 0;
  const opts = {
    dataDir: dir, binaryPath: bin, platform: "darwin", arch: "arm64", cdnBaseUrl: url,
    stopProcesses: async () => { stops++; },
  };
  try {
    // 首次下载 → 替换前必须先停进程（Windows 下运行中的 daemon 锁 exe，rename 必 EPERM）
    const fresh = await installWebbridge({ ...opts });
    assert.equal(fresh.installed, true);
    assert.equal(stops, 1, "下载安装前应停掉运行中的 webbridge 进程");

    // ETag 命中跳过 → 不替换二进制 → 不能无谓杀用户正在用的 daemon
    writeCacheManifest(dir, { version: "latest", etag: '"v1"', lastModified: null, contentLength: null });
    const cached = await installWebbridge({ ...opts });
    assert.equal(cached.skipped, true);
    assert.equal(stops, 1, "跳过安装时不应调用 stopProcesses");

    // force（版本不一致修复路径）→ 必然替换 → 必须停
    const forced = await installWebbridge({ ...opts, force: true });
    assert.equal(forced.skipped, false);
    assert.equal(stops, 2, "force 重装前同样应停进程");
  } finally {
    await close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("createSingleFlight: 同一时刻只允许一个进入；exit 后可再进", () => {
  const gate = createSingleFlight();
  assert.equal(gate.tryEnter(), true);
  assert.equal(gate.tryEnter(), false, "占用期间第二个调用必须被拒绝");
  gate.exit();
  assert.equal(gate.tryEnter(), true, "exit 后应可重新进入");
  gate.exit();
});

test("getWebbridgePrecheck 默认路径: skill 只在新路径 → 通过；只在旧路径 → 通过；都没有 → missing", async () => {
  const base = {
    binaryPath: "/x", extensionId: "id",
    getDefaultBrowser: async () => ({ target: { id: "chrome", name: "Chrome" } }),
    readExtensionStates: async () => [OK_CHROME],
  };
  const newPath = path.join(resolveUserStateDir(), "skills", "kimi-webbridge");
  const fresh = await getWebbridgePrecheck({ ...base, fileExists: (p) => p === "/x" || p === newPath });
  assert.equal(fresh.missing.skill, false, "新用户只有新路径时不应报 missing.skill（#1330 死循环根因）");
  const old = await getWebbridgePrecheck({
    ...base,
    fileExists: (p) => p === "/x" || p.endsWith(path.join(".agents", "skills", "kimi-webbridge")),
  });
  assert.equal(old.missing.skill, false, "老用户只有旧路径时仍应通过");
  const none = await getWebbridgePrecheck({ ...base, fileExists: (p) => p === "/x" });
  assert.equal(none.missing.skill, true, "两处都不存在时检测仍应有效");
});
