import test from "node:test";
import assert from "node:assert/strict";
import {
  installWebbridgeSkill,
  type ExecFileAsync,
} from "./webbridge-skill-installer";

test("成功：stdout 含 runtime 列表 → success=true, args=install-skill -y", async () => {
  const calls: { cmd: string; args: string[] }[] = [];
  const execFake: ExecFileAsync = async (cmd, args) => {
    calls.push({ cmd, args });
    return {
      stdout: "✓ Claude Code → /x\n✓ Codex → /y\n✓ OpenClaw → /z\n",
      stderr: "",
    };
  };
  const r = await installWebbridgeSkill("/bin/kimi-webbridge", {
    execFileAsync: execFake,
  });
  assert.equal(r.success, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, "/bin/kimi-webbridge");
  assert.deepEqual(calls[0].args, ["install-skill", "-y"]);
  assert.ok(r.output.includes("Claude Code"));
});

test("失败：exec 抛错 → success=false + error 有 message", async () => {
  const execFake: ExecFileAsync = async () => {
    throw new Error("ENOENT binary");
  };
  const r = await installWebbridgeSkill("/bin/kimi-webbridge", {
    execFileAsync: execFake,
  });
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /ENOENT binary/);
});

test("超时：error 含 'timeout' 或 'etimedout'", async () => {
  const execFake: ExecFileAsync = async () => {
    const err: any = new Error("etimedout");
    err.code = "ETIMEDOUT";
    throw err;
  };
  const r = await installWebbridgeSkill("/bin/kimi-webbridge", {
    execFileAsync: execFake,
  });
  assert.equal(r.success, false);
  const lower = (r.error ?? "").toLowerCase();
  assert.ok(
    lower.includes("timeout") || lower.includes("etimedout"),
    `expected timeout hint in ${r.error}`,
  );
});

test("stderr 不为空时 output 也包含 stderr", async () => {
  const execFake: ExecFileAsync = async () => ({
    stdout: "✓ ok",
    stderr: "warning: partial",
  });
  const r = await installWebbridgeSkill("/bin/kimi-webbridge", {
    execFileAsync: execFake,
  });
  assert.equal(r.success, true);
  assert.ok(r.output.includes("✓ ok"));
  assert.ok(r.output.includes("warning: partial"));
});

test("默认 execFileAsync：真实 binary 不存在 → success=false", async () => {
  const r = await installWebbridgeSkill("/nonexistent/kimi-webbridge");
  assert.equal(r.success, false);
});
