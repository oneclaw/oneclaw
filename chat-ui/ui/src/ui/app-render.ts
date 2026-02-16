/**
 * OneClaw custom app-render.ts
 * Replaces the upstream 13-tab dashboard with a minimal sidebar + chat layout.
 * Chat view and all chat functionality are preserved from upstream.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChat, refreshChatAvatar } from "./app-chat.ts";
import { syncUrlWithSessionKey } from "./app-settings.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { t } from "./i18n.ts";
import { icons } from "./icons.ts";
import { renderThemeToggle } from "./app-render.helpers.ts";
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

function applySessionKey(state: AppViewState, next: string, syncUrl = false) {
  if (!next || next === state.sessionKey) {
    return;
  }
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
  if (syncUrl) {
    syncUrlWithSessionKey(
      state as unknown as Parameters<typeof syncUrlWithSessionKey>[0],
      next,
      true,
    );
  }
  void state.loadAssistantIdentity();
  void loadChatHistory(state as any);
  void refreshChatAvatar(state as any);
}

function resolveCurrentAgentId(state: AppViewState): string {
  const parsed = parseAgentSessionKey(state.sessionKey);
  if (parsed?.agentId) {
    return parsed.agentId;
  }
  return state.agentsList?.defaultId ?? state.agentsList?.agents?.[0]?.id ?? "main";
}

function resolveAgentOptions(state: AppViewState): Array<{ id: string; label: string }> {
  const agents = state.agentsList?.agents ?? [];
  if (agents.length === 0) {
    const fallbackAgent = resolveCurrentAgentId(state);
    return [{ id: fallbackAgent, label: fallbackAgent }];
  }
  return agents.map((entry) => {
    const alias = entry.identity?.name?.trim() || entry.name?.trim() || "";
    const label = alias && alias !== entry.id ? `${alias} (${entry.id})` : entry.id;
    return {
      id: entry.id,
      label,
    };
  });
}

function handleAgentChange(state: AppViewState, nextAgentId: string) {
  if (!nextAgentId.trim()) {
    return;
  }
  const parsed = parseAgentSessionKey(state.sessionKey);
  const sessionSuffix = parsed?.rest?.trim() || "main";
  const nextSessionKey = `agent:${nextAgentId}:${sessionSuffix}`;
  applySessionKey(state, nextSessionKey, true);
}

function setOneClawView(state: AppViewState, next: "chat" | "settings") {
  if ((state.settings.oneclawView ?? "chat") === next) {
    return;
  }
  state.applySettings({
    ...state.settings,
    oneclawView: next,
  });
}

async function handleRefreshChat(state: AppViewState) {
  if (state.chatLoading || !state.connected) {
    return;
  }
  const app = state as any;
  app.chatManualRefreshInFlight = true;
  app.chatNewMessagesBelow = false;
  await state.updateComplete;
  app.resetToolStream();
  try {
    await refreshChat(state as unknown as Parameters<typeof refreshChat>[0], {
      scheduleScroll: false,
    });
    app.scrollToBottom({ smooth: true });
  } finally {
    requestAnimationFrame(() => {
      app.chatManualRefreshInFlight = false;
      app.chatNewMessagesBelow = false;
    });
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

function renderOneClawSettingsPage(state: AppViewState, showThinking: boolean) {
  return html`
    <section class="oneclaw-settings-page">
      <header class="oneclaw-settings-page__header">
        <div>
          <h2 class="oneclaw-settings-page__title">${t("settings.title")}</h2>
          <p class="oneclaw-settings-page__sub">${t("settings.subtitle")}</p>
        </div>
        <button
          class="btn btn--sm"
          type="button"
          @click=${() => setOneClawView(state, "chat")}
        >
          ${t("settings.backToChat")}
        </button>
      </header>

      <div class="oneclaw-settings-card">
        <h3 class="oneclaw-settings-card__title">${t("sidebar.appearance")}</h3>

        <div class="oneclaw-settings-row">
          <span class="oneclaw-settings-row__label">${t("sidebar.theme")}</span>
          <div class="oneclaw-settings-row__control">${renderThemeToggle(state)}</div>
        </div>

        <button
          class="oneclaw-settings-row oneclaw-settings-row--button"
          type="button"
          @click=${() => {
            state.applySettings({
              ...state.settings,
              chatShowThinking: !state.settings.chatShowThinking,
            });
          }}
          aria-pressed=${showThinking}
          title=${t("sidebar.showThinking")}
        >
          <span class="oneclaw-settings-row__label">${t("sidebar.showThinking")}</span>
          <span class="oneclaw-settings-row__value ${showThinking ? "is-on" : "is-off"}">
            ${showThinking ? t("sidebar.on") : t("sidebar.off")}
          </span>
        </button>
      </div>
    </section>
  `;
}

export function renderApp(state: AppViewState) {
  const chatDisabledReason = state.connected ? null : t("error.disconnected");
  const showThinking = state.onboarding ? false : state.settings.chatShowThinking;
  const assistantAvatarUrl = resolveAssistantAvatarUrl(state);
  const chatAvatarUrl = state.chatAvatarUrl ?? assistantAvatarUrl ?? null;
  const chatFocus = state.onboarding;
  const sidebarCollapsed = !state.onboarding && state.settings.navCollapsed;
  const currentAgentId = resolveCurrentAgentId(state);
  const agentOptions = resolveAgentOptions(state);
  const oneclawView = state.settings.oneclawView ?? "chat";
  const settingsActive = oneclawView === "settings";

  return html`
    <div
      class="oneclaw-shell ${chatFocus ? "oneclaw-shell--focus" : ""} ${sidebarCollapsed ? "oneclaw-shell--sidebar-collapsed" : ""}"
    >
      ${chatFocus || sidebarCollapsed
        ? nothing
        : renderSidebar({
            connected: state.connected,
            currentAgentId,
            agentOptions,
            settingsActive,
            refreshDisabled: state.chatLoading || !state.connected,
            onNewChat: () => {
              setOneClawView(state, "chat");
              return state.handleSendChat("/new", { restoreDraft: true });
            },
            onSelectAgent: (nextAgentId: string) => handleAgentChange(state, nextAgentId),
            onRefresh: () => void handleRefreshChat(state),
            onToggleSidebar: () => {
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              });
            },
            onOpenSettings: () => setOneClawView(state, "settings"),
            onOpenWebUI: () => void handleOpenWebUI(),
          })}

      <div class="oneclaw-main">
        ${
          sidebarCollapsed && !chatFocus
            ? html`
                <button
                  class="oneclaw-sidebar-toggle-floating"
                  type="button"
                  @click=${() => {
                    state.applySettings({
                      ...state.settings,
                      navCollapsed: false,
                    });
                  }}
                  title=${t("sidebar.expand")}
                  aria-label=${t("sidebar.expand")}
                >
                  ${icons.menu}
                </button>
              `
            : nothing
        }

        <main class="oneclaw-content">
          ${settingsActive
            ? renderOneClawSettingsPage(state, showThinking)
            : renderChat({
                sessionKey: state.sessionKey,
                onSessionKeyChange: (next) => applySessionKey(state, next),
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
                focusMode: false,
                onRefresh: () => {
                  (state as any).resetToolStream();
                  return Promise.all([loadChatHistory(state as any), refreshChatAvatar(state as any)]);
                },
                onToggleFocusMode: () => {},
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
