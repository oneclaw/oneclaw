const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

// 加载 afterPack 脚本中的顶层函数，避免走完整 electron-builder 流程。
function loadAfterPackSandbox() {
  const scriptPath = path.join(__dirname, "afterPack.js");
  const source = fs.readFileSync(scriptPath, "utf-8");
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

test("Windows afterPack wrapper 应优先调用 Helper.exe 并回退主 exe", () => {
  const sandbox = loadAfterPackSandbox();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-afterpack-"));
  const targetBase = path.join(tmpRoot, "resources");
  const runtimeDir = path.join(targetBase, "runtime");
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "node.exe"), "node");
  fs.writeFileSync(path.join(runtimeDir, "npm.cmd"), "@echo off\r\n");
  fs.writeFileSync(path.join(runtimeDir, "npx.cmd"), "@echo off\r\n");

  sandbox.replaceNodeBinary("win32", targetBase, "OneClaw");

  const npmCmd = fs.readFileSync(path.join(runtimeDir, "npm.cmd"), "utf-8");
  assert.equal(fs.existsSync(path.join(runtimeDir, "node.exe")), false);
  assert.match(npmCmd, /OneClaw Helper\.exe/);
  assert.match(npmCmd, /if exist/i);
  assert.match(npmCmd, /OneClaw\.exe/);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
