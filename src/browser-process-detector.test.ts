import test from "node:test";
import assert from "node:assert/strict";
import { BROWSER_TARGETS } from "./browser-detector";
import {
  getBrowserRunningState,
  isBrowserProcessRunning,
  killBackgroundProcesses,
  type ProcessExecutor,
} from "./browser-process-detector";

const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
const edge = BROWSER_TARGETS.find((t) => t.id === "edge")!;

// ── isBrowserProcessRunning（向后兼容，内部走 getBrowserRunningState） ──

test("running: pgrep 返 PID 列表 → true", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "12345\n67890\n",
    code: 0,
  });
  const r = await isBrowserProcessRunning(chrome, {
    exec,
    platform: "darwin",
  });
  assert.equal(r, true);
});

test("not running: pgrep 退出码非 0 → false", async () => {
  const exec: ProcessExecutor = async () => ({ stdout: "", code: 1 });
  const r = await isBrowserProcessRunning(chrome, {
    exec,
    platform: "darwin",
  });
  assert.equal(r, false);
});

test("exec 抛错 → false（best-effort：让用户继续清理；磁盘写失败时再 fail-loud）", async () => {
  const exec: ProcessExecutor = async () => {
    throw new Error("ENOENT");
  };
  const r = await isBrowserProcessRunning(chrome, {
    exec,
    platform: "darwin",
  });
  assert.equal(r, false);
});

test("Windows: tasklist 含 chrome.exe → true（isBrowserProcessRunning 用 plain tasklist）", async () => {
  const exec: ProcessExecutor = async (cmd, args) => {
    assert.equal(cmd, "tasklist");
    assert.ok(!args.includes("/v"));
    assert.ok(args.join(" ").includes("chrome.exe"));
    return {
      stdout: '"chrome.exe","12345","Console","1","123,456 K"\n',
      code: 0,
    };
  };
  const r = await isBrowserProcessRunning(chrome, {
    exec,
    platform: "win32",
  });
  assert.equal(r, true);
});

test("Windows: 任何进程存在都算 running（不区分前后台）", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: '"msedge.exe","2345","Services","0","45,000 K"\n',
    code: 0,
  });
  const r = await isBrowserProcessRunning(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(r, true);
});

test("Windows: tasklist 空 (INFO: No tasks) → false", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "INFO: No tasks are running which match the specified criteria.\n",
    code: 0,
  });
  const r = await isBrowserProcessRunning(chrome, {
    exec,
    platform: "win32",
  });
  assert.equal(r, false);
});

// ── getBrowserRunningState：三态（解决 Edge 后台残留误报） ──

test("Mac running → 'foreground'（macOS 没 background-only 概念）", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "12345\n",
    code: 0,
  });
  const s = await getBrowserRunningState(chrome, {
    exec,
    platform: "darwin",
  });
  assert.equal(s, "foreground");
});

test("Mac not running → 'not-running'", async () => {
  const exec: ProcessExecutor = async () => ({ stdout: "", code: 1 });
  const s = await getBrowserRunningState(chrome, {
    exec,
    platform: "darwin",
  });
  assert.equal(s, "not-running");
});

test("Win getBrowserRunningState 调 powershell + Get-Process -Name <stripped>", async () => {
  const calls: { cmd: string; args: string[] }[] = [];
  const exec: ProcessExecutor = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: "background-only\n", code: 0 };
  };
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "background-only");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "powershell");
  assert.ok(calls[0].args.includes("-NoProfile"));
  // 关键：传 'msedge'（去掉 .exe），不是 'msedge.exe'
  assert.ok(calls[0].args.join(" ").includes("'msedge'"));
  assert.ok(calls[0].args.join(" ").includes("MainWindowHandle"));
});

test("Win Edge 用户已关窗口 + 后台扩展残留 → 'background-only'", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "background-only\n",
    code: 0,
  });
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "background-only");
});

test("Win Edge 用户开着窗口 → 'foreground'", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "foreground\n",
    code: 0,
  });
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "foreground");
});

test("Win Edge 完全没进程 → 'not-running'", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "not-running\n",
    code: 0,
  });
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "not-running");
});

test("Win 中文 locale tasklist /v 输出'暂缺'已绕过——powershell 直接给标签字符串，与 locale 无关", async () => {
  // 这条测试本质上验证：我们不再依赖 tasklist /v 的窗口标题字段。
  // PowerShell 输出 'background-only' 就是 'background-only'，不会被中文 Windows 翻译。
  const exec: ProcessExecutor = async () => ({
    stdout: "background-only\n",
    code: 0,
  });
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "background-only");
});

test("Win powershell 输出意外字符串 → 'not-running'（保守兜底）", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "Get-Process : Cannot find a process with the name 'msedge'.\n",
    code: 0,
  });
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "not-running");
});

test("Win powershell 退出码非 0 → 'not-running'", async () => {
  const exec: ProcessExecutor = async () => ({ stdout: "", code: 1 });
  const s = await getBrowserRunningState(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "not-running");
});

test("getBrowserRunningState exec 抛错 → 'not-running'（best-effort）", async () => {
  const exec: ProcessExecutor = async () => {
    throw new Error("boom");
  };
  const s = await getBrowserRunningState(chrome, {
    exec,
    platform: "win32",
  });
  assert.equal(s, "not-running");
});

// ── killBackgroundProcesses：Win taskkill / Mac no-op ──

test("Win killBackgroundProcesses → 调 taskkill /F /T /IM <name>", async () => {
  const calls: { cmd: string; args: string[] }[] = [];
  const exec: ProcessExecutor = async (cmd, args) => {
    calls.push({ cmd, args });
    return { stdout: "SUCCESS", code: 0 };
  };
  const r = await killBackgroundProcesses(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(r.killed, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "taskkill");
  assert.deepEqual(calls[0].args, ["/F", "/T", "/IM", "msedge.exe"]);
});

test("Win killBackgroundProcesses taskkill 失败 → killed=false + error", async () => {
  const exec: ProcessExecutor = async () => ({
    stdout: "ERROR: process not found",
    code: 128,
  });
  const r = await killBackgroundProcesses(edge, {
    exec,
    platform: "win32",
  });
  assert.equal(r.killed, false);
  assert.ok(r.error);
});

test("Mac killBackgroundProcesses → no-op，killed=false", async () => {
  const exec: ProcessExecutor = async () => {
    throw new Error("不该被调");
  };
  const r = await killBackgroundProcesses(edge, {
    exec,
    platform: "darwin",
  });
  assert.equal(r.killed, false);
});
