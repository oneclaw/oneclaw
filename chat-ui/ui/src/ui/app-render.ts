/**
 * OneClaw custom app-render.ts
 * Replaces the upstream 13-tab dashboard with a minimal sidebar + chat layout.
 * Chat view and all chat functionality are preserved from upstream.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChatAvatar } from "./app-chat.ts";
import { renderChatControls, renderThemeToggle } from "./app-render.helpers.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { t } from "./i18n.ts";
import { renderSidebar } from "./sidebar.ts";
import { renderChat } from "./views/chat.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";

declare global {
  interface Window {
    oneclaw?: {
      openSettings?: () => void;
      openWebUI?: () => void;
      openExternal?: (url: string) => unknown;
      getGatewayPort?: () => Promise<number>;
    };
  }
}

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;

function resolveAssistantAvatarUrl(state: AppViewState): string | undefined {
  const list = state.agentsList?.agents ?? [];
  const parsed = parseAgentSessionKey(state.sessionKey);
  const agentId = parsed?.agentId ?? state.agentsList?.defaultId ?? "main";
  const agent = list.find((entry) => entry.id === agentId);
  const identity = agent?.identity;
  const candidate = identity?.avatarUrl ?? identity?.avatar;
  if (!candidate) {
    return undefined;
  }
  if (AVATAR_DATA_RE.test(candidate) || AVATAR_HTTP_RE.test(candidate)) {
    return candidate;
  }
  return identity?.avatarUrl;
}

function handleOpenSettings() {
  if (window.oneclaw?.openSettings) {
    window.oneclaw.openSettings();
  }
}

async function handleOpenWebUI() {
  if (window.oneclaw?.openWebUI) {
    window.oneclaw.openWebUI();
  } else if (window.oneclaw?.openExternal) {
    let port = 18789;
    try {
      if (window.oneclaw.getGatewayPort) {
        port = await window.oneclaw.getGatewayPort();
      }
    } catch { /* use default */ }
    window.oneclaw.openExternal(`http://127.0.0.1:${port}/`);
  }
}

export function renderApp(state: AppViewState) {
  const chatDisabledReason = state.connected ? null : t("error.disconnected");
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;

  const chatFocus = state.settings.chatFocusMode || state.onboarding;

  return html`
    <div class="oneclaw-shell ${chatFocus ? "oneclaw-shell--focus" : ""}">
      ${chatFocus
        ? nothing
        : renderSidebar({
            connected: state.connected,
            onNewChat: () => state.handleSendChat("/new", { restoreDraft: true }),
            onOpenSettings: handleOpenSettings,
            onOpenWebUI: () => void handleOpenWebUI(),
          })}

      <div class="oneclaw-main">
        <header class="oneclaw-topbar">
          <div class="oneclaw-topbar__left">
            <div class="pill">
              <span class="statusDot ${state.connected ? "ok" : ""}"></span>
              <span>${t("status.health")}</span>
              <span class="mono">${state.connected ? t("status.ok") : t("status.offline")}</span>
            </div>
          </div>
          <div class="oneclaw-topbar__right">
            ${renderChatControls(state)}
            ${renderThemeToggle(state)}
          </div>
        </header>

        <main class="oneclaw-content">
          ${renderChat({
            sessionKey: state.sessionKey,
            onSessionKeyChange: (next) => {
              state.sessionKey = next;
              state.chatMessage = "";
              state.chatAttachments = [];
              state.chatStream = null;
              (state as any).chatStreamStartedAt = null;
              state.chatRunId = null;
              state.chatQueue = [];
              (state as any).resetToolStream();
              (state as any).resetChatScroll();
              state.applySettings({
                ...state.settings,
                sessionKey: next,
                lastActiveSessionKey: next,
              });
              void state.loadAssistantIdentity();
              void loadChatHistory(state as any);
              void refreshChatAvatar(state as any);
            },
            thinkingLevel: state.chatThinkingLevel,
            showThinking,
            loading: state.chatLoading,
            sending: state.chatSending,
            compactionStatus: state.compactionStatus,
            assistantAvatarUrl: chatAvatarUrl,
            messages: state.chatMessages,
            toolMessages: state.chatToolMessages,
            stream: state.chatStream,
            streamStartedAt: (state as any).chatStreamStartedAt,
            draft: state.chatMessage,
            queue: state.chatQueue,
            connected: state.connected,
            canSend: state.connected,
            disabledReason: chatDisabledReason,
            error: state.lastError,
            sessions: state.sessionsResult,
            focusMode: chatFocus,
            onRefresh: () => {
              (state as any).resetToolStream();
              return Promise.all([loadChatHistory(state as any), refreshChatAvatar(state as any)]);
            },
            onToggleFocusMode: () => {
              if (state.onboarding) return;
              state.applySettings({
                ...state.settings,
                chatFocusMode: !state.settings.chatFocusMode,
              });
            },
            onChatScroll: (event) => state.handleChatScroll(event),
            onDraftChange: (next) => (state.chatMessage = next),
            attachments: state.chatAttachments,
            onAttachmentsChange: (next) => (state.chatAttachments = next),
            onSend: () => state.handleSendChat(),
            canAbort: Boolean(state.chatRunId),
            onAbort: () => void state.handleAbortChat(),
            onQueueRemove: (id) => state.removeQueuedMessage(id),
            onNewSession: () => state.handleSendChat("/new", { restoreDraft: true }),
            showNewMessages: state.chatNewMessagesBelow && !state.chatManualRefreshInFlight,
            onScrollToBottom: () => state.scrollToBottom(),
            sidebarOpen: state.sidebarOpen,
            sidebarContent: state.sidebarContent,
            sidebarError: state.sidebarError,
            splitRatio: state.splitRatio,
            onOpenSidebar: (content: string) => state.handleOpenSidebar(content),
            onCloseSidebar: () => state.handleCloseSidebar(),
            onSplitRatioChange: (ratio: number) => state.handleSplitRatioChange(ratio),
            assistantName: state.assistantName,
            assistantAvatar: state.assistantAvatar,
          })}
        </main>
      </div>

      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
    </div>
  `;
}
