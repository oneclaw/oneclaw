import test from "node:test";
import assert from "node:assert/strict";
import {
  getWebbridgePrecheck,
  KIMI_WEBBRIDGE_SKILL_PATHS,
  type WebbridgePrecheckDeps,
} from "./webbridge-precheck";

function makeDeps(
  over: Partial<WebbridgePrecheckDeps> = {},
): WebbridgePrecheckDeps {
  return {
    binaryPath: "/fake/bin",
    extensionId: "fakeextid",
    fileExists: (_p) => false,
    readExtensionStates: async () => [],
    skillPaths: ["/fake/skills/kimi-webbridge"],
    ...over,
  };
}

// 单一健康浏览器 fixture：浏览器关着，三项全 OK，没在跑
const OK_CHROME = {
  browserId: "chrome",
  browserName: "Chrome",
  installed: true,
  configured: true,
  blocklisted: false,
  presentInChrome: true,
  running: false,
} as const;

test("全 OK → ok=true，三项都 false", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.missing.binary, false);
  assert.equal(r.missing.skill, false);
  assert.equal(r.missing.extension, false);
});

test("binary 缺 → ok=false + missing.binary=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) => p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
    }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.missing.binary, true);
});

test("skill 4 路径全无 → missing.skill=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      skillPaths: ["/a", "/b", "/c", "/d"],
      fileExists: (p) => p === "/fake/bin",
      readExtensionStates: async () => [OK_CHROME],
    }),
  );
  assert.equal(r.missing.skill, true);
  assert.equal(r.ok, false);
});

test("skill 4 路径任一存在 → missing.skill=false", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      skillPaths: ["/a", "/b", "/c", "/d"],
      fileExists: (p) => p === "/fake/bin" || p === "/c",
      readExtensionStates: async () => [OK_CHROME],
    }),
  );
  assert.equal(r.missing.skill, false);
});

test("无任何 detected browser configured → missing.extension=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [
        { ...OK_CHROME, configured: false },
      ],
    }),
  );
  assert.equal(r.missing.extension, true);
});

test("有 configured 但 blocklisted → 不算数（missing.extension=true）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [
        { ...OK_CHROME, blocklisted: true },
      ],
    }),
  );
  assert.equal(r.missing.extension, true);
});

test("Chrome 关着 + configured + !blocklisted + presentInChrome=false（刚 repair 完未启动）→ ok", async () => {
  // Chrome 没跑时 Secure Preferences 可能是 stale 的（OneClaw 刚写完 JSON Chrome 还没读），
  // 不能拿 presentInChrome 当真——回退到 configured && !blocklisted。
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [
        { ...OK_CHROME, running: false, presentInChrome: false },
      ],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.missing.extension, false);
});

test("Chrome 在跑 + configured + !blocklisted + presentInChrome=false（用户从 UI 卸过）→ missing.extension=true", async () => {
  // 混合策略关键场景：Chrome 在跑时 Secure Preferences 是 Chrome 主动维护的，反映真实加载状态。
  // 这时 presentInChrome=false 一定意味着扩展确实没在 → 必须报缺。
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [
        { ...OK_CHROME, running: true, presentInChrome: false },
      ],
    }),
  );
  assert.equal(r.missing.extension, true, "Chrome 在跑且真实列表里没 → 必须报缺");
  assert.equal(r.ok, false);
});

test("Chrome 在跑 + configured + !blocklisted + presentInChrome=true → ok", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [
        { ...OK_CHROME, running: true, presentInChrome: true },
      ],
    }),
  );
  assert.equal(r.ok, true);
});

test("extensionId 为空（dev build）→ missing.extension=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      extensionId: "",
      fileExists: () => true,
      readExtensionStates: async () => [],
    }),
  );
  assert.equal(r.missing.extension, true);
});

test("readExtensionStates 抛错 → missing.extension=true（best-effort）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => {
        throw new Error("fs error");
      },
    }),
  );
  assert.equal(r.missing.extension, true);
});

test("默认 KIMI_WEBBRIDGE_SKILL_PATHS 只检查 OpenClaw runtime（~/.agents/skills/kimi-webbridge）", () => {
  assert.equal(KIMI_WEBBRIDGE_SKILL_PATHS.length, 1);
  assert.ok(
    KIMI_WEBBRIDGE_SKILL_PATHS[0].endsWith(".agents/skills/kimi-webbridge"),
    "OneClaw 走 OpenClaw runtime，其它 AI runtime 路径不在 precheck 范围",
  );
});
