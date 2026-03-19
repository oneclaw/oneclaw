#!/usr/bin/env node
// dev 多实例隔离启动器
// 从 cwd 路径 hash 出唯一端口，状态目录指向 worktree 内部，跳过单实例锁。
// 用法: npm run dev:isolated  （在任意 worktree 目录下执行）

"use strict";

const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

// 从路径哈希出 19000-19999 范围的端口号，同一路径始终得到同一端口
function hashPort(dir) {
  const hash = createHash("md5").update(dir).digest();
  return 19000 + (hash.readUInt16LE(0) % 1000);
}

const cwd = process.cwd();
const port = hashPort(cwd);
const stateDir = path.join(cwd, ".dev-state");

// 确保状态目录存在
fs.mkdirSync(stateDir, { recursive: true });

// 把 .dev-state 加进 .gitignore（幂等）
const gitignorePath = path.join(cwd, ".gitignore");
if (fs.existsSync(gitignorePath)) {
  const content = fs.readFileSync(gitignorePath, "utf-8");
  if (!content.includes(".dev-state")) {
    fs.appendFileSync(gitignorePath, "\n# dev 多实例隔离状态目录\n.dev-state/\n");
  }
}

const env = {
  ...process.env,
  ONECLAW_MULTI_INSTANCE: "1",
  OPENCLAW_STATE_DIR: stateDir,
  OPENCLAW_GATEWAY_PORT: String(port),
};

console.log(`[dev-isolated] 状态目录: ${stateDir}`);
console.log(`[dev-isolated] Gateway 端口: ${port}`);
console.log(`[dev-isolated] 启动 electron ...\n`);

// 先 build 再启动 electron（复用 predev 逻辑）
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const build = spawn(npmCmd, ["run", "build"], { cwd, stdio: "inherit", env });

build.on("close", (code) => {
  if (code !== 0) {
    console.error(`[dev-isolated] build 失败，退出码 ${code}`);
    process.exit(code ?? 1);
  }

  // build 成功后启动 electron
  const electron = require("electron");
  const electronBin = typeof electron === "string" ? electron : electron.toString();

  const child = spawn(electronBin, ["."], { cwd, stdio: "inherit", env });

  child.on("close", (c) => process.exit(c ?? 0));
});
