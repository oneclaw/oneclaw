const KEY = "openclaw.control.settings.v1";

import type { ThemeMode } from "./theme.ts";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  oneclawView: "chat" | "setup" | "settings" | "skills" | "workspace" | "cron" | "feedback";
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
};

type LocationLike = Pick<Location, "host" | "protocol" | "search" | "hash">;

// URL 注入只接受主进程可控的 file:// 启动参数，避免网页场景篡改本地视图状态。
function resolveInjectedOneclawView(locationLike: LocationLike): UiSettings["oneclawView"] | null {
  if (locationLike.protocol !== "file:") {
    return null;
  }
  const params = new URLSearchParams(locationLike.search);
  const hashParams = new URLSearchParams(
    locationLike.hash.startsWith("#") ? locationLike.hash.slice(1) : locationLike.hash,
  );
  const view = (hashParams.get("view") ?? params.get("view"))?.trim();
  switch (view) {
    case "chat":
    case "setup":
    case "settings":
    case "skills":
    case "workspace":
    case "cron":
    case "feedback":
      return view;
    default:
      return null;
  }
}

// file:// 入口由 Electron 主进程控制，query/hash 里的 gatewayUrl 属于受信启动参数。
function resolveInjectedGatewayUrl(locationLike: LocationLike): string | null {
  if (locationLike.protocol !== "file:") {
    return null;
  }
  const params = new URLSearchParams(locationLike.search);
  const hashParams = new URLSearchParams(
    locationLike.hash.startsWith("#") ? locationLike.hash.slice(1) : locationLike.hash,
  );
  const raw = params.get("gatewayUrl") ?? hashParams.get("gatewayUrl");
  const gatewayUrl = raw?.trim();
  return gatewayUrl || null;
}

// 默认网关地址仍按当前页面来源推断，只有桌面启动参数会显式覆盖它。
function resolveDefaultGatewayUrl(locationLike: LocationLike): string {
  // file:// protocol (Electron loadFile) → location.host is empty.
  // Fall back to the default gateway loopback address.
  if (!locationLike.host) {
    return "ws://127.0.0.1:18789";
  }
  const proto = locationLike.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${locationLike.host}`;
}

// 启动配置解析应是纯函数，避免 localStorage 和 URL 注入逻辑彼此打架。
export function parseUiSettings(raw: string | null, locationLike: LocationLike): UiSettings {
  const injectedGatewayUrl = resolveInjectedGatewayUrl(locationLike);
  const injectedView = resolveInjectedOneclawView(locationLike);
  const defaultUrl = injectedGatewayUrl ?? resolveDefaultGatewayUrl(locationLike);

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    oneclawView: injectedView ?? "chat",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
  };

  try {
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        injectedGatewayUrl ||
        (typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : defaults.gatewayUrl),
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      oneclawView: defaults.oneclawView,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
    };
  } catch {
    return defaults;
  }
}

// 运行时入口只负责读浏览器全局，再交给纯解析逻辑处理。
export function loadSettings(): UiSettings {
  return parseUiSettings(localStorage.getItem(KEY), location);
}

export function saveSettings(next: UiSettings) {
  // Setup 视图不持久化到 localStorage，防止重启后 localStorage 重放进入 Setup
  // 初始视图始终由主进程 URL fragment 或 app:navigate IPC 决定
  const toSave = next.oneclawView === "setup"
    ? { ...next, oneclawView: "chat" as const }
    : next;
  localStorage.setItem(KEY, JSON.stringify(toSave));
}
