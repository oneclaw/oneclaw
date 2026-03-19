#!/usr/bin/env node
// dev 多实例隔离启动器
// 从 cwd 路径 hash 出唯一端口，状态目录指向 worktree 内部，跳过单实例锁。
// 通过 pidfile 保证同一 .dev-state/ 只能启动一个实例。
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

// 检查 pid 是否还活着
function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// pidfile 锁：同一 stateDir 只允许一个实例
function acquireLock(stateDir) {
  const lockFile = path.join(stateDir, "dev.pid");
  if (fs.existsSync(lockFile)) {
    try {
      const oldPid = Number.parseInt(fs.readFileSync(lockFile, "utf-8").trim(), 10);
      if (oldPid && isProcessAlive(oldPid)) {
        console.error(`[dev-isolated] 此 worktree 已有实例在运行 (PID ${oldPid})`);
        console.error(`[dev-isolated] 如果确认无残留，手动删除 ${lockFile} 后重试`);
        process.exit(1);
      }
    } catch {}
  }
  // 写入当前 pid
  fs.writeFileSync(lockFile, String(process.pid));
  return lockFile;
}

// 清理 pidfile
function releaseLock(lockFile) {
  try { fs.unlinkSync(lockFile); } catch {}
}

const cwd = process.cwd();
const port = hashPort(cwd);
const stateDir = path.join(cwd, ".dev-state");

// 确保状态目录存在
fs.mkdirSync(stateDir, { recursive: true });

// 获取锁
const lockFile = acquireLock(stateDir);

// 进程退出时清理 pidfile
process.on("exit", () => releaseLock(lockFile));
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));

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
console.log(`[dev-isolated] PID: ${process.pid}`);
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
