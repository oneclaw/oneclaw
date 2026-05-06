import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BROWSER_TARGETS, isBrowserInstalled } from "./browser-detector";
import {
  installExtension,
  uninstallExtension,
  isExtensionConfigured,
  getExtensionStates,
  type ExtensionSpec,
  type InstallResult,
} from "./browser-extension-installer";

const FAKE_EXT_ID = "aaaabbbbccccddddeeeeffffgggghhhh";
const FAKE_CRX_PATH = "/opt/oneclaw/resources/webbridge/kimi-webbridge.crx";
const FAKE_CRX_VERSION = "1.8.4";

const SPEC: ExtensionSpec = {
  extId: FAKE_EXT_ID,
  crxPath: FAKE_CRX_PATH,
  crxVersion: FAKE_CRX_VERSION,
};

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bei-test-home-"));
}

function setupFakeHome(home: string): () => void {
  const oh = process.env.HOME;
  const ou = process.env.USERPROFILE;
  const oa = process.env.ONECLAW_BROWSER_APPS_DIRS;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  // 把 macOS app 搜索路径限制到 fake HOME 下的空目录，避免宿主机 /Applications 污染测试
  process.env.ONECLAW_BROWSER_APPS_DIRS = path.join(home, "Applications-fake");
  return () => {
    process.env.HOME = oh;
    process.env.USERPROFILE = ou;
    if (oa === undefined) delete process.env.ONECLAW_BROWSER_APPS_DIRS;
    else process.env.ONECLAW_BROWSER_APPS_DIRS = oa;
  };
}

// 让测试构造的"浏览器装了"状态被 isBrowserInstalled 识别。
// OneClaw 写 External Extensions JSON 不会创建 Local State，
// 所以测试要显式 touch 这个文件来代表"用户启动过 Chrome"。
function markBrowserInstalled(home: string, userDataRel: string): void {
  const userDataDir = path.join(home, userDataRel);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, "Local State"), "{}", "utf-8");
}

test(
  "[macOS] installExtension 写 External Extensions/<id>.json，含 external_crx + external_version",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const userDataDir = path.join(home, chrome.userDataDirMac);
      markBrowserInstalled(home, chrome.userDataDirMac);
      const result = await installExtension(chrome, SPEC);
      assert.equal(result, "installed");
      const jsonPath = path.join(
        userDataDir,
        "External Extensions",
        `${FAKE_EXT_ID}.json`,
      );
      assert.ok(fs.existsSync(jsonPath));
      const body = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      assert.equal(body.external_crx, FAKE_CRX_PATH);
      assert.equal(body.external_version, FAKE_CRX_VERSION);
      assert.equal(body.external_update_url, undefined);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] installExtension 幂等：第二次调用返 skipped",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      await installExtension(chrome, SPEC);
      const result = await installExtension(chrome, SPEC);
      assert.equal(result, "skipped");
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] installExtension 内容过期（旧 external_update_url）→ 返 updated 并迁移到新格式",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      const extDir = path.join(
        home,
        chrome.userDataDirMac,
        "External Extensions",
      );
      fs.mkdirSync(extDir, { recursive: true });
      const jsonPath = path.join(extDir, `${FAKE_EXT_ID}.json`);
      fs.writeFileSync(
        jsonPath,
        '{"external_update_url":"https://clients2.google.com/service/update2/crx"}',
      );
      const result = await installExtension(chrome, SPEC);
      assert.equal(result, "updated");
      const body = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      assert.equal(body.external_crx, FAKE_CRX_PATH);
      assert.equal(body.external_version, FAKE_CRX_VERSION);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] installExtension version 漂移 → 返 updated 并改写 external_version",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      const extDir = path.join(
        home,
        chrome.userDataDirMac,
        "External Extensions",
      );
      fs.mkdirSync(extDir, { recursive: true });
      const jsonPath = path.join(extDir, `${FAKE_EXT_ID}.json`);
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({
          external_crx: FAKE_CRX_PATH,
          external_version: "1.0.0",
        }),
      );
      const result = await installExtension(chrome, SPEC);
      assert.equal(result, "updated");
      const body = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      assert.equal(body.external_version, FAKE_CRX_VERSION);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionConfigured 未写 / 已写 / 路径错 / 版本错",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const userDataDir = path.join(home, chrome.userDataDirMac);
      markBrowserInstalled(home, chrome.userDataDirMac);

      assert.equal(await isExtensionConfigured(chrome, SPEC), false);

      await installExtension(chrome, SPEC);
      assert.equal(await isExtensionConfigured(chrome, SPEC), true);

      const jsonPath = path.join(
        userDataDir,
        "External Extensions",
        `${FAKE_EXT_ID}.json`,
      );
      // 路径错
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({
          external_crx: "/wrong/path.crx",
          external_version: FAKE_CRX_VERSION,
        }),
      );
      assert.equal(await isExtensionConfigured(chrome, SPEC), false);

      // 版本错
      fs.writeFileSync(
        jsonPath,
        JSON.stringify({
          external_crx: FAKE_CRX_PATH,
          external_version: "9.9.9",
        }),
      );
      assert.equal(await isExtensionConfigured(chrome, SPEC), false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] uninstallExtension 删 <id>.json",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      await installExtension(chrome, SPEC);
      const result = await uninstallExtension(chrome, FAKE_EXT_ID);
      assert.equal(result, "removed");
      assert.equal(await isExtensionConfigured(chrome, SPEC), false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] uninstallExtension 未装时返 not-installed",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      const result = await uninstallExtension(chrome, FAKE_EXT_ID);
      assert.equal(result, "not-installed");
    } finally {
      restore();
    }
  },
);

test("installExtension 浏览器未装 → browser-not-installed", async () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
    const result = await installExtension(chrome, SPEC);
    assert.equal(result, "browser-not-installed");
  } finally {
    restore();
  }
});

import type { RegExecutor } from "./browser-extension-installer";

interface MockRegState {
  storage: Map<string, string>;
  calls: Array<{ args: readonly string[] }>;
}

function makeMockRegExec(state: MockRegState): RegExecutor {
  return async (args) => {
    state.calls.push({ args: [...args] });
    const op = args[0];
    if (op === "query") {
      const keyPath = args[1] ?? "";
      const valName = args[3] ?? "";
      const stored = state.storage.get(`${keyPath}\\${valName}`);
      if (stored === undefined) {
        return { stdout: "", stderr: "ERROR: reg query failed\n", code: 1 };
      }
      return {
        stdout: `    ${valName}    REG_SZ    ${stored}\n`,
        stderr: "",
        code: 0,
      };
    }
    if (op === "add") {
      const keyPath = args[1] ?? "";
      const valName = args[3] ?? "";
      const data = args[7] ?? "";
      state.storage.set(`${keyPath}\\${valName}`, data);
      return { stdout: "", stderr: "", code: 0 };
    }
    if (op === "delete") {
      const keyPath = args[1] ?? "";
      const prefix = `${keyPath}\\`;
      for (const k of [...state.storage.keys()]) {
        if (k.startsWith(prefix)) state.storage.delete(k);
      }
      return { stdout: "", stderr: "", code: 0 };
    }
    return { stdout: "", stderr: `unknown op ${op}`, code: 2 };
  };
}

test("[Win mock] installExtension 写 HKCU\\...\\Extensions\\<id>\\path + version", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  const exec = makeMockRegExec(state);

  const result = await installExtension(chrome, SPEC, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "installed");
  const pathKey = `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`;
  const verKey = `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`;
  assert.equal(state.storage.get(pathKey), FAKE_CRX_PATH);
  assert.equal(state.storage.get(verKey), FAKE_CRX_VERSION);
  // 不能再写 update_url（旧端点被墙），新版本只走 path/version
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`),
    undefined,
  );
});

test("[Win mock] installExtension 幂等：已存在正确值 → skipped", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`,
    FAKE_CRX_PATH,
  );
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`,
    FAKE_CRX_VERSION,
  );
  const exec = makeMockRegExec(state);
  const result = await installExtension(chrome, SPEC, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "skipped");
  assert.ok(!state.calls.some((c) => c.args[0] === "add"));
});

test("[Win mock] installExtension 旧值不同 → updated（清掉旧 update_url 残留）", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  // 模拟旧版本残留：只有 update_url
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`,
    "https://clients2.google.com/service/update2/crx",
  );
  const exec = makeMockRegExec(state);
  const result = await installExtension(chrome, SPEC, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "updated");
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`),
    FAKE_CRX_PATH,
  );
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`),
    FAKE_CRX_VERSION,
  );
  // 旧的 update_url 应被清掉（否则 Chrome 会同时看到 update_url + path 两套 source）
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`),
    undefined,
  );
});

test("[Win mock] isExtensionConfigured 查不到 → false", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  const exec = makeMockRegExec(state);
  const ok = await isExtensionConfigured(chrome, SPEC, {
    exec,
    platform: "win32",
  });
  assert.equal(ok, false);
});

test("[Win mock] isExtensionConfigured 路径+版本都对 → true", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`,
    FAKE_CRX_PATH,
  );
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`,
    FAKE_CRX_VERSION,
  );
  const exec = makeMockRegExec(state);
  const ok = await isExtensionConfigured(chrome, SPEC, {
    exec,
    platform: "win32",
  });
  assert.equal(ok, true);
});

test("[Win mock] isExtensionConfigured 版本漂移 → false", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`,
    FAKE_CRX_PATH,
  );
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`,
    "1.0.0",
  );
  const exec = makeMockRegExec(state);
  const ok = await isExtensionConfigured(chrome, SPEC, {
    exec,
    platform: "win32",
  });
  assert.equal(ok, false);
});

test("[Win mock] uninstallExtension 删 subkey", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`,
    FAKE_CRX_PATH,
  );
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`,
    FAKE_CRX_VERSION,
  );
  const exec = makeMockRegExec(state);
  const result = await uninstallExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "removed");
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\path`),
    undefined,
  );
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\version`),
    undefined,
  );
});

test("[Win mock] uninstallExtension 兼容旧 update_url 残留也能清掉", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`,
    "https://clients2.google.com/service/update2/crx",
  );
  const exec = makeMockRegExec(state);
  const result = await uninstallExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "removed");
});

test("[Win mock] uninstallExtension 本来就没装 → not-installed", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  const exec = makeMockRegExec(state);
  const result = await uninstallExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "not-installed");
});

test("[Win mock] installExtension reg add 失败 → throw 带 stderr", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const failingExec: RegExecutor = async (args) => {
    if (args[0] === "query") {
      return { stdout: "", stderr: "not found\n", code: 1 };
    }
    if (args[0] === "delete") {
      return { stdout: "", stderr: "", code: 0 };
    }
    return { stdout: "", stderr: "ERROR: Access denied\n", code: 5 };
  };
  await assert.rejects(
    installExtension(chrome, SPEC, {
      exec: failingExec,
      platform: "win32",
      skipUserDataCheck: true,
    }),
    /Access denied|reg add/i,
  );
});

import {
  installForAllDetectedBrowsers,
  uninstallForAllDetectedBrowsers,
  getExtensionStates,
  type BrowserInstallSummary,
  type BrowserState,
} from "./browser-extension-installer";

test(
  "[macOS] installForAllDetectedBrowsers 只装已 detected 的",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      const summary: BrowserInstallSummary[] =
        await installForAllDetectedBrowsers(SPEC);
      const chromeRow = summary.find((r) => r.browserId === "chrome");
      const edgeRow = summary.find((r) => r.browserId === "edge");
      assert.equal(chromeRow?.result, "installed");
      assert.equal(edgeRow?.result, "browser-not-installed");
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] getExtensionStates 返所有 BROWSER_TARGETS 的 (installed, configured)",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      await installExtension(chrome, SPEC);
      const states: BrowserState[] = await getExtensionStates(SPEC);
      const chromeState = states.find((s) => s.browserId === "chrome");
      const edgeState = states.find((s) => s.browserId === "edge");
      assert.ok(chromeState?.installed);
      assert.ok(chromeState?.configured);
      assert.equal(edgeState?.installed, false);
      assert.equal(edgeState?.configured, false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] uninstallForAllDetectedBrowsers 清掉已装的",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      await installExtension(chrome, SPEC);
      const summary = await uninstallForAllDetectedBrowsers(FAKE_EXT_ID);
      const chromeRow = summary.find((r) => r.browserId === "chrome");
      assert.equal(chromeRow?.result, "removed");
    } finally {
      restore();
    }
  },
);

test("installForAllDetectedBrowsers 全部未装 → 全部 browser-not-installed", async () => {
  const home = makeTempHome();
  const restore = setupFakeHome(home);
  try {
    const summary = await installForAllDetectedBrowsers(SPEC);
    assert.equal(summary.length, BROWSER_TARGETS.length);
    for (const row of summary) {
      assert.equal(
        row.result,
        "browser-not-installed",
        `${row.browserId}: ${row.result}`,
      );
    }
  } finally {
    restore();
  }
});

test(
  "[ghost] OneClaw 之前写过的 user data dir + External Extensions 残留，但 Local State 不在 → installed=false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      // 模拟 OneClaw 过去给 Edge 写过 ext JSON 后留下的"幽灵目录"：
      //   <userData>/External Extensions/<id>.json 在
      //   但没有 Local State（用户压根没装 Edge）
      const edge = BROWSER_TARGETS.find((t) => t.id === "edge")!;
      const extDir = path.join(home, edge.userDataDirMac, "External Extensions");
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, `${FAKE_EXT_ID}.json`),
        JSON.stringify({ external_crx: FAKE_CRX_PATH, external_version: FAKE_CRX_VERSION }),
      );
      // 不做 markBrowserInstalled — 模拟 Edge 真的没装
      assert.equal(isBrowserInstalled(edge), false, "ghost dir 不算已装");
      const states = await getExtensionStates(SPEC);
      const edgeState = states.find((s) => s.browserId === "edge")!;
      assert.equal(edgeState.installed, false);
    } finally {
    restore();
  }
});

test(
  "[macOS] getExtensionStates: JSON 在 + blocklist 在 → blocklisted=true 不被 configured 短路",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      // 写 External Extensions JSON → configured=true
      const extDir = path.join(home, chrome.userDataDirMac, "External Extensions");
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, `${FAKE_EXT_ID}.json`),
        JSON.stringify({ external_crx: FAKE_CRX_PATH, external_version: FAKE_CRX_VERSION }),
      );
      // 同时把 ID 写进 Preferences 黑名单（模拟用户从 Chrome UI 卸过）
      const profileDir = path.join(home, chrome.userDataDirMac, chrome.profileSubdir);
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(
        path.join(profileDir, "Preferences"),
        JSON.stringify({ extensions: { external_uninstalls: [FAKE_EXT_ID] } }),
      );
      const states = await getExtensionStates(SPEC);
      const chromeState = states.find((s) => s.browserId === "chrome")!;
      assert.equal(chromeState.installed, true);
      assert.equal(chromeState.configured, true, "JSON 在 → configured=true");
      assert.equal(
        chromeState.blocklisted,
        true,
        "blocklist 含 ID → blocklisted=true，不应被 configured=true 短路掉",
      );
    } finally {
      restore();
    }
  },
);

// ===== blocklist 检测 + 清理 =====

import {
  isExtensionBlocklisted,
  cleanExtensionBlocklist,
  type BlocklistCleanResult,
} from "./browser-extension-installer";

function makeChromeWithPrefs(home: string, prefsBody: object): string {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const profileDir = path.join(
    home,
    chrome.userDataDirMac,
    chrome.profileSubdir,
  );
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, "Preferences"),
    JSON.stringify(prefsBody),
    "utf-8",
  );
  return path.join(profileDir, "Preferences");
}

test(
  "[macOS] isExtensionBlocklisted: Preferences 不存在 → false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const result = await isExtensionBlocklisted(chrome, FAKE_EXT_ID);
      assert.equal(result, false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionBlocklisted: external_uninstalls 含 ID → true",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      makeChromeWithPrefs(home, {
        extensions: { external_uninstalls: [FAKE_EXT_ID, "otherid"] },
      });
      const result = await isExtensionBlocklisted(chrome, FAKE_EXT_ID);
      assert.equal(result, true);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionBlocklisted: external_uninstalls 不含 ID → false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      makeChromeWithPrefs(home, {
        extensions: { external_uninstalls: ["unrelated_id"] },
      });
      const result = await isExtensionBlocklisted(chrome, FAKE_EXT_ID);
      assert.equal(result, false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionBlocklisted: Preferences 损坏 JSON → false（best-effort 不误报）",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const profileDir = path.join(
        home,
        chrome.userDataDirMac,
        chrome.profileSubdir,
      );
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(
        path.join(profileDir, "Preferences"),
        "{not valid json",
        "utf-8",
      );
      const result = await isExtensionBlocklisted(chrome, FAKE_EXT_ID);
      assert.equal(result, false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] cleanExtensionBlocklist: 移除 ID 但保留其它字段",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const prefsPath = makeChromeWithPrefs(home, {
        extensions: {
          external_uninstalls: [FAKE_EXT_ID, "keep1", "keep2"],
          some_other_field: { x: 1 },
        },
        unrelated_top: "preserve",
      });
      const result: BlocklistCleanResult = await cleanExtensionBlocklist(
        chrome,
        FAKE_EXT_ID,
      );
      assert.equal(result, "cleaned");
      const after = JSON.parse(fs.readFileSync(prefsPath, "utf-8"));
      assert.deepEqual(after.extensions.external_uninstalls, ["keep1", "keep2"]);
      assert.deepEqual(after.extensions.some_other_field, { x: 1 });
      assert.equal(after.unrelated_top, "preserve");
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] cleanExtensionBlocklist: ID 不在数组 → not-blocklisted",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      makeChromeWithPrefs(home, {
        extensions: { external_uninstalls: ["other"] },
      });
      const result = await cleanExtensionBlocklist(chrome, FAKE_EXT_ID);
      assert.equal(result, "not-blocklisted");
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] cleanExtensionBlocklist: Preferences 不存在 → preferences-missing",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const result = await cleanExtensionBlocklist(chrome, FAKE_EXT_ID);
      assert.equal(result, "preferences-missing");
    } finally {
      restore();
    }
  },
);

// ===== presentInChrome 检测（Secure Preferences 真实扩展列表） =====

import { isExtensionPresentInChrome } from "./browser-extension-installer";

function writeChromeSecurePrefs(home: string, body: object): string {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const profileDir = path.join(
    home,
    chrome.userDataDirMac,
    chrome.profileSubdir,
  );
  fs.mkdirSync(profileDir, { recursive: true });
  const p = path.join(profileDir, "Secure Preferences");
  fs.writeFileSync(p, JSON.stringify(body), "utf-8");
  return p;
}

test(
  "[macOS] isExtensionPresentInChrome: Secure Preferences 不存在 → false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), false);
    } finally {
      restore();
    }
  },
);

// 现代 Chromium：disable_reasons 是空数组 = 启用（多数普通扩展的 schema）
test(
  "[macOS] isExtensionPresentInChrome: disable_reasons=[] → true（启用）",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      writeChromeSecurePrefs(home, {
        extensions: {
          settings: { [FAKE_EXT_ID]: { disable_reasons: [] } },
        },
      });
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), true);
    } finally {
      restore();
    }
  },
);

// External Extensions JSON 注入后用户点「启用」的真实 schema：
// Chrome 写 ack_external=true 但根本不写 disable_reasons 字段
// （来自实测 Chrome M120+ 的 Secure Preferences 转储）
test(
  "[macOS] isExtensionPresentInChrome: disable_reasons 字段缺失 → true（默认启用）",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      writeChromeSecurePrefs(home, {
        extensions: {
          settings: {
            [FAKE_EXT_ID]: { ack_external: true, path: "fldmh.../1.0_0" },
          },
        },
      });
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), true);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionPresentInChrome: extensions.settings 不含 ID → false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      writeChromeSecurePrefs(home, {
        extensions: { settings: { otherid: { disable_reasons: [] } } },
      });
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), false);
    } finally {
      restore();
    }
  },
);

// 用户没点 External install prompt 时 Chrome 写非空 disable_reasons 数组
// （USER_ACTION_PENDING / EXTERNAL_INSTALL_PROMPT 等 reason）
test(
  "[macOS] isExtensionPresentInChrome: disable_reasons=非空数组（弹窗未启用 / 用户主动禁用）→ false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      writeChromeSecurePrefs(home, {
        extensions: {
          settings: { [FAKE_EXT_ID]: { disable_reasons: ["user_action"] } },
        },
      });
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), false);
    } finally {
      restore();
    }
  },
);

// 老版本 Chrome bitmask schema：disable_reasons=number，0=enabled，非 0=disabled
test(
  "[macOS] isExtensionPresentInChrome: disable_reasons=0（老版本 bitmask）→ true",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      writeChromeSecurePrefs(home, {
        extensions: { settings: { [FAKE_EXT_ID]: { disable_reasons: 0 } } },
      });
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), true);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionPresentInChrome: disable_reasons=1024（老版本 bitmask 非 0）→ false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      writeChromeSecurePrefs(home, {
        extensions: { settings: { [FAKE_EXT_ID]: { disable_reasons: 1024 } } },
      });
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionPresentInChrome: Secure Preferences 损坏 JSON → false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const profileDir = path.join(
        home,
        chrome.userDataDirMac,
        chrome.profileSubdir,
      );
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(
        path.join(profileDir, "Secure Preferences"),
        "{not json",
        "utf-8",
      );
      assert.equal(await isExtensionPresentInChrome(chrome, FAKE_EXT_ID), false);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] getExtensionStates 暴露 presentInChrome 字段；JSON 在但 Chrome 真实列表无 → presentInChrome=false",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      // 写 OneClaw 的 External Extensions JSON → configured=true
      const extDir = path.join(home, chrome.userDataDirMac, "External Extensions");
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, `${FAKE_EXT_ID}.json`),
        JSON.stringify({ external_crx: FAKE_CRX_PATH, external_version: FAKE_CRX_VERSION }),
      );
      // 不写 Secure Preferences 的 settings → presentInChrome=false
      const states = await getExtensionStates(SPEC);
      const chromeState = states.find((s) => s.browserId === "chrome")!;
      assert.equal(chromeState.configured, true);
      assert.equal(
        chromeState.presentInChrome,
        false,
        "Chrome Secure Preferences 没记录这个扩展 → presentInChrome 必须 false",
      );
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] getExtensionStates: JSON 在 + Chrome 真实列表也在 → presentInChrome=true",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      markBrowserInstalled(home, chrome.userDataDirMac);
      const extDir = path.join(home, chrome.userDataDirMac, "External Extensions");
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(
        path.join(extDir, `${FAKE_EXT_ID}.json`),
        JSON.stringify({ external_crx: FAKE_CRX_PATH, external_version: FAKE_CRX_VERSION }),
      );
      writeChromeSecurePrefs(home, {
        extensions: { settings: { [FAKE_EXT_ID]: { disable_reasons: [] } } },
      });
      const states = await getExtensionStates(SPEC);
      const chromeState = states.find((s) => s.browserId === "chrome")!;
      assert.equal(chromeState.presentInChrome, true);
    } finally {
      restore();
    }
  },
);
