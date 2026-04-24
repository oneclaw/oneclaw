import test from "node:test";
import assert from "node:assert/strict";
import { BROWSER_TARGETS } from "./browser-detector";
import {
  isBrowserProcessRunning,
  type ProcessExecutor,
} from "./browser-process-detector";

const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;

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

test("Windows: tasklist 输出含 chrome.exe → true", async () => {
  const exec: ProcessExecutor = async (cmd, args) => {
    assert.equal(cmd, "tasklist");
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
