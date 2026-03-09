const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

// 加载 afterPack 脚本中的顶层函数，避免走完整 electron-builder 流程。
function loadAfterPackSandbox(scriptPath = path.join(__dirname, "afterPack.js")) {
  const source = fs.readFileSync(scriptPath, "utf-8");
  const sandbox = {
    require,
    __dirname: path.dirname(scriptPath),
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

test("Windows afterPack 应保留展开的 gateway node_modules 而不是生成 tar", async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-afterpack-flow-"));
  const scriptDir = path.join(tmpRoot, "scripts");
  const resourcesDir = path.join(tmpRoot, "resources", "targets", "win32-x64");
  const runtimeDir = path.join(resourcesDir, "runtime");
  const gatewayDir = path.join(resourcesDir, "gateway");
  const modulesDir = path.join(gatewayDir, "node_modules");
  const scriptPath = path.join(scriptDir, "afterPack.js");

  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(path.join(__dirname, "afterPack.js"), scriptPath);

  fs.mkdirSync(path.join(runtimeDir, "node_modules", "npm", "bin"), { recursive: true });
  fs.writeFileSync(path.join(runtimeDir, "node.exe"), "node");
  fs.writeFileSync(path.join(runtimeDir, "npm.cmd"), "@echo off\r\n");
  fs.writeFileSync(path.join(runtimeDir, "npx.cmd"), "@echo off\r\n");
  fs.writeFileSync(path.join(runtimeDir, "node_modules", "npm", "bin", "npm-cli.js"), "console.log('npm');\n");
  fs.writeFileSync(path.join(runtimeDir, "node_modules", "npm", "bin", "npx-cli.js"), "console.log('npx');\n");

  fs.mkdirSync(path.join(modulesDir, "openclaw"), { recursive: true });
  fs.mkdirSync(path.join(modulesDir, "clawhub", "bin"), { recursive: true });
  fs.writeFileSync(path.join(modulesDir, "openclaw", "openclaw.mjs"), "export {};\n");
  fs.writeFileSync(path.join(modulesDir, "clawhub", "bin", "clawdhub.js"), "console.log('clawhub');\n");
  fs.writeFileSync(path.join(gatewayDir, "gateway-entry.mjs"), "export {};\n");
  fs.writeFileSync(path.join(resourcesDir, "analytics-config.json"), "{}\n");

  const sandbox = loadAfterPackSandbox(scriptPath);
  const appOutDir = path.join(tmpRoot, "out");
  fs.mkdirSync(path.join(appOutDir, "resources"), { recursive: true });

  await sandbox.exports.default({
    electronPlatformName: "win32",
    appOutDir,
    arch: "x64",
    packager: {
      appInfo: {
        productFilename: "OneClaw",
      },
    },
  });

  const packagedGatewayDir = path.join(appOutDir, "resources", "resources", "gateway");
  assert.equal(fs.existsSync(path.join(packagedGatewayDir, "node_modules")), true);
  assert.equal(fs.existsSync(path.join(packagedGatewayDir, "node_modules.tar")), false);

  fs.rmSync(tmpRoot, { recursive: true, force: true });
});
