import * as fs from "fs";
import * as path from "path";

export interface BrowserTarget {
  id: string;
  name: string;
  userDataDirMac: string;
  userDataDirWin: string;
  winRegistryKey: string;
}

export const BROWSER_TARGETS: readonly BrowserTarget[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    userDataDirMac: "Library/Application Support/Google/Chrome",
    userDataDirWin: "AppData/Local/Google/Chrome/User Data",
    winRegistryKey: "HKCU\\Software\\Google\\Chrome\\Extensions",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    userDataDirMac: "Library/Application Support/Microsoft Edge",
    userDataDirWin: "AppData/Local/Microsoft/Edge/User Data",
    winRegistryKey: "HKCU\\Software\\Microsoft\\Edge\\Extensions",
  },
  {
    id: "brave",
    name: "Brave",
    userDataDirMac: "Library/Application Support/BraveSoftware/Brave-Browser",
    userDataDirWin: "AppData/Local/BraveSoftware/Brave-Browser/User Data",
    winRegistryKey: "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    userDataDirMac: "Library/Application Support/Vivaldi",
    userDataDirWin: "AppData/Local/Vivaldi/User Data",
    winRegistryKey: "HKCU\\Software\\Vivaldi\\Extensions",
  },
  {
    id: "opera",
    name: "Opera",
    userDataDirMac: "Library/Application Support/com.operasoftware.Opera",
    userDataDirWin: "AppData/Roaming/Opera Software/Opera Stable",
    winRegistryKey: "HKCU\\Software\\Opera Software\\Opera Stable\\Extensions",
  },
];

function resolveHome(): string {
  const home =
    process.platform === "win32" ? process.env.USERPROFILE : process.env.HOME;
  return home ?? "";
}

export function resolveUserDataDir(target: BrowserTarget): string {
  const rel =
    process.platform === "win32" ? target.userDataDirWin : target.userDataDirMac;
  return path.join(resolveHome(), rel);
}

export function isBrowserInstalled(target: BrowserTarget): boolean {
  return fs.existsSync(resolveUserDataDir(target));
}

export function listInstalledBrowsers(): BrowserTarget[] {
  return BROWSER_TARGETS.filter((t) => isBrowserInstalled(t));
}
