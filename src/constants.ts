import { app } from "electron";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";
import { isSetupCompleteFromConfig } from "./setup-completion";
import { readOneclawConfig } from "./oneclaw-config";

// ── 网络端口 ──

export const DEFAULT_PORT = 18789;
export const DEFAULT_BIND = "loopback";

// 从用户配置/环境变量解析 Gateway 端口（与 openclaw 内部逻辑一致）
export function resolveGatewayPort(): number {
  const envRaw = process.env.OPENCLAW_GATEWAY_PORT?.trim();
  if (envRaw) {
    const parsed = Number.parseInt(envRaw, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  try {
    const raw = fs.readFileSync(resolveUserConfigPath(), "utf-8");
    const cfg = JSON.parse(raw);
    const configPort = cfg?.gateway?.port;
    if (typeof configPort === "number" && Number.isFinite(configPort) && configPort > 0) {
      return configPort;
    }
  } catch {}
  return DEFAULT_PORT;
}

// ── 健康检查 ──

// Windows 冷启动：Defender 实时扫描 + ASAR 内 ESM/jiti 转译导致模块加载 30-80s。
// 热重启（上一个实例刚退出）场景下 80s 加载 + 5s 初始化 ≈ 85s，90s 超时余量不足。
export const HEALTH_TIMEOUT_MS = process.platform === "win32" ? 180_000 : 90_000;
export const HEALTH_POLL_INTERVAL_MS = 500;

// ── 崩溃冷却 ──

export const CRASH_COOLDOWN_MS = 5_000;

// ── 窗口加载重试 ──

export const WINDOW_LOAD_MAX_RETRIES = 20;
export const WINDOW_LOAD_RETRY_INTERVAL_MS = 1_500;

// ── 窗口尺寸 ──

export const WINDOW_WIDTH = 1200;
export const WINDOW_HEIGHT = 800;
export const WINDOW_MIN_WIDTH = 800;
export const WINDOW_MIN_HEIGHT = 600;

// ── 平台判断 ──

export const IS_WIN = process.platform === "win32";

let cachedPackagedWindowsNodeBin: string | null = null;

// ── 路径解析（自动适配 dev / packaged 两种环境） ──

/** 资源根目录（dev 模式指向 targets/<platform-arch>，打包后 afterPack 已拍平） */
export function resolveResourcesPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  const target = process.env.ONECLAW_TARGET ?? `${process.platform}-${process.arch}`;
  return path.join(app.getAppPath(), "resources", "targets", target);
}

/** dev 模式下的目标产物目录（package:resources 的输出路径） */
function resolveDevTargetPath(): string {
  return path.join(app.getAppPath(), "resources", "targets", `${process.platform}-${process.arch}`);
}

// Windows packaged 模式下优先使用 Helper.exe，避免把主 GUI exe 直接暴露给所有子进程。
function resolvePackagedWindowsHelperPath(): string {
  const exeDir = path.dirname(process.execPath);
  const ext = path.extname(process.execPath) || ".exe";
  const base = path.basename(process.execPath, ext);
  return path.join(exeDir, `${base} Helper${ext}`);
}

// 惰性创建 Windows Helper hard link；失败时安全回退主 exe，不阻断启动。
function resolvePackagedWindowsNodeBin(): string {
  if (cachedPackagedWindowsNodeBin) return cachedPackagedWindowsNodeBin;

  const helperPath = resolvePackagedWindowsHelperPath();
  if (fs.existsSync(helperPath)) {
    cachedPackagedWindowsNodeBin = helperPath;
    return helperPath;
  }

  try {
    fs.linkSync(process.execPath, helperPath);
    cachedPackagedWindowsNodeBin = helperPath;
    return helperPath;
  } catch {
    cachedPackagedWindowsNodeBin = process.execPath;
    return process.execPath;
  }
}

// macOS：使用 Helper binary（Info.plist 含 LSUIElement=true，不产生 Dock 弹跳图标）。
function resolveDarwinHelperNodeBin(): string | null {
  const contentsDir = path.resolve(path.dirname(process.execPath), "..");
  const exeName = path.basename(process.execPath);
  const helperName = `${exeName} Helper`;
  const helperPath = path.join(
    contentsDir, "Frameworks", `${helperName}.app`, "Contents", "MacOS", helperName,
  );
  return fs.existsSync(helperPath) ? helperPath : null;
}

/**
 * Node.js 二进制：dev 和 packaged 都走 Electron binary + ELECTRON_RUN_AS_NODE=1。
 * 原因：package-resources.js 按 Electron ABI 编译带 binding.gyp 的 native addon
 * （如 kimi-claw 依赖的 fs-ext），dev 下若改用 runtime/node（ABI 不同）会触发
 * "was compiled against a different Node.js version using NODE_MODULE_VERSION" 加载失败。
 * 让 dev 与 packaged 共用 Electron 的 Node ABI，保证带 native addon 的插件可加载、
 * 同时让 dev 更贴近生产运行环境。
 * macOS dev/packaged 均优先走 Helper.app，避免子进程在 Dock 中弹跳。
 */
export function resolveNodeBin(): string {
  if (process.platform === "darwin") {
    const helperPath = resolveDarwinHelperNodeBin();
    if (helperPath) return helperPath;
  }
  if (!app.isPackaged) {
    return process.execPath;
  }
  if (!IS_WIN) return process.execPath;
  return resolvePackagedWindowsNodeBin();
}

/**
 * CLI 专用 Node.js 二进制：始终返回真实 Node.js（SUBSYSTEM:CONSOLE），
 * 保证交互式 TTY（@clack/prompts 的 raw mode）在 Windows 上正常工作。
 * Gateway 子进程不需要 TTY，继续用 resolveNodeBin()（Electron binary）即可。
 */
export function resolveCliNodeBin(): string {
  const exe = IS_WIN ? "node.exe" : "node";
  const bundled = path.join(resolveResourcesPath(), "runtime", exe);
  if (fs.existsSync(bundled)) return bundled;
  // dev 模式或打包异常时回退
  return resolveNodeBin();
}

/**
 * Windows CLI 专用二进制（SUBSYSTEM:CONSOLE，NSIS 安装时由 PE 补丁生成）。
 * 与主 exe 同目录，文件名为 "<ProductName>-CLI.exe"。
 * 非 Windows 或 dev 模式返回 null。
 */
export function resolveCliExe(): string | null {
  if (!IS_WIN || !app.isPackaged) return null;
  const exeDir = path.dirname(process.execPath);
  const ext = path.extname(process.execPath) || ".exe";
  const base = path.basename(process.execPath, ext);
  const cliExe = path.join(exeDir, `${base}-CLI${ext}`);
  return fs.existsSync(cliExe) ? cliExe : null;
}

/** 判断当前是否为 ASAR 打包模式（gateway.asar 存在） */
export function isAsarMode(): boolean {
  const entry = resolveGatewayEntry();
  return entry.includes(".asar");
}

/**
 * 让 Electron binary 当作纯 Node.js 运行的环境变量。
 * dev 和 packaged 都需要（配合 resolveNodeBin() 始终返回 Electron binary）。
 */
export function resolveNodeExtraEnv(): Record<string, string> {
  return { ELECTRON_RUN_AS_NODE: "1" };
}

/** npm CLI（dev 模式优先用 package:resources 下载的，无则降级系统 npm） */
export function resolveNpmBin(): string {
  if (!app.isPackaged) {
    const exe = IS_WIN ? "npm.cmd" : "npm";
    const bundled = path.join(resolveDevTargetPath(), "runtime", exe);
    return fs.existsSync(bundled) ? bundled : "npm";
  }
  return path.join(resolveResourcesPath(), "runtime", IS_WIN ? "npm.cmd" : "npm");
}

// ── Gateway 路径（自动适配 asar / 散文件两种打包模式） ──

/**
 * Gateway 根目录：优先检测 gateway.asar，回退 gateway/ 散文件（dev 兼容）。
 * 返回值可用于拼接 JS 文件路径（ASAR patch 透明可读），
 * 但不可用作 spawn 的 cwd（OS 不认识 asar 虚拟路径）。
 */
function resolveGatewayRoot(): string {
  const res = resolveResourcesPath();
  // dev 模式用真实 Node.js，无法读取 asar 虚拟路径，直接走散文件
  if (!app.isPackaged) {
    return path.join(res, "gateway");
  }
  const asarPath = path.join(res, "gateway.asar");
  if (path.extname(asarPath) === ".asar" && fs.existsSync(asarPath)) {
    return asarPath;
  }
  return path.join(res, "gateway");
}

/** Gateway 入口（优先 openclaw.mjs，旧包回退 gateway-entry.mjs） */
export function resolveGatewayEntry(): string {
  const root = resolveGatewayRoot();
  const entry = path.join(root, "node_modules", "openclaw", "openclaw.mjs");
  if (fs.existsSync(entry)) return entry;
  return path.join(root, "gateway-entry.mjs");
}

/**
 * Gateway 子进程的 cwd。
 * asar 模式下不能指向 asar 内路径（OS chdir 不认识 asar），
 * 返回 ~/.openclaw/；dev 模式保持散文件目录。
 */
export function resolveGatewayCwd(): string {
  const root = resolveGatewayRoot();
  if (root.endsWith(".asar")) {
    return resolveUserStateDir();
  }
  return path.join(root, "node_modules", "openclaw");
}

/**
 * Gateway 内 openclaw 包路径（main process 的 fs 读取专用）。
 * 插件检测、版本读取等在 main process 中运行，ASAR patch 保证透明可读。
 * 与 resolveGatewayCwd() 不同，此函数始终指向包内路径。
 */
export function resolveGatewayPackageDir(): string {
  return path.join(resolveGatewayRoot(), "node_modules", "openclaw");
}

/** clawhub CLI bin 入口（与 openclaw 同一 node_modules） */
export function resolveClawhubEntry(): string {
  return path.join(resolveGatewayRoot(), "node_modules", "clawhub", "bin", "clawdhub.js");
}

/** 用户 bin 目录（~/.openclaw/bin/，存放 CLI wrapper 脚本） */
export function resolveUserBinDir(): string {
  return path.join(resolveUserStateDir(), "bin");
}

/** 用户状态目录（~/.openclaw/） */
export function resolveUserStateDir(): string {
  if (process.env.OPENCLAW_STATE_DIR) return process.env.OPENCLAW_STATE_DIR;
  const home = IS_WIN ? process.env.USERPROFILE : process.env.HOME;
  return path.join(home ?? "", ".openclaw");
}

/** 用户配置文件（JSON5 格式） */
export function resolveUserConfigPath(): string {
  return path.join(resolveUserStateDir(), "openclaw.json");
}

/** 用户配置备份目录 */
export function resolveConfigBackupDir(): string {
  return path.join(resolveUserStateDir(), "config-backups");
}

/** 最近一次可启动配置快照 */
export function resolveLastKnownGoodConfigPath(): string {
  return path.join(resolveUserStateDir(), "openclaw.last-known-good.json");
}

/** Gateway 诊断日志（固定写入 ~/.openclaw/gateway.log） */
export function resolveGatewayLogPath(): string {
  return path.join(resolveUserStateDir(), "gateway.log");
}

/**
 * 内置 channel plugin 的镜像源目录（resources/<target>/extensions-mirror/<id>/）。
 * package-resources 把 4 个第三方 channel plugin 写入这里，afterPack 注入到
 * app bundle 内。主进程启动时从这里 reconcile 到 ~/.openclaw/extensions/，由
 * openclaw 的 external-plugin scan 路径加载。
 */
export function resolveExtensionsMirrorDir(): string {
  return path.join(resolveResourcesPath(), "extensions-mirror");
}

/**
 * 用户 external plugin 目录（~/.openclaw/extensions/）。
 * openclaw host 会扫描这里加载 external plugin，无需 bundled-channel-entry shim。
 */
export function resolveUserExtensionsDir(): string {
  return path.join(resolveUserStateDir(), "extensions");
}

// ── Chat UI 路径 ──

/** Chat UI 的 index.html（dev 模式在 chat-ui/dist/，打包后在 app 资源中） */
export function resolveChatUiPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app.asar", "chat-ui", "dist", "index.html");
  }
  return path.join(app.getAppPath(), "chat-ui", "dist", "index.html");
}

// ── Setup 完成判断 ──

// 多实例模式下读取 git 分支名，拼入窗口标题以区分不同 worktree 实例
export function resolveDevBranchTag(): string {
  if (!process.env.ONECLAW_MULTI_INSTANCE) return "";
  try {
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: app.getAppPath(),
      timeout: 3000,
      encoding: "utf-8",
    }).trim();
    return branch ? ` [${branch}]` : "";
  } catch {
    return "";
  }
}

/** 检查 Setup 是否已完成（优先读 oneclaw.config.json，兼容旧版） */
export function isSetupComplete(): boolean {
  // 新逻辑：oneclaw.config.json 的 setupCompletedAt
  const oneclawConfig = readOneclawConfig();
  if (oneclawConfig?.setupCompletedAt) return true;

  // 兼容：老 OneClaw 用户可能还没迁移
  const configPath = resolveUserConfigPath();
  if (!fs.existsSync(configPath)) return false;
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(raw);
    return isSetupCompleteFromConfig(config);
  } catch {
    return false;
  }
}
