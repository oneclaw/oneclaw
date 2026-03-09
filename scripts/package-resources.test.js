const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

// 加载 package-resources 脚本并跳过 main()，只测试补丁函数。
function loadPackageResourcesSandbox() {
  const scriptPath = path.join(__dirname, "package-resources.js");
  const rawSource = fs.readFileSync(scriptPath, "utf-8");
  const source = rawSource.replace(/\nmain\(\)\.catch\(\(err\) => \{\n[\s\S]*?\n\}\);\s*$/, "\n");
  const sandbox = {
    require,
    __dirname,
    console,
    process,
    exports: {},
    module: { exports: {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: scriptPath });
  return sandbox;
}

test("Windows openclaw 补丁应为 exec spawn 注入 windowsHide", () => {
  const sandbox = loadPackageResourcesSandbox();
  assert.equal(typeof sandbox.patchWindowsOpenclawArtifacts, "function");

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-resources-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });
  const execFile = path.join(distDir, "exec-abc.js");
  const gatewayCliFile = path.join(distDir, "gateway-cli-abc.js");
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
  fs.writeFileSync(gatewayCliFile, [
    "const child = spawn(process.execPath, args, {",
    "\t\tenv: process.env,",
    "\t\tdetached: true,",
    '\t\tstdio: "inherit"',
    "\t});",
    "",
  ].join("\n"));

  sandbox.patchWindowsOpenclawArtifacts(tmpRoot);

  const patched = fs.readFileSync(execFile, "utf-8");
  const patchedGatewayCli = fs.readFileSync(gatewayCliFile, "utf-8");
  assert.match(patched, /windowsHide:\s*true/);
  assert.match(patchedGatewayCli, /windowsHide:\s*true/);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("Windows openclaw 补丁应允许已打过补丁的缓存依赖重复复用", () => {
  const sandbox = loadPackageResourcesSandbox();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-package-resources-"));
  const distDir = path.join(tmpRoot, "node_modules", "openclaw", "dist");
  fs.mkdirSync(distDir, { recursive: true });

  fs.writeFileSync(path.join(distDir, "exec-abc.js"), [
    'const child = spawn(useCmdWrapper ? process$1.env.ComSpec ?? "cmd.exe" : resolvedCommand, useCmdWrapper ? [',
    '\t"/d"',
    '\t] : finalArgv.slice(1), {',
    "\t\twindowsHide: true,",
    "\t\tstdio,",
    "\t\tcwd,",
    "\t});",
    "",
  ].join("\n"));
  fs.writeFileSync(path.join(distDir, "gateway-cli-abc.js"), [
    "const child = spawn(process.execPath, args, {",
    "\t\twindowsHide: true,",
    "\t\tenv: process.env,",
    "\t\tdetached: true,",
    '\t\tstdio: "inherit"',
    "\t});",
    "",
  ].join("\n"));

  sandbox.patchWindowsOpenclawArtifacts(tmpRoot);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
