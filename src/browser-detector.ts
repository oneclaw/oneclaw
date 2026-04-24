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
  // 真"装了"判定用：macOS app bundle 名（"Google Chrome.app"）
  appNameMac: string;
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
    appNameMac: "Google Chrome.app",
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
    appNameMac: "Microsoft Edge.app",
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
    appNameMac: "Brave Browser.app",
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
    appNameMac: "Vivaldi.app",
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
    appNameMac: "Opera.app",
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

// 真"装了"判定。
// macOS：先看 /Applications/<App>.app 或 ~/Applications/<App>.app（覆盖系统装/用户装）；
// 退而求其次：<userDataDir>/Local State 存在（Chromium 启动时创建，OneClaw 不会写）。
// Windows：只用 <userDataDir>/Local State（Chromium 至少启动过一次）。
// 注意：不能用「user data dir 是否存在」判定——OneClaw 写 External Extensions JSON 时
// 会自己创建 user data dir 子目录，造成"幽灵安装"假象。
//
// 测试钩子：env ONECLAW_BROWSER_APPS_DIRS=":分隔" 可覆盖 macOS app 搜索路径
// （绕开宿主机 /Applications 里真实装的浏览器对单元测试的污染）。
function macAppSearchDirs(): string[] {
  const override = process.env.ONECLAW_BROWSER_APPS_DIRS;
  if (override) return override.split(":").filter(Boolean);
  return ["/Applications", path.join(resolveHome(), "Applications")];
}

export function isBrowserInstalled(target: BrowserTarget): boolean {
  if (process.platform === "darwin") {
    for (const dir of macAppSearchDirs()) {
      if (fs.existsSync(path.join(dir, target.appNameMac))) return true;
    }
  }
  return fs.existsSync(path.join(resolveUserDataDir(target), "Local State"));
}

export function listInstalledBrowsers(): BrowserTarget[] {
  return BROWSER_TARGETS.filter((t) => isBrowserInstalled(t));
}
