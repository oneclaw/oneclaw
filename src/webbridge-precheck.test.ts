import test from "node:test";
import assert from "node:assert/strict";
import {
  getWebbridgePrecheck,
  KIMI_WEBBRIDGE_SKILL_PATHS,
  type WebbridgePrecheckDeps,
} from "./webbridge-precheck";

const CHROME_TARGET = { id: "chrome", name: "Google Chrome" };
const EDGE_TARGET = { id: "edge", name: "Microsoft Edge" };

function makeDeps(
  over: Partial<WebbridgePrecheckDeps> = {},
): WebbridgePrecheckDeps {
  return {
    binaryPath: "/fake/bin",
    extensionId: "fakeextid",
    fileExists: (_p) => false,
    readExtensionStates: async () => [],
    getDefaultBrowser: () => ({ target: CHROME_TARGET }),
    skillPaths: ["/fake/skills/kimi-webbridge"],
    ...over,
  };
}

// 单一健康浏览器 fixture：浏览器关着，三项全 OK，没在跑
const OK_CHROME = {
  browserId: "chrome",
  browserName: "Google Chrome",
  installed: true,
  configured: true,
  blocklisted: false,
  presentInChrome: true,
  extensionPendingEnable: false,
  running: false,
} as const;

const OK_EDGE = {
  browserId: "edge",
  browserName: "Microsoft Edge",
  installed: true,
  configured: true,
  blocklisted: false,
  presentInChrome: true,
  extensionPendingEnable: false,
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
  assert.equal(r.defaultBrowser?.id, "chrome");
  assert.equal(r.defaultUnsupported, false);
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

test("webbridge 模式 + skill 文件在但 enabled=false → missing.skill=true（漂移：用户从 chat-ui 关掉了）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => false,
      currentBrowserMode: "webbridge",
    }),
  );
  assert.equal(r.ok, false);
  assert.equal(r.missing.skill, true);
});

test("openclaw 模式 + skill enabled=false → missing.skill=false（当前模式预期值，切换会翻回 true）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => false,
      currentBrowserMode: "openclaw",
    }),
  );
  assert.equal(r.missing.skill, false);
});

test("user 模式 + skill enabled=false → missing.skill=false（同 openclaw 处理）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => false,
      currentBrowserMode: "user",
    }),
  );
  assert.equal(r.missing.skill, false);
});

test("openclaw 模式 + 文件缺 → missing.skill=true（文件缺与模式无关）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) => p === "/fake/bin",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => false,
      currentBrowserMode: "openclaw",
    }),
  );
  assert.equal(r.missing.skill, true);
});

test("currentBrowserMode 不注入 → 默认 webbridge 处理（向后兼容旧调用方）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => false,
      // currentBrowserMode 故意不传
    }),
  );
  assert.equal(r.missing.skill, true);
});

test("skill enabled=true → 不影响判定（仍按文件存在性算）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => true,
    }),
  );
  assert.equal(r.missing.skill, false);
});

test("readSkillEnabled 返 undefined（config 没这个字段）→ 视为 enabled，按文件存在性算", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => undefined,
    }),
  );
  assert.equal(r.missing.skill, false);
});

test("readSkillEnabled 不注入（旧调用方）→ 默认 enabled，向后兼容", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) =>
        p === "/fake/bin" || p === "/fake/skills/kimi-webbridge",
      readExtensionStates: async () => [OK_CHROME],
      // readSkillEnabled 故意不传
    }),
  );
  assert.equal(r.missing.skill, false);
});

test("文件缺 + enabled=false → missing.skill=true（任一条件即缺）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: (p) => p === "/fake/bin",
      readExtensionStates: async () => [OK_CHROME],
      readSkillEnabled: () => false,
    }),
  );
  assert.equal(r.missing.skill, true);
});

test("默认浏览器 Chrome，Chrome 上 configured=false → missing.extension=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [{ ...OK_CHROME, configured: false }],
    }),
  );
  assert.equal(r.missing.extension, true);
});

test("默认浏览器 Chrome，Chrome 上 blocklisted → missing.extension=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [{ ...OK_CHROME, blocklisted: true }],
    }),
  );
  assert.equal(r.missing.extension, true);
});

// settings 高级页面 precheck 不再判 presentInChrome —— 用户启用与否归 pill 管。
// 下面几条覆盖不同的 running × presentInChrome 组合，全部应该 ok=true。
test("Chrome 关着 + presentInChrome=false（JSON 写完用户没开过浏览器）→ ok（settings 不报）", async () => {
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

test("Chrome 在跑 + presentInChrome=false（用户没在弹窗点启用）→ ok（settings 不报，pill 才管）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      readExtensionStates: async () => [
        { ...OK_CHROME, running: true, presentInChrome: false },
      ],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.missing.extension, false);
});

test("Chrome 在跑 + presentInChrome=true（已启用）→ ok", async () => {
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

// ── 新增：默认浏览器单一关注语义 ──

test("默认浏览器 null（Firefox/Safari/未设）→ defaultUnsupported=true & missing.extension=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      getDefaultBrowser: () => null,
      readExtensionStates: async () => [OK_CHROME, OK_EDGE],
    }),
  );
  assert.equal(r.defaultUnsupported, true);
  assert.equal(r.missing.extension, true);
  assert.equal(r.defaultBrowser, null);
  assert.equal(r.ok, false);
});

test("默认浏览器 Chrome，Chrome OK + Edge 也 OK → ok=true（只看 Chrome，不管 Edge）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      getDefaultBrowser: () => ({ target: CHROME_TARGET }),
      readExtensionStates: async () => [OK_CHROME, OK_EDGE],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.defaultBrowser?.id, "chrome");
});

test("默认浏览器 Chrome，Chrome blocklisted + Edge OK → missing.extension=true（只看 Chrome）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      getDefaultBrowser: () => ({ target: CHROME_TARGET }),
      readExtensionStates: async () => [
        { ...OK_CHROME, blocklisted: true },
        OK_EDGE,
      ],
    }),
  );
  assert.equal(r.missing.extension, true);
  assert.equal(r.defaultUnsupported, false);
});

test("默认浏览器 Edge，Edge OK + Chrome 不存在 → ok=true", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      getDefaultBrowser: () => ({ target: EDGE_TARGET }),
      readExtensionStates: async () => [OK_EDGE],
    }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.defaultBrowser?.id, "edge");
  assert.equal(r.defaultBrowser?.name, "Microsoft Edge");
});

test("默认浏览器 Edge，Edge missing + Chrome OK → missing.extension=true（不 fallback 到 Chrome）", async () => {
  const r = await getWebbridgePrecheck(
    makeDeps({
      fileExists: () => true,
      getDefaultBrowser: () => ({ target: EDGE_TARGET }),
      readExtensionStates: async () => [
        OK_CHROME,
        { ...OK_EDGE, configured: false },
      ],
    }),
  );
  assert.equal(r.missing.extension, true);
});
