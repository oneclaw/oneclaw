const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

// 加载 package-resources 脚本并跳过 main()，只测试局部函数。
function loadPackageResourcesSandbox(options = {}) {
  const scriptPath = path.join(__dirname, "package-resources.js");
  const rawSource = fs.readFileSync(scriptPath, "utf-8");
  const source = rawSource.replace(/\nmain\(\)\.catch\(\(err\) => \{\n[\s\S]*?\n\}\);\s*$/, "\n");
  const sandboxProcess = options.process || Object.assign(Object.create(process), {
    argv: process.argv.slice(),
    env: { ...process.env },
  });
  const sandbox = {
    require,
    __dirname,
    console,
    process: sandboxProcess,
    exports: {},
    module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: scriptPath });
  return sandbox;
}

// 写入测试文件时自动补目录，避免样板代码污染用例意图。
function writeFixture(filePath, content = "") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test("Windows 全局 windowsHide 补丁应覆盖所有 spawn 调用", () => {
  const sandbox = loadPackageResourcesSandbox();
  assert.equal(typeof sandbox.patchWindowsOpenclawArtifacts, "function");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-resources-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });

  // exec 模式（工具执行）
  const execFile = path.join(distDir, "exec-abc.js");
  fs.writeFileSync(execFile, [
    'const child = spawn(useCmdWrapper ? process$1.env.ComSpec ?? "cmd.exe" : resolvedCommand, useCmdWrapper ? [',
    '\t"/d"',
    '\t] : finalArgv.slice(1), {',
    "\t\tstdio,",
    "\t\tcwd,",
    "\t\tenv: resolvedEnv,",
    "\t});",
    "",
  ].join("\n"));

  // gateway-cli respawn 模式
  const gatewayCliFile = path.join(distDir, "gateway-cli-abc.js");
  fs.writeFileSync(gatewayCliFile, [
    "const child = spawn(process.execPath, args, {",
    "\t\tenv: process.env,",
    "\t\tdetached: true,",
    '\t\tstdio: "inherit"',
    "\t});",
    "",
  ].join("\n"));

  // killProcessTree$1 模式（shell-utils.ts，每次工具执行结束后调用）
  const sessionFile = path.join(distDir, "model-selection-abc.js");
  fs.writeFileSync(sessionFile, [
    "function killProcessTree$1(pid) {",
    '  if (process.platform === "win32") {',
    "    try {",
    '      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {',
    '        stdio: "ignore",',
    "        detached: true",
    "      });",
    "    } catch {}",
    "  }",
    "}",
    "",
  ].join("\n"));

  // workspace runCommandWithTimeout 模式
  const workspaceFile = path.join(distDir, "workspace-abc.js");
  fs.writeFileSync(workspaceFile, [
    'const child = spawn(useCmdWrapper ? cmd : resolvedCommand, useCmdWrapper ? ["/d", "/s", "/c", line] : finalArgv.slice(1), {',
    "\tstdio,",
    "\tcwd,",
    "\tenv: resolvedEnv,",
    "});",
    "",
  ].join("\n"));

  sandbox.patchWindowsOpenclawArtifacts(tmpRoot);

  assert.match(fs.readFileSync(execFile, "utf-8"), /windowsHide:\s*true/);
  assert.match(fs.readFileSync(gatewayCliFile, "utf-8"), /windowsHide:\s*true/);
  assert.match(fs.readFileSync(sessionFile, "utf-8"), /windowsHide:\s*true/);
  assert.match(fs.readFileSync(workspaceFile, "utf-8"), /windowsHide:\s*true/);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("Windows 全局 windowsHide 补丁应幂等（已有补丁不重复注入）", () => {
  const sandbox = loadPackageResourcesSandbox();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-resources-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });

  // 已包含 windowsHide 的 exec 文件
  const content = [
    'const child = spawn(useCmdWrapper ? cmd : resolvedCommand, useCmdWrapper ? ["/d"] : finalArgv.slice(1), {',
    "\twindowsHide: true,",
    "\tstdio,",
    "\tcwd,",
    "});",
    "",
  ].join("\n");
  const execFile = path.join(distDir, "exec-abc.js");
  fs.writeFileSync(execFile, content);

  sandbox.patchWindowsOpenclawArtifacts(tmpRoot);

  // 文件应保持不变（只有 1 个 windowsHide，没有重复注入）
  const after = fs.readFileSync(execFile, "utf-8");
  assert.equal((after.match(/windowsHide/g) || []).length, 1);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("Windows 全局 windowsHide 补丁应覆盖 kimi-claw 插件", () => {
  const sandbox = loadPackageResourcesSandbox();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-resources-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });
  // 需要一个空 exec 文件让 patch 不报错
  fs.writeFileSync(path.join(distDir, "placeholder.js"), "// empty\n");

  // kimi-claw terminal-session-manager pipe 回退
  const kimiDir = path.join(tmpRoot, "node_modules", "openclaw", "extensions", "kimi-claw", "dist", "src");
  fs.mkdirSync(kimiDir, { recursive: true });
  const termFile = path.join(kimiDir, "terminal-session-manager.js");
  fs.writeFileSync(termFile, 'const t=spawn(e.shell,[],{cwd:e.cwd,env:process.env,stdio:["pipe","pipe","pipe"]});\n');

  sandbox.patchWindowsOpenclawArtifacts(tmpRoot);

  assert.match(fs.readFileSync(termFile, "utf-8"), /windowsHide:\s*true/);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// 白名单裁剪必须深入保留插件内部继续清垃圾，而不是把整个 extensions 目录豁免掉。
test("pruneNodeModules 应按扩展白名单裁剪并清理保留插件内部垃圾", () => {
  const sandbox = loadPackageResourcesSandbox();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-prune-"));
  const nmDir = path.join(tmpRoot, "node_modules");
  const feishuDir = path.join(nmDir, "openclaw", "extensions", "feishu");

  writeFixture(path.join(feishuDir, "openclaw.plugin.json"), "{}\n");
  writeFixture(path.join(feishuDir, "runtime.js"), "module.exports = {};\n");
  writeFixture(path.join(feishuDir, "README.md"), "# docs\n");
  writeFixture(path.join(feishuDir, "types.d.ts"), "export {};\n");
  writeFixture(path.join(feishuDir, "bundle.js.map"), "{}\n");
  writeFixture(path.join(feishuDir, "tests", "plugin.test.js"), "test\n");
  writeFixture(path.join(feishuDir, "docs", "guide.md"), "# guide\n");
  writeFixture(path.join(feishuDir, "node_modules", ".ignored", "pkg", "index.js"), "ignored\n");
  writeFixture(path.join(feishuDir, "node_modules", ".ignored_openai", "pkg", "index.js"), "ignored\n");
  writeFixture(path.join(feishuDir, "node_modules", "real-dep", "index.js"), "keep\n");
  writeFixture(path.join(nmDir, "openclaw", "extensions", "slack", "openclaw.plugin.json"), "{}\n");

  sandbox.pruneNodeModules(nmDir);

  assert.equal(fs.existsSync(path.join(feishuDir, "runtime.js")), true);
  assert.equal(fs.existsSync(path.join(feishuDir, "README.md")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "types.d.ts")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "bundle.js.map")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "tests")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "docs")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "node_modules", ".ignored")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "node_modules", ".ignored_openai")), false);
  assert.equal(fs.existsSync(path.join(feishuDir, "node_modules", "real-dep", "index.js")), true);
  assert.equal(fs.existsSync(path.join(nmDir, "openclaw", "extensions", "slack")), false);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// 输出校验必须覆盖白名单里的基础插件，否则构建脚本会悄悄打出残缺包。
test("verifyOutput 应要求基础扩展插件存在", () => {
  const sandbox = loadPackageResourcesSandbox({
    process: Object.assign(Object.create(process), {
      argv: process.argv.slice(),
      env: { ...process.env },
      exit(code) {
        throw new Error(`process.exit:${code}`);
      },
    }),
  });
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-verify-"));
  const targetBase = path.join(tmpRoot, "win32-x64");

  writeFixture(path.join(targetBase, "runtime", "node.exe"), "node\n");
  fs.mkdirSync(path.join(targetBase, "runtime", "node_modules", "npm"), { recursive: true });
  writeFixture(path.join(targetBase, "gateway", "gateway-entry.mjs"), "export {};\n");
  writeFixture(path.join(targetBase, "gateway", "node_modules", "openclaw", "openclaw.mjs"), "export {};\n");
  writeFixture(path.join(targetBase, "gateway", "node_modules", "openclaw", "dist", "entry.js"), "module.exports = {};\n");
  writeFixture(path.join(targetBase, "gateway", "node_modules", "openclaw", "dist", "control-ui", "index.html"), "<html></html>\n");
  writeFixture(path.join(targetBase, "gateway", "node_modules", "clawhub", "bin", "clawdhub.js"), "module.exports = {};\n");
  writeFixture(path.join(targetBase, "build-config.json"), "{}\n");
  writeFixture(path.join(targetBase, "app-icon.png"), "png\n");

  for (const id of [
    "shared",
    "memory-core",
    "device-pair",
    "imessage",
    "kimi-claw",
    "kimi-search",
    "qqbot",
    "dingtalk-connector",
    "wecom-openclaw-plugin",
  ]) {
    const extDir = path.join(targetBase, "gateway", "node_modules", "openclaw", "extensions", id);
    if (id === "shared") {
      fs.mkdirSync(extDir, { recursive: true });
    } else {
      writeFixture(path.join(extDir, "openclaw.plugin.json"), "{}\n");
    }
  }

  assert.throws(
    () => sandbox.verifyOutput({ targetBase }, "win32"),
    /process\.exit:1/
  );

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ─── patchPdfToolLocalRoots 测试 ───

// 构造一份最小 reply-*.js fixture：包含非 sandbox anchor + sandbox 分支（不应被动）
// + 无关 loadWebMediaRaw 调用（也不应被动）。用 tabs 精确复刻 openclaw 原始缩进。
function buildReplyFixture() {
  return [
    '// fake reply-*.js for patchPdfToolLocalRoots tests',
    'import fs, { constants } from "node:fs";',
    'import path, { isAbsolute, posix } from "node:path";',
    '',
    'async function createPdfTool(options) {',
    '\tconst maxBytesMbDefault = (options?.config?.agents?.defaults)?.pdfMaxBytesMb;',
    '\tconst maxBytes = 10 * 1024 * 1024;',
    '\tconst localRoots = ["~/.openclaw/media"];',
    '\tconst sandboxConfig = options?.sandbox;',
    '\tconst resolvedPdf = "/tmp/test.pdf";',
    '\tconst resolvedPathInfo = { resolved: resolvedPdf };',
    '\t{',
    '\t\t{',
    '\t\t\t{',
    '\t\t\t\tconst media = sandboxConfig ? await loadWebMediaRaw(resolvedPathInfo.resolved, {',
    '\t\t\t\t\tmaxBytes,',
    '\t\t\t\t\tsandboxValidated: true,',
    '\t\t\t\t\treadFile: createSandboxBridgeReadFile({ sandbox: sandboxConfig })',
    '\t\t\t\t}) : await loadWebMediaRaw(resolvedPathInfo.resolved, {',
    '\t\t\t\t\tmaxBytes,',
    '\t\t\t\t\tlocalRoots',
    '\t\t\t\t});',
    '\t\t\t\treturn media;',
    '\t\t\t}',
    '\t\t}',
    '\t}',
    '}',
    '',
    '// 无关调用，绝对不能被改',
    'async function discordEmoji(payload) {',
    '\tconst media = await loadWebMediaRaw(payload.mediaUrl, 65536);',
    '\treturn media;',
    '}',
    '',
  ].join("\n");
}

test("patchPdfToolLocalRoots 应替换 PDF tool 非 sandbox 分支并保留其他调用", () => {
  const sandbox = loadPackageResourcesSandbox();
  assert.equal(typeof sandbox.patchPdfToolLocalRoots, "function");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-pdf-patch-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });

  const replyFile = path.join(distDir, "reply-FAKE.js");
  const originalSource = buildReplyFixture();
  fs.writeFileSync(replyFile, originalSource);

  sandbox.patchPdfToolLocalRoots(tmpRoot);

  const patched = fs.readFileSync(replyFile, "utf-8");

  // 1. 幂等 marker 必须存在
  assert.ok(patched.includes("/* oneclaw-pdf-bypass */"), "expected bypass marker");

  // 2. localRoots 必须变成 "any"
  assert.ok(patched.includes('localRoots: "any"'), "expected localRoots: \"any\"");

  // 3. 五层防护全部在位
  assert.ok(patched.includes("isAbsolute(inputPath)"), "expected isAbsolute input check");
  assert.ok(patched.includes('fs.promises.realpath(inputPath)'), "expected realpath call");
  assert.ok(patched.includes('normalize("NFC")'), "expected NFC normalization");
  assert.ok(patched.includes("_st.isFile()"), "expected isFile check");
  assert.ok(patched.includes('Buffer.from("%PDF-", "ascii")'), "expected PDF magic bytes check");
  assert.ok(patched.includes("_DENY_DIR_SEGMENTS"), "expected deny dir segments");
  assert.ok(patched.includes("_DENY_BASENAMES"), "expected deny basenames");
  assert.ok(patched.includes("_DENY_PATTERNS"), "expected deny patterns");

  // 4. Sandbox 分支不能被动（sandboxValidated + createSandboxBridgeReadFile 仍在）
  assert.ok(patched.includes("sandboxValidated: true"), "sandbox branch must be preserved");
  assert.ok(patched.includes("createSandboxBridgeReadFile"), "sandbox readFile must be preserved");

  // 5. 无关调用（discordEmoji 里的 loadWebMediaRaw）未被动
  assert.ok(
    patched.includes('await loadWebMediaRaw(payload.mediaUrl, 65536)'),
    "unrelated loadWebMediaRaw call must be preserved",
  );

  // 6. 幂等：再跑一次不会重复 patch
  const beforeSecond = fs.readFileSync(replyFile, "utf-8");
  sandbox.patchPdfToolLocalRoots(tmpRoot);
  const afterSecond = fs.readFileSync(replyFile, "utf-8");
  assert.equal(afterSecond, beforeSecond, "second run must be idempotent");

  // 7. marker 只应出现一次（防止嵌套 patch）
  const markerCount = afterSecond.split("/* oneclaw-pdf-bypass */").length - 1;
  assert.equal(markerCount, 1, "marker should appear exactly once");

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("patchPdfToolLocalRoots 应在 anchor drift 时中断构建", () => {
  const sandbox = loadPackageResourcesSandbox({
    process: Object.assign(Object.create(process), {
      argv: process.argv.slice(),
      env: { ...process.env },
      exit(code) {
        throw new Error(`process.exit:${code}`);
      },
    }),
  });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-pdf-patch-drift-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });

  // 假 reply-*.js 不含 anchor（模拟 openclaw 升级后的 anchor drift）
  fs.writeFileSync(
    path.join(distDir, "reply-DRIFT.js"),
    'console.log("nothing to patch here");\n',
  );

  assert.throws(
    () => sandbox.patchPdfToolLocalRoots(tmpRoot),
    /process\.exit:1/,
  );

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("patchPdfToolLocalRoots 应在 dist 目录缺失时中断构建", () => {
  const sandbox = loadPackageResourcesSandbox({
    process: Object.assign(Object.create(process), {
      argv: process.argv.slice(),
      env: { ...process.env },
      exit(code) {
        throw new Error(`process.exit:${code}`);
      },
    }),
  });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-pdf-patch-missing-"));

  assert.throws(
    () => sandbox.patchPdfToolLocalRoots(tmpRoot),
    /process\.exit:1/,
  );

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("patchPdfToolLocalRoots 应在 reply-*.js 全部缺失时中断构建", () => {
  const sandbox = loadPackageResourcesSandbox({
    process: Object.assign(Object.create(process), {
      argv: process.argv.slice(),
      env: { ...process.env },
      exit(code) {
        throw new Error(`process.exit:${code}`);
      },
    }),
  });

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-pdf-patch-nofiles-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });
  // dist 存在但不含 reply-*.js
  fs.writeFileSync(path.join(distDir, "other.js"), "// not a reply file\n");

  assert.throws(
    () => sandbox.patchPdfToolLocalRoots(tmpRoot),
    /process\.exit:1/,
  );

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
