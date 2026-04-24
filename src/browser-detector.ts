import * as fs from "fs";
import * as path from "path";

export interface BrowserTarget {
  id: string;
  name: string;
  userDataDirMac: string;
  userDataDirWin: string;
  winRegistryKey: string;
  // Preferences 所在子目录（相对 userDataDir）。Chromium 标准是 "Default"；
  // Opera 用户数据布局不同，没 Default 子目录 → 留空字符串
  profileSubdir: string;
  // 进程检测用：可执行文件名（macOS pgrep -f / Windows tasklist /FI）
  processNameMac: string;
  processNameWin: string;
}

export const BROWSER_TARGETS: readonly BrowserTarget[] = [
  {
    id: "chrome",
    name: "Google Chrome",
    userDataDirMac: "Library/Application Support/Google/Chrome",
    userDataDirWin: "AppData/Local/Google/Chrome/User Data",
    winRegistryKey: "HKCU\\Software\\Google\\Chrome\\Extensions",
    profileSubdir: "Default",
    processNameMac: "Google Chrome.app/Contents/MacOS/Google Chrome",
    processNameWin: "chrome.exe",
  },
  {
    id: "edge",
    name: "Microsoft Edge",
    userDataDirMac: "Library/Application Support/Microsoft Edge",
    userDataDirWin: "AppData/Local/Microsoft/Edge/User Data",
    winRegistryKey: "HKCU\\Software\\Microsoft\\Edge\\Extensions",
    profileSubdir: "Default",
    processNameMac: "Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    processNameWin: "msedge.exe",
  },
  {
    id: "brave",
    name: "Brave",
    userDataDirMac: "Library/Application Support/BraveSoftware/Brave-Browser",
    userDataDirWin: "AppData/Local/BraveSoftware/Brave-Browser/User Data",
    winRegistryKey: "HKCU\\Software\\BraveSoftware\\Brave-Browser\\Extensions",
    profileSubdir: "Default",
    processNameMac: "Brave Browser.app/Contents/MacOS/Brave Browser",
    processNameWin: "brave.exe",
  },
  {
    id: "vivaldi",
    name: "Vivaldi",
    userDataDirMac: "Library/Application Support/Vivaldi",
    userDataDirWin: "AppData/Local/Vivaldi/User Data",
    winRegistryKey: "HKCU\\Software\\Vivaldi\\Extensions",
    profileSubdir: "Default",
    processNameMac: "Vivaldi.app/Contents/MacOS/Vivaldi",
    processNameWin: "vivaldi.exe",
  },
  {
    id: "opera",
    name: "Opera",
    userDataDirMac: "Library/Application Support/com.operasoftware.Opera",
    userDataDirWin: "AppData/Roaming/Opera Software/Opera Stable",
    winRegistryKey: "HKCU\\Software\\Opera Software\\Opera Stable\\Extensions",
    profileSubdir: "",
    processNameMac: "Opera.app/Contents/MacOS/Opera",
    processNameWin: "opera.exe",
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
