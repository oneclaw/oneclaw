import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BROWSER_TARGETS } from "./browser-detector";
import {
  EXTERNAL_UPDATE_URL,
  installExtension,
  uninstallExtension,
  isExtensionConfigured,
  type InstallResult,
} from "./browser-extension-installer";

function makeTempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bei-test-home-"));
}

function setupFakeHome(home: string): () => void {
  const oh = process.env.HOME;
  const ou = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  return () => {
    process.env.HOME = oh;
    process.env.USERPROFILE = ou;
  };
}

const FAKE_EXT_ID = "aaaabbbbccccddddeeeeffffgggghhhh";

test("EXTERNAL_UPDATE_URL 是 Chrome 官方更新端点", () => {
  assert.equal(
    EXTERNAL_UPDATE_URL,
    "https://clients2.google.com/service/update2/crx",
  );
});

test(
  "[macOS] installExtension 写 External Extensions/<id>.json",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const userDataDir = path.join(home, chrome.userDataDirMac);
      fs.mkdirSync(userDataDir, { recursive: true });
      const result = await installExtension(chrome, FAKE_EXT_ID);
      assert.equal(result, "installed");
      const jsonPath = path.join(
        userDataDir,
        "External Extensions",
        `${FAKE_EXT_ID}.json`,
      );
      assert.ok(fs.existsSync(jsonPath));
      const body = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      assert.equal(body.external_update_url, EXTERNAL_UPDATE_URL);
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
      fs.mkdirSync(path.join(home, chrome.userDataDirMac), { recursive: true });
      await installExtension(chrome, FAKE_EXT_ID);
      const result = await installExtension(chrome, FAKE_EXT_ID);
      assert.equal(result, "skipped");
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] installExtension 内容过期：返 updated",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const extDir = path.join(
        home,
        chrome.userDataDirMac,
        "External Extensions",
      );
      fs.mkdirSync(extDir, { recursive: true });
      const jsonPath = path.join(extDir, `${FAKE_EXT_ID}.json`);
      fs.writeFileSync(jsonPath, '{"external_update_url":"https://OLD"}');
      const result = await installExtension(chrome, FAKE_EXT_ID);
      assert.equal(result, "updated");
      const body = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      assert.equal(body.external_update_url, EXTERNAL_UPDATE_URL);
    } finally {
      restore();
    }
  },
);

test(
  "[macOS] isExtensionConfigured 未写 / 已写 / 内容错",
  { skip: process.platform === "win32" },
  async () => {
    const home = makeTempHome();
    const restore = setupFakeHome(home);
    try {
      const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
      const userDataDir = path.join(home, chrome.userDataDirMac);
      fs.mkdirSync(userDataDir, { recursive: true });

      assert.equal(await isExtensionConfigured(chrome, FAKE_EXT_ID), false);

      await installExtension(chrome, FAKE_EXT_ID);
      assert.equal(await isExtensionConfigured(chrome, FAKE_EXT_ID), true);

      const jsonPath = path.join(
        userDataDir,
        "External Extensions",
        `${FAKE_EXT_ID}.json`,
      );
      fs.writeFileSync(jsonPath, '{"external_update_url":"https://WRONG"}');
      assert.equal(await isExtensionConfigured(chrome, FAKE_EXT_ID), false);
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
      fs.mkdirSync(path.join(home, chrome.userDataDirMac), { recursive: true });
      await installExtension(chrome, FAKE_EXT_ID);
      const result = await uninstallExtension(chrome, FAKE_EXT_ID);
      assert.equal(result, "removed");
      assert.equal(await isExtensionConfigured(chrome, FAKE_EXT_ID), false);
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
      fs.mkdirSync(path.join(home, chrome.userDataDirMac), { recursive: true });
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
    const result = await installExtension(chrome, FAKE_EXT_ID);
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

test("[Win mock] installExtension 写 HKCU\\...\\Extensions\\<id>\\update_url", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  const exec = makeMockRegExec(state);

  const result = await installExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "installed");
  const expectedKey = `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`;
  assert.equal(state.storage.get(expectedKey), EXTERNAL_UPDATE_URL);
  assert.ok(state.calls.some((c) => c.args[0] === "add"));
});

test("[Win mock] installExtension 幂等：已存在正确值 → skipped", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`,
    EXTERNAL_UPDATE_URL,
  );
  const exec = makeMockRegExec(state);
  const result = await installExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "skipped");
  assert.ok(!state.calls.some((c) => c.args[0] === "add"));
});

test("[Win mock] installExtension 值不同 → updated", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`,
    "https://OLD",
  );
  const exec = makeMockRegExec(state);
  const result = await installExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "updated");
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`),
    EXTERNAL_UPDATE_URL,
  );
});

test("[Win mock] isExtensionConfigured 查不到 → false", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  const exec = makeMockRegExec(state);
  const ok = await isExtensionConfigured(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
  });
  assert.equal(ok, false);
});

test("[Win mock] isExtensionConfigured 值对 → true", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`,
    EXTERNAL_UPDATE_URL,
  );
  const exec = makeMockRegExec(state);
  const ok = await isExtensionConfigured(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
  });
  assert.equal(ok, true);
});

test("[Win mock] uninstallExtension 删 subkey", async () => {
  const chrome = BROWSER_TARGETS.find((t) => t.id === "chrome")!;
  const state: MockRegState = { storage: new Map(), calls: [] };
  state.storage.set(
    `${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`,
    EXTERNAL_UPDATE_URL,
  );
  const exec = makeMockRegExec(state);
  const result = await uninstallExtension(chrome, FAKE_EXT_ID, {
    exec,
    platform: "win32",
    skipUserDataCheck: true,
  });
  assert.equal(result, "removed");
  assert.equal(
    state.storage.get(`${chrome.winRegistryKey}\\${FAKE_EXT_ID}\\update_url`),
    undefined,
  );
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
    return { stdout: "", stderr: "ERROR: Access denied\n", code: 5 };
  };
  await assert.rejects(
    installExtension(chrome, FAKE_EXT_ID, {
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
      fs.mkdirSync(path.join(home, chrome.userDataDirMac), { recursive: true });
      const summary: BrowserInstallSummary[] =
        await installForAllDetectedBrowsers(FAKE_EXT_ID);
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
      fs.mkdirSync(path.join(home, chrome.userDataDirMac), { recursive: true });
      await installExtension(chrome, FAKE_EXT_ID);
      const states: BrowserState[] = await getExtensionStates(FAKE_EXT_ID);
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
      fs.mkdirSync(path.join(home, chrome.userDataDirMac), { recursive: true });
      await installExtension(chrome, FAKE_EXT_ID);
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
    const summary = await installForAllDetectedBrowsers(FAKE_EXT_ID);
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
