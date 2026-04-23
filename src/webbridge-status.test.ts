import test from "node:test";
import assert from "node:assert/strict";
import {
  getWebbridgeInstallState,
  type GetStateDeps,
} from "./webbridge-status";
import type { BrowserState } from "./browser-extension-installer";

const FAKE_EXT_ID = "abcdef0123456789abcdef0123456789";

function makeDeps(overrides: Partial<GetStateDeps> = {}): GetStateDeps {
  return {
    binaryPath: "/fake/bin/kimi-webbridge",
    dataDir: "/fake/.kimi-webbridge",
    fileExists: () => true,
    readManifest: () => ({
      version: "1.2.3",
      etag: "W/abc",
      lastModified: null,
      contentLength: 1024,
    }),
    readExtensionStates: async () => [],
    extensionId: FAKE_EXT_ID,
    ...overrides,
  };
}

test("getWebbridgeInstallState binary 不存在 → installed=false, version=null", async () => {
  const state = await getWebbridgeInstallState(
    makeDeps({ fileExists: () => false }),
  );
  assert.equal(state.installed, false);
  assert.equal(state.version, null);
  assert.equal(state.binaryPath, "/fake/bin/kimi-webbridge");
});

test("getWebbridgeInstallState binary 存在 + manifest 可读 → installed=true + version", async () => {
  const state = await getWebbridgeInstallState(makeDeps());
  assert.equal(state.installed, true);
  assert.equal(state.version, "1.2.3");
  assert.equal(state.etag, "W/abc");
});

test("getWebbridgeInstallState binary 存在 + manifest=null → installed=true, version=null", async () => {
  const state = await getWebbridgeInstallState(
    makeDeps({ readManifest: () => null }),
  );
  assert.equal(state.installed, true);
  assert.equal(state.version, null);
  assert.equal(state.etag, null);
});

test("getWebbridgeInstallState 透传 extensionStates + extensionId", async () => {
  const fakeStates: BrowserState[] = [
    {
      browserId: "chrome",
      browserName: "Google Chrome",
      installed: true,
      configured: true,
    },
    {
      browserId: "edge",
      browserName: "Microsoft Edge",
      installed: false,
      configured: false,
    },
  ];
  const state = await getWebbridgeInstallState(
    makeDeps({ readExtensionStates: async () => fakeStates }),
  );
  assert.deepEqual(state.browsers, fakeStates);
  assert.equal(state.extensionId, FAKE_EXT_ID);
});

test("getWebbridgeInstallState extensionId 空 → readExtensionStates 仍调", async () => {
  let readerCalled = false;
  const state = await getWebbridgeInstallState(
    makeDeps({
      extensionId: "",
      readExtensionStates: async () => {
        readerCalled = true;
        return [];
      },
    }),
  );
  assert.equal(state.extensionId, "");
  assert.equal(readerCalled, true);
  assert.deepEqual(state.browsers, []);
});

test("getWebbridgeInstallState readManifest 抛错 → 不传导：version=null", async () => {
  const state = await getWebbridgeInstallState(
    makeDeps({
      readManifest: () => {
        throw new Error("disk IO");
      },
    }),
  );
  assert.equal(state.installed, true);
  assert.equal(state.version, null);
});

test("getWebbridgeInstallState readExtensionStates 抛错 → 不传导：browsers=[]", async () => {
  const state = await getWebbridgeInstallState(
    makeDeps({
      readExtensionStates: async () => {
        throw new Error("reg query failed");
      },
    }),
  );
  assert.deepEqual(state.browsers, []);
  assert.equal(state.installed, true);
});
