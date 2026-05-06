import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { BROWSER_TARGETS, type BrowserTarget } from "./browser-detector";

export interface DefaultBrowserResult {
  target: BrowserTarget;
}

export interface DefaultBrowserDeps {
  platform?: NodeJS.Platform;
  runReg?: () => string | null;
  readPlist?: () => any | null;
}

const PROG_ID_TO_TARGET: Record<string, string> = {
  ChromeHTML: "chrome",
  MSEdgeHTM: "edge",
  MSEdgeMHT: "edge",
};

const BUNDLE_ID_TO_TARGET: Record<string, string> = {
  "com.google.chrome": "chrome",
  "com.microsoft.edgemac": "edge",
};

function defaultRunReg(): string | null {
  try {
    const r = spawnSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
        "/v",
        "ProgId",
      ],
      { encoding: "utf-8" },
    );
    if (r.status !== 0) return null;
    const m = (r.stdout || "").match(/ProgId\s+REG_SZ\s+(\S+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

function defaultReadPlist(): any | null {
  try {
    const p = path.join(
      os.homedir(),
      "Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist",
    );
    if (!fs.existsSync(p)) return null;
    const r = spawnSync("plutil", ["-convert", "json", "-o", "-", p], {
      encoding: "utf-8",
    });
    if (r.status !== 0) return null;
    return JSON.parse(r.stdout || "{}");
  } catch {
    return null;
  }
}

export function getDefaultBrowser(
  deps: DefaultBrowserDeps = {},
): DefaultBrowserResult | null {
  const platform = deps.platform ?? process.platform;
  let targetId: string | undefined;

  if (platform === "win32") {
    const runReg = deps.runReg ?? defaultRunReg;
    let progId: string | null;
    try {
      progId = runReg();
    } catch {
      return null;
    }
    if (!progId) return null;
    targetId = PROG_ID_TO_TARGET[progId];
  } else if (platform === "darwin") {
    const readPlist = deps.readPlist ?? defaultReadPlist;
    let plist: any;
    try {
      plist = readPlist();
    } catch {
      return null;
    }
    const handlers = plist?.LSHandlers;
    if (!Array.isArray(handlers)) return null;
    const https = handlers.find((h: any) => h?.LSHandlerURLScheme === "https");
    const bundleId = https?.LSHandlerRoleAll;
    if (typeof bundleId === "string") {
      targetId = BUNDLE_ID_TO_TARGET[bundleId.toLowerCase()];
    }
  }

  if (!targetId) return null;
  const target = BROWSER_TARGETS.find((t) => t.id === targetId);
  return target ? { target } : null;
}
