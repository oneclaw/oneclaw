#!/usr/bin/env node
// dev 多实例隔离启动器
// 从 cwd 路径 hash 出唯一端口，状态目录指向 worktree 内部，跳过单实例锁。
// 通过 pidfile 保证同一 .dev-state/ 只能启动一个实例。
// 用法: npm run dev:isolated                   （自动复制主配置，跳过 setup）
//       npm run dev:isolated -- --with-setup   （强制进入 Setup Wizard）

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
  // dev 主进程走 !app.isPackaged 分支，强制读 gateway/ 散文件（无法读 asar 虚路径）。
  // .env.build 里 ONECLAW_GATEWAY_ASAR=1 是给 dist:* 用的——在 dev 里覆盖为 0，
  // 避免 package:resources 打完 gateway.asar 后删掉散文件导致 gateway 起不来。
  ONECLAW_GATEWAY_ASAR: "0",
};

console.log(`[dev-isolated] 状态目录: ${stateDir}`);
console.log(`[dev-isolated] Gateway 端口: ${port}`);
console.log(`[dev-isolated] PID: ${process.pid}`);

// ── isolated 状态目录初始化：从 ~/.openclaw/ 复制配置，避免进入 Setup Wizard ──
// --with-setup 跳过复制，强制走 Setup Wizard（用于调试 setup 流程）
const withSetup = process.argv.includes("--with-setup");
const isolatedConfig = path.join(stateDir, "oneclaw.config.json");
if (!withSetup && !fs.existsSync(isolatedConfig)) {
  const home = process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
  const mainStateDir = path.join(home || "", ".openclaw");
  const mainConfig = path.join(mainStateDir, "oneclaw.config.json");
  const mainOpenclaw = path.join(mainStateDir, "openclaw.json");

  // oneclaw.config.json — 仅在源配置存在时复制，否则自然进入 Setup Wizard
  if (fs.existsSync(mainConfig)) {
    fs.copyFileSync(mainConfig, isolatedConfig);
    console.log(`[dev-isolated] 已复制 ~/.openclaw/oneclaw.config.json`);
  }

  // openclaw.json（provider 配置）
  const isolatedOpenclaw = path.join(stateDir, "openclaw.json");
  if (!fs.existsSync(isolatedOpenclaw) && fs.existsSync(mainOpenclaw)) {
    fs.copyFileSync(mainOpenclaw, isolatedOpenclaw);
  }

  // credentials/（Kimi Search API key 等）
  const mainCreds = path.join(mainStateDir, "credentials");
  const isolatedCreds = path.join(stateDir, "credentials");
  if (!fs.existsSync(isolatedCreds) && fs.existsSync(mainCreds)) {
    fs.mkdirSync(isolatedCreds, { recursive: true });
    for (const f of fs.readdirSync(mainCreds)) {
      const src = path.join(mainCreds, f);
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(isolatedCreds, f));
    }
  }

  // ── workspace 隔离 ──
  // 不重定向 workspace 时，session-memory hook、memory_search 等会写入真实 ~/.openclaw/workspace，
  // 污染主实例数据。这里把 workspace 也指向 .dev-state/workspace，并复制必要的 bootstrap 文件。
  const isolatedWorkspace = path.join(stateDir, "workspace");
  const mainWorkspace = path.join(mainStateDir, "workspace");
  if (!fs.existsSync(isolatedWorkspace) && fs.existsSync(mainWorkspace)) {
    fs.mkdirSync(isolatedWorkspace, { recursive: true });
    // bootstrap 文件：AGENTS/SOUL/TOOLS/IDENTITY/HEARTBEAT/MEMORY.md
    const bootstrapFiles = ["AGENTS.md", "SOUL.md", "TOOLS.md", "IDENTITY.md", "HEARTBEAT.md", "MEMORY.md", "BOOTSTRAP.md", "USER.md"];
    for (const f of bootstrapFiles) {
      const src = path.join(mainWorkspace, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(isolatedWorkspace, f));
    }
    // onboarding 完成标记，避免每次启动重新引导
    const stateMarkerSrc = path.join(mainWorkspace, ".openclaw", "workspace-state.json");
    if (fs.existsSync(stateMarkerSrc)) {
      fs.mkdirSync(path.join(isolatedWorkspace, ".openclaw"), { recursive: true });
      fs.copyFileSync(stateMarkerSrc, path.join(isolatedWorkspace, ".openclaw", "workspace-state.json"));
    }
    // memory/ 留空，让测试从干净状态开始
    fs.mkdirSync(path.join(isolatedWorkspace, "memory"), { recursive: true });
    console.log(`[dev-isolated] 已初始化 workspace（bootstrap 已复制，memory 为空）`);
  } else if (!fs.existsSync(isolatedWorkspace)) {
    fs.mkdirSync(path.join(isolatedWorkspace, "memory"), { recursive: true });
  }

  // 强制把 agents.defaults.workspace 写进 openclaw.json，覆盖源配置里可能存在的真实路径
  if (fs.existsSync(isolatedOpenclaw)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(isolatedOpenclaw, "utf-8"));
      cfg.agents ??= {};
      cfg.agents.defaults ??= {};
      if (cfg.agents.defaults.workspace !== isolatedWorkspace) {
        cfg.agents.defaults.workspace = isolatedWorkspace;
        fs.writeFileSync(isolatedOpenclaw, JSON.stringify(cfg, null, 2));
        console.log(`[dev-isolated] 已重写 agents.defaults.workspace → ${isolatedWorkspace}`);
      }
    } catch (err) {
      console.error(`[dev-isolated] 警告：无法重写 workspace 配置: ${err.message}`);
    }
  }
}
if (withSetup) {
  console.log(`[dev-isolated] --with-setup: 跳过配置复制，将进入 Setup Wizard`);
  console.log(`[dev-isolated] 注意：Step 0 安装冲突检测会扫描默认端口 18789 与全局 openclaw，`);
  console.log(`[dev-isolated] 如果主实例正在运行会误报"已有安装"，直接点 Next 跳过即可（属预期行为）。`);
}

console.log(`[dev-isolated] 启动 electron ...\n`);

// npm run dev → predev（package:resources + build）→ electron .
const isWin = process.platform === "win32";
const npmCmd = isWin ? "npm.cmd" : "npm";

const child = spawn(npmCmd, ["run", "dev"], { cwd, stdio: "inherit", env });
child.on("close", (c) => process.exit(c ?? 0));
