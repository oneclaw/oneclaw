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
import { getLocale, t } from "./i18n.ts";
import { icons } from "./icons.ts";
import { renderSidebar } from "./sidebar.ts";
import { renderChat } from "./views/chat.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderSharePrompt } from "./views/share-prompt.ts";
import { patchSession, loadSessions } from "./controllers/sessions.ts";
import { renderSkillStoreView, type SkillStoreState } from "./skill-store-view.ts";

declare global {
  interface Window {
    oneclaw?: {
      openSettings?: () => void;
      openWebUI?: () => void;
      openExternal?: (url: string) => unknown;
      getGatewayPort?: () => Promise<number>;
      downloadAndInstallUpdate?: () => Promise<boolean>;
      skillStoreList?: (params?: Record<string, unknown>) => Promise<any>;
      skillStoreSearch?: (params?: Record<string, unknown>) => Promise<any>;
      skillStoreDetail?: (params?: Record<string, unknown>) => Promise<any>;
      skillStoreInstall?: (params?: Record<string, unknown>) => Promise<any>;
      skillStoreUninstall?: (params?: Record<string, unknown>) => Promise<any>;
      skillStoreListInstalled?: () => Promise<any>;
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

function resolveSessionOptionLabel(
  key: string,
  row?: (NonNullable<AppViewState["sessionsResult"]>["sessions"][number] | undefined),
): string {
  const displayName = typeof row?.displayName === "string" ? row.displayName.trim() : "";
  const label = typeof row?.label === "string" ? row.label.trim() : "";
  // 有别名时只显示别名，不附带 key
  if (label && label !== key) {
    return label;
  }
  if (displayName && displayName !== key) {
    return displayName;
  }
  return key;
}

function resolveSessionOptions(
  state: AppViewState,
): Array<{ key: string; label: string; updatedAt?: number }> {
  const sessions = state.sessionsResult?.sessions ?? [];
  const current = state.sessionKey?.trim() || "main";
  const seen = new Set<string>();
  const options: Array<{ key: string; label: string; updatedAt?: number }> = [];

  const pushOption = (
    key: string,
    row?: NonNullable<AppViewState["sessionsResult"]>["sessions"][number],
    isCurrentSession = false,
  ) => {
    const trimmedKey = String(key || "").trim();
    if (!trimmedKey || seen.has(trimmedKey)) {
      return;
    }
    seen.add(trimmedKey);
    // 当前活跃会话若无 updatedAt，视为"刚刚使用"排到最前
    options.push({
      key: trimmedKey,
      label: resolveSessionOptionLabel(trimmedKey, row),
      updatedAt: row?.updatedAt ?? (isCurrentSession ? Date.now() : undefined),
    });
  };

  // 收集所有会话（含当前会话和 API 列表）
  const currentSession = sessions.find((entry) => entry.key === current);
  pushOption(current, currentSession, true);
  for (const session of sessions) {
    pushOption(session.key, session);
  }

  // 按 updatedAt 降序排列（最近使用的在前，无时间戳的在末尾）
  options.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  if (options.length === 0) {
    return [{ key: current, label: current }];
  }
  return options;
}

// 侧边栏点击会话：切换 session 并确保回到对话视图
function handleSessionChange(state: AppViewState, nextSessionKey: string) {
  if (!nextSessionKey.trim()) {
    return;
  }
  setOneClawView(state, "chat");
  applySessionKey(state, nextSessionKey, true);
}

// 侧边栏重命名回调：修改会话 label 后刷新列表
async function patchSessionFromSidebar(state: AppViewState, key: string, newLabel: string) {
  await patchSession(state as any, key, { label: newLabel || null });
}

// 侧边栏删除回调：归档对话 → 删除会话 → UI 即时更新
async function deleteSessionFromSidebar(state: AppViewState, key: string) {
  const s = state as any;
  if (!s.client || !s.connected) {
    return;
  }
  const confirmed = window.confirm(t("sidebar.deleteSession"));
  if (!confirmed) {
    return;
  }

  // 立刻从本地列表移除，UI 即时响应
  const sessions = state.sessionsResult?.sessions ?? [];
  state.sessionsResult = {
    ...state.sessionsResult,
    sessions: sessions.filter((entry) => entry.key !== key),
  };

  // 删除当前活跃会话时，立刻切换到下一个
  if (key === state.sessionKey) {
    const remaining = state.sessionsResult?.sessions ?? [];
    const nextKey = remaining[0]?.key ?? "main";
    applySessionKey(state, nextKey, true);
  }

  // 触发 session-memory hook → 对话摘要归档到 ~/memory/*.md
  try {
    await s.client.request("sessions.reset", { key, reason: "new" });
  } catch {
    // 本地独有会话 gateway 不认识，忽略
  }

  // gateway 后端删除
  try {
    await s.client.request("sessions.delete", { key, deleteTranscript: true });
  } catch {
    // main 会话等 gateway 可能拒绝，已在上面本地移除
  }

  // 与 gateway 同步最终列表
  await loadSessions(s);
}

function setOneClawView(state: AppViewState, next: "chat" | "settings" | "skillStore") {
  if ((state.settings.oneclawView ?? "chat") === next) {
    return;
  }
  state.applySettings({
    ...state.settings,
    oneclawView: next,
  });
}

// 打开内嵌设置页时可携带目标 tab 提示，减少用户二次定位成本。
function openSettingsView(state: AppViewState, tabHint: "channels" | null = null) {
  state.settingsTabHint = tabHint;
  setOneClawView(state, "settings");
}

// ── 技能商店状态 ──

const skillStoreState: SkillStoreState = {
  skills: [],
  installedSlugs: new Set(),
  loading: false,
  error: null,
  searchQuery: "",
  sort: "updated",
  nextCursor: null,
  installingSlugs: new Set(),
};
let skillStoreDataLoaded = false;
let skillStoreSearchTimer: ReturnType<typeof setTimeout> | null = null;

// 加载技能列表（初次或切换排序时调用）
async function loadSkillStoreData(state: AppViewState, append = false) {
  if (!window.oneclaw?.skillStoreList) return;
  skillStoreState.loading = true;
  skillStoreState.error = null;
  state.requestUpdate();
  try {
    const result = await window.oneclaw.skillStoreList({
      sort: skillStoreState.sort,
      limit: 20,
      cursor: append ? skillStoreState.nextCursor : undefined,
    });
    if (result?.success && result.data) {
      skillStoreState.skills = append
        ? [...skillStoreState.skills, ...result.data.skills]
        : result.data.skills;
      skillStoreState.nextCursor = result.data.nextCursor ?? null;
    } else {
      skillStoreState.error = result?.message ?? t("skillStore.error");
    }
    // 同步已安装列表
    await refreshInstalledSlugs();
  } catch {
    skillStoreState.error = t("skillStore.error");
  } finally {
    skillStoreState.loading = false;
    skillStoreDataLoaded = true;
    state.requestUpdate();
  }
}

// 搜索技能
async function searchSkillStore(state: AppViewState) {
  if (!window.oneclaw?.skillStoreSearch) return;
  const q = skillStoreState.searchQuery.trim();
  if (!q) {
    skillStoreDataLoaded = false;
    await loadSkillStoreData(state);
    return;
  }
  skillStoreState.loading = true;
  skillStoreState.error = null;
  state.requestUpdate();
  try {
    const result = await window.oneclaw.skillStoreSearch({ q, limit: 20 });
    if (result?.success && result.data) {
      skillStoreState.skills = result.data.skills;
      skillStoreState.nextCursor = null;
    } else {
      skillStoreState.error = result?.message ?? t("skillStore.error");
    }
  } catch {
    skillStoreState.error = t("skillStore.error");
  } finally {
    skillStoreState.loading = false;
    state.requestUpdate();
  }
}

// 刷新已安装列表
async function refreshInstalledSlugs() {
  if (!window.oneclaw?.skillStoreListInstalled) return;
  try {
    const result = await window.oneclaw.skillStoreListInstalled();
    if (result?.success && Array.isArray(result.data)) {
      skillStoreState.installedSlugs = new Set(result.data);
    }
  } catch { /* ignore */ }
}

// 安装技能
async function installSkillFromStore(state: AppViewState, slug: string) {
  if (!window.oneclaw?.skillStoreInstall) return;
  skillStoreState.installingSlugs.add(slug);
  state.requestUpdate();
  try {
    const result = await window.oneclaw.skillStoreInstall({ slug });
    if (result?.success) {
      skillStoreState.installedSlugs.add(slug);
    }
  } catch { /* ignore */ }
  skillStoreState.installingSlugs.delete(slug);
  state.requestUpdate();
}

// 卸载技能
async function uninstallSkillFromStore(state: AppViewState, slug: string) {
  if (!window.oneclaw?.skillStoreUninstall) return;
  skillStoreState.installingSlugs.add(slug);
  state.requestUpdate();
  try {
    const result = await window.oneclaw.skillStoreUninstall({ slug });
    if (result?.success) {
      skillStoreState.installedSlugs.delete(slug);
    }
  } catch { /* ignore */ }
  skillStoreState.installingSlugs.delete(slug);
  state.requestUpdate();
}

// 打开技能商店视图
function openSkillStoreView(state: AppViewState) {
  setOneClawView(state, "skillStore");
  if (!skillStoreDataLoaded) {
    void loadSkillStoreData(state);
  }
}

// 新建会话：同步写入本地列表后再切换，异步同步到 Gateway 供跨终端访问
function createNewSession(state: AppViewState) {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const newKey = `agent:main:${id}`;
  const label = t("chat.newSession");
  setOneClawView(state, "chat");
  // 先把新会话插入本地列表，UI 立即可见正确的名称
  const sessions = state.sessionsResult?.sessions ?? [];
  state.sessionsResult = {
    ...state.sessionsResult,
    sessions: [{ key: newKey, label, updatedAt: Date.now() }, ...sessions],
  };
  applySessionKey(state, newKey, true);
  // 注意：此时 Gateway 尚无此会话（无消息），sessions.patch 不会生效。
  // label 持久化在首条消息发送后由 autoRenameOnFirstMessage (app-chat.ts) 完成。
}

function confirmAndCreateNewSession(state: AppViewState) {
  const ok = window.confirm(t("chat.confirmNewSession"));
  if (!ok) {
    return;
  }
  setOneClawView(state, "chat");
  return state.handleSendChat("/new", { restoreDraft: true });
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

async function handleOpenWebUI(state: AppViewState) {
  if (window.oneclaw?.openWebUI) {
    window.oneclaw.openWebUI();
  } else if (window.oneclaw?.openExternal) {
    let port = 18789;
    try {
      if (window.oneclaw.getGatewayPort) {
        port = await window.oneclaw.getGatewayPort();
      }
    } catch { /* use default */ }
    const token = state.settings.token.trim();
    const query = token ? `?token=${encodeURIComponent(token)}` : "";
    window.oneclaw.openExternal(`http://127.0.0.1:${port}/${query}`);
  }
}

// 仅在存在可用更新时触发下载与安装，避免误触发无效 IPC 调用。
async function handleApplyUpdate(state: AppViewState) {
  const current = state.updateBannerState;
  if (current.status !== "available") {
    return;
  }
  try {
    await window.oneclaw?.downloadAndInstallUpdate?.();
  } catch {
    // ignore bridge failure; main process会记录日志并回退状态
  }
}

function ensureSettingsEmbedBridge(state: AppViewState) {
  const bridgeKey = "__oneclawSettingsEmbedBridge";
  const w = window as unknown as {
    [bridgeKey]?: { state: AppViewState; bound: boolean };
  };
  if (!w[bridgeKey]) {
    w[bridgeKey] = { state, bound: false };
  } else {
    w[bridgeKey]!.state = state;
  }
  if (w[bridgeKey]!.bound) {
    return;
  }

  window.addEventListener("message", (event: MessageEvent) => {
    const bridge = (window as unknown as { [bridgeKey]?: { state: AppViewState } })[bridgeKey];
    if (!bridge) {
      return;
    }
    const data = event.data as
      | {
          source?: string;
          type?: string;
          payload?: { theme?: "system" | "light" | "dark"; showThinking?: boolean };
        }
      | undefined;
    if (!data || data.source !== "oneclaw-settings-embed") {
      return;
    }

    if (data.type === "appearance-request-init") {
      if (event.source && "postMessage" in event.source) {
        (event.source as Window).postMessage(
          {
            source: "oneclaw-chat-ui",
            type: "appearance-init",
            payload: {
              theme: bridge.state.theme,
              showThinking: bridge.state.settings.chatShowThinking,
            },
          },
          "*",
        );
      }
      return;
    }

    if (data.type === "appearance-save") {
      const nextTheme = data.payload?.theme;
      const nextShowThinking = data.payload?.showThinking;
      if (nextTheme === "system" || nextTheme === "light" || nextTheme === "dark") {
        bridge.state.setTheme(nextTheme);
      }
      if (typeof nextShowThinking === "boolean") {
        bridge.state.applySettings({
          ...bridge.state.settings,
          chatShowThinking: nextShowThinking,
        });
      }
    }
  });

  w[bridgeKey]!.bound = true;
}

function resolveEmbeddedSettingsUrl(state: AppViewState) {
  const lang = getLocale();
  const baseUrl = new URL(window.location.href);
  const settingsUrl = new URL("../../settings/index.html", baseUrl);
  settingsUrl.searchParams.set("lang", lang);
  settingsUrl.searchParams.set("embedded", "1");
  settingsUrl.searchParams.set("theme", state.theme);
  settingsUrl.searchParams.set(
    "showThinking",
    state.settings.chatShowThinking ? "1" : "0",
  );
  if (state.settingsTabHint) {
    settingsUrl.searchParams.set("tab", state.settingsTabHint);
  }
  return settingsUrl.toString();
}

function renderOneClawSettingsPage(state: AppViewState) {
  ensureSettingsEmbedBridge(state);
  const settingsUrl = resolveEmbeddedSettingsUrl(state);
  return html`
    <section class="oneclaw-settings-host">
      <iframe
        class="oneclaw-settings-iframe"
        src=${settingsUrl}
        title=${t("settings.title")}
      ></iframe>
    </section>
  `;
}

// 在聊天页顶部展示飞书待审批卡片，把“去设置里找批准”改成主流程内的一步动作。
function renderFeishuPairingNotice(state: AppViewState) {
  if (!state.shouldShowFeishuPairingNotice()) {
    return nothing;
  }
  const first = state.feishuPairingState.requests[0];
  const peerLabel = first?.name?.trim() || first?.id?.trim() || t("feishu.pendingUnknown");
  return html`
    <section class="oneclaw-feishu-notice">
      <div class="oneclaw-feishu-notice__main">
        <div class="oneclaw-feishu-notice__title">${t("feishu.pendingTitle")}</div>
        <div class="oneclaw-feishu-notice__desc">
          ${t("feishu.pendingDesc").replace("{name}", peerLabel)}
        </div>
      </div>
      <div class="oneclaw-feishu-notice__actions">
        <button
          class="oneclaw-feishu-notice__icon-btn is-approve"
          type="button"
          ?disabled=${state.feishuPairingApproving || state.feishuPairingRejecting}
          title=${t("feishu.approveNow")}
          aria-label=${t("feishu.approveNow")}
          @click=${() => void state.approveFirstFeishuPairing()}
        >
          ${icons.check}
        </button>
        <button
          class="oneclaw-feishu-notice__icon-btn is-reject"
          type="button"
          ?disabled=${state.feishuPairingApproving || state.feishuPairingRejecting}
          title=${t("feishu.rejectNow")}
          aria-label=${t("feishu.rejectNow")}
          @click=${() => void state.rejectFirstFeishuPairing()}
        >
          ${icons.x}
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
  const currentSessionKey = state.sessionKey;
  const sessionOptions = resolveSessionOptions(state);
  const oneclawView = state.settings.oneclawView ?? "chat";
  const settingsActive = oneclawView === "settings";
  const skillStoreActive = oneclawView === "skillStore";
  const updateBannerState = state.updateBannerState;

  return html`
    <div
      class="oneclaw-shell ${chatFocus ? "oneclaw-shell--focus" : ""} ${sidebarCollapsed ? "oneclaw-shell--sidebar-collapsed" : ""}"
    >
      ${chatFocus || sidebarCollapsed
        ? nothing
        : renderSidebar({
            connected: state.connected,
            currentSessionKey,
            sessionOptions,
            settingsActive,
            skillStoreActive,
            updateStatus: updateBannerState.status,
            updateVersion: updateBannerState.version,
            updatePercent: updateBannerState.percent,
            updateShowBadge: updateBannerState.showBadge,
            refreshDisabled: state.chatLoading || !state.connected,
            onSelectSession: (nextSessionKey: string) => handleSessionChange(state, nextSessionKey),
            onNewChat: () => createNewSession(state),
            onRenameSession: (key: string, newLabel: string) => {
              void patchSessionFromSidebar(state, key, newLabel);
            },
            onDeleteSession: (key: string) => {
              void deleteSessionFromSidebar(state, key);
            },
            onRefresh: () => void handleRefreshChat(state),
            onToggleSidebar: () => {
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              });
            },
            onOpenSettings: () => openSettingsView(
              state,
              state.feishuPairingState.pendingCount > 0 ? "channels" : null,
            ),
            onOpenSkillStore: () => openSkillStoreView(state),
            onOpenWebUI: () => void handleOpenWebUI(state),
            onOpenDocs: () => {
              if (window.oneclaw?.openExternal) {
                window.oneclaw.openExternal("https://oneclaw.cn/docs");
              } else {
                window.open("https://oneclaw.cn/docs", "_blank");
              }
            },
            onApplyUpdate: () => void handleApplyUpdate(state),
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
          ${renderFeishuPairingNotice(state)}
          ${settingsActive
            ? renderOneClawSettingsPage(state)
            : skillStoreActive
              ? renderSkillStoreView(skillStoreState, {
                  onSearch: (query: string) => {
                    skillStoreState.searchQuery = query;
                    state.requestUpdate();
                    if (skillStoreSearchTimer) clearTimeout(skillStoreSearchTimer);
                    skillStoreSearchTimer = setTimeout(() => void searchSkillStore(state), 300);
                  },
                  onSortChange: (sort) => {
                    skillStoreState.sort = sort;
                    skillStoreState.nextCursor = null;
                    skillStoreState.searchQuery = "";
                    skillStoreDataLoaded = false;
                    void loadSkillStoreData(state);
                  },
                  onInstall: (slug) => void installSkillFromStore(state, slug),
                  onUninstall: (slug) => void uninstallSkillFromStore(state, slug),
                  onLoadMore: () => void loadSkillStoreData(state, true),
                  onBackToChat: () => setOneClawView(state, "chat"),
                })
              : html`
                ${renderChat({
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
                  onNewSession: () => confirmAndCreateNewSession(state),
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
              `}
        </main>
      </div>

      ${renderExecApprovalPrompt(state)}
      ${renderGatewayUrlConfirmation(state)}
      ${renderSharePrompt(state)}
    </div>
  `;
}
