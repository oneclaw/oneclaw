import type { ChatState } from "./controllers/chat.ts";
import type { UiSettings } from "./storage.ts";

export type SessionTransitionHost = ChatState & {
  chatQueue: unknown[];
  chatAvatarUrl: string | null;
  settings: UiSettings;
  applySettings(next: UiSettings): void;
  resetToolStream(): void;
  resetChatScroll(): void;
  loadAssistantIdentity(): Promise<void>;
};

function syncUrlWithSessionKey(sessionKey: string, replace: boolean) {
  if (typeof window === "undefined") {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("session", sessionKey);
  if (replace) {
    window.history.replaceState({}, "", url.toString());
  } else {
    window.history.pushState({}, "", url.toString());
  }
}

export function applySessionKeyTransition(
  host: SessionTransitionHost,
  next: string,
  syncUrl = false,
): boolean {
  const trimmed = next.trim();
  if (!trimmed || trimmed === host.sessionKey) {
    return false;
  }
  host.sessionKey = trimmed;
  host.chatMessage = "";
  host.chatAttachments = [];
  host.chatStream = null;
  host.chatPendingStreamText = null;
  host.chatStreamFrozenPrefix = "";
  host.chatVisibleMessageCount = 0;
  host.chatStreamStartedAt = null;
  host.chatRunId = null;
  host.chatQueue = [];
  host.chatAvatarUrl = null;
  host.resetToolStream();
  host.resetChatScroll();
  host.applySettings({
    ...host.settings,
    sessionKey: trimmed,
    lastActiveSessionKey: trimmed,
  });
  if (syncUrl) {
    syncUrlWithSessionKey(trimmed, true);
  }
  void host.loadAssistantIdentity();
  if (host.client && host.connected) {
    void import("./controllers/chat.ts").then(({ loadChatHistory }) => loadChatHistory(host as ChatState));
  }
  return true;
}
