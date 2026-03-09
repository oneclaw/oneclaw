import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  readChannelAllowFromStoreEntries,
  writeChannelAllowFromStoreEntries,
} from "./channel-pairing-store";

function createCredentialsDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-pairing-store-"));
}

test("readChannelAllowFromStoreEntries 应读取 default 账号作用域的 allowFrom 文件", () => {
  const credentialsDir = createCredentialsDir();
  fs.writeFileSync(
    path.join(credentialsDir, "wecom-default-allowFrom.json"),
    JSON.stringify({ version: 1, allowFrom: ["XuMingYuan"] }, null, 2),
    "utf-8",
  );

  assert.deepEqual(readChannelAllowFromStoreEntries(credentialsDir, "wecom"), ["XuMingYuan"]);
});

test("readChannelAllowFromStoreEntries 应合并 legacy 与 default allowFrom 文件并去重", () => {
  const credentialsDir = createCredentialsDir();
  fs.writeFileSync(
    path.join(credentialsDir, "wecom-allowFrom.json"),
    JSON.stringify({ version: 1, allowFrom: ["legacy-user", "shared-user"] }, null, 2),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(credentialsDir, "wecom-default-allowFrom.json"),
    JSON.stringify({ version: 1, allowFrom: ["shared-user", "default-user"] }, null, 2),
    "utf-8",
  );

  assert.deepEqual(
    [...readChannelAllowFromStoreEntries(credentialsDir, "wecom")].sort(),
    ["default-user", "legacy-user", "shared-user"],
  );
});

test("writeChannelAllowFromStoreEntries 应优先写回 default 账号作用域文件", () => {
  const credentialsDir = createCredentialsDir();

  writeChannelAllowFromStoreEntries(credentialsDir, "wecom", ["XuMingYuan"]);

  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(credentialsDir, "wecom-default-allowFrom.json"), "utf-8")),
    {
      channel: "wecom",
      allowFrom: ["XuMingYuan"],
    },
  );
});
