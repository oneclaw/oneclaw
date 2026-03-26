/**
 * OneClaw custom app-render.ts
 * Replaces the upstream 13-tab dashboard with a minimal sidebar + chat layout.
 * Chat view and all chat functionality are preserved from upstream.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "./app-view-state.ts";
import { parseAgentSessionKey } from "../../../src/routing/session-key.js";
import { refreshChat, refreshChatAvatar, pendingSessionLabels } from "./app-chat.ts";
import { syncUrlWithSessionKey } from "./app-settings.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { getLocale, t } from "./i18n.ts";
import { icons } from "./icons.ts";
import { renderSidebar } from "./sidebar.ts";
import { renderChat } from "./views/chat.ts";
import { renderExecApprovalPrompt } from "./views/exec-approval.ts";
import { renderGatewayUrlConfirmation } from "./views/gateway-url-confirmation.ts";
import { renderRestartGatewayDialog } from "./views/restart-gateway-dialog.ts";
import { renderSharePrompt } from "./views/share-prompt.ts";
import { renderReleaseNotesModal } from "./views/release-notes-modal.ts";
import { patchSession, loadSessions } from "./controllers/sessions.ts";
import { renderSkillStoreView, type SkillStoreState } from "./skill-store-view.ts";
import { renderWorkspaceView, initWorkspace } from "./views/workspace.ts";
import { renderCronReadonly } from "./views/cron-readonly.ts";
import { loadCronRuns } from "./controllers/cron.ts";
import type { SkillStatusEntry } from "./types.ts";
import {
  loadSkills,
  updateSkillEnabled,
  updateSkillEdit,
  saveSkillApiKey,
  installSkill,
  type SkillsState,
  type SkillMessageMap,
} from "./controllers/skills.ts";

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
      workspaceSetRoot?: (root: string) => Promise<any>;
      workspaceOpenFile?: (filePath: string) => Promise<any>;
      workspaceOpenFolder?: (filePath: string) => Promise<any>;
      workspaceListDir?: (dirPath: string) => Promise<any>;
      workspaceReadFile?: (filePath: string) => Promise<any>;
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

function setOneClawView(state: AppViewState, next: "chat" | "settings" | "skills" | "workspace" | "cron") {
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

// ── 技能页子标签 ──

// ── Cron 只读视图状态 ──
let cronExpandedJobId: string | null = null;
let cronRunsLoading = false;

// "installed" = 已安装/内置技能（gateway RPC），"store" = 技能商店（clawhub API）
let skillsSubTab: "installed" | "store" = "installed";

// ── 技能商店状态 ──

// 商店模式：浏览（按排序）或搜索
type StoreMode = "trending" | "downloads" | "updated" | "search";
let storeMode: StoreMode = "trending";

const skillStoreState: SkillStoreState = {
  skills: [],
  installedSlugs: new Set(),
  loading: false,
  error: null,
  searchQuery: "",
  sort: "trending",
  nextCursor: null,
  installingSlugs: new Set(),
  toastMessage: null,
};

// toast 定时器句柄
let skillStoreToastTimer: ReturnType<typeof setTimeout> | null = null;

// 显示 toast 并在 4 秒后自动消失
function showSkillStoreToast(state: AppViewState, message: string) {
  if (skillStoreToastTimer) clearTimeout(skillStoreToastTimer);
  skillStoreState.toastMessage = message;
  state.requestUpdate();
  skillStoreToastTimer = setTimeout(() => {
    skillStoreState.toastMessage = null;
    skillStoreToastTimer = null;
    state.requestUpdate();
  }, 4000);
}
let skillStoreDataLoaded = false;

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
      const skills = Array.isArray(result.data.skills) ? result.data.skills : [];
      skillStoreState.skills = append
        ? [...skillStoreState.skills, ...skills]
        : skills;
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
      skillStoreState.skills = Array.isArray(result.data.skills) ? result.data.skills : [];
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
    } else {
      showSkillStoreToast(state, t("skillStore.installFailed"));
    }
  } catch {
    showSkillStoreToast(state, t("skillStore.installFailed"));
  }
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
    } else {
      showSkillStoreToast(state, t("skillStore.uninstallFailed"));
    }
  } catch {
    showSkillStoreToast(state, t("skillStore.uninstallFailed"));
  }
  skillStoreState.installingSlugs.delete(slug);
  state.requestUpdate();
}

// 从已安装页面卸载技能（调用 clawhub uninstall 后刷新技能列表）
async function uninstallLocalSkill(state: AppViewState, slug: string) {
  if (!window.oneclaw?.skillStoreUninstall) return;
  state.skillsBusyKey = slug;
  state.requestUpdate();
  try {
    const result = await window.oneclaw.skillStoreUninstall({ slug });
    if (result?.success) {
      // 刷新已安装列表和商店已安装标记
      void loadSkills(state as unknown as SkillsState);
      await refreshInstalledSlugs();
    } else {
      showSkillStoreToast(state, t("skillStore.uninstallFailed"));
    }
  } catch {
    showSkillStoreToast(state, t("skillStore.uninstallFailed"));
  }
  state.skillsBusyKey = "";
  state.requestUpdate();
}

// ── 已安装技能视图（本地化重写） ──

// 分组定义：id → i18n key
const SKILL_GROUPS = [
  { id: "workspace", i18nKey: "skills.groupWorkspace", sources: ["openclaw-workspace"] },
  { id: "built-in", i18nKey: "skills.groupBuiltIn", sources: ["openclaw-bundled"] },
  { id: "installed", i18nKey: "skills.groupInstalled", sources: ["openclaw-managed"] },
  { id: "extra", i18nKey: "skills.groupExtra", sources: ["openclaw-extra"] },
];

// 按来源分组
function groupLocalSkills(skills: SkillStatusEntry[]) {
  const groups = new Map<string, { id: string; label: string; skills: SkillStatusEntry[] }>();
  for (const def of SKILL_GROUPS) {
    groups.set(def.id, { id: def.id, label: t(def.i18nKey), skills: [] });
  }
  const builtInDef = SKILL_GROUPS.find((g) => g.id === "built-in");
  const other = { id: "other", label: t("skills.groupOther"), skills: [] as SkillStatusEntry[] };
  for (const skill of skills) {
    const match = skill.bundled
      ? builtInDef
      : SKILL_GROUPS.find((g) => g.sources.includes(skill.source));
    if (match) {
      groups.get(match.id)?.skills.push(skill);
    } else {
      other.skills.push(skill);
    }
  }
  const ordered = SKILL_GROUPS
    .map((g) => groups.get(g.id))
    .filter((g): g is NonNullable<typeof g> => Boolean(g && g.skills.length > 0));
  if (other.skills.length > 0) ordered.push(other);
  return ordered;
}

// 字母头像颜色
const SKILL_COLORS = [
  "#c0392b", "#d35400", "#e67e22", "#f39c12",
  "#27ae60", "#1abc9c", "#2980b9", "#8e44ad",
  "#3498db", "#16a085", "#9b59b6", "#34495e",
];
function skillColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return SKILL_COLORS[Math.abs(h) % SKILL_COLORS.length];
}

// 截断描述
function clamp(text: string | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// 渲染已安装技能视图
function renderInstalledSkillsView(state: AppViewState) {
  const report = state.skillsReport;
  const allSkills = report?.skills ?? [];
  const filter = ((state as any).skillsFilter ?? "").trim().toLowerCase();
  const filtered = filter
    ? allSkills.filter((s: SkillStatusEntry) =>
        [s.name, s.description, s.source].join(" ").toLowerCase().includes(filter),
      )
    : allSkills;
  const groups = groupLocalSkills(filtered);
  const busy = state.skillsBusyKey;
  const messages = state.skillMessages as SkillMessageMap;

  return html`
    ${state.skillsError
      ? html`<div class="skill-store__error">${state.skillsError}</div>`
      : nothing}

    ${filtered.length === 0 && !state.skillsLoading
      ? html`<div class="skill-store__empty">${t("skills.empty")}</div>`
      : nothing}

    ${groups.map((group) => html`
      <details class="skills-group" open>
        <summary class="skills-group__header">
          <span>${group.label}</span>
          <span class="skills-group__count">${group.skills.length}</span>
          <span class="skills-group__chevron"></span>
        </summary>
        <div class="skill-store__list">
          ${group.skills.map((skill: SkillStatusEntry) => {
            const key = skill.skillKey ?? "";
            const isBusy = busy === key;
            const msg = messages[key] ?? null;
            const letter = (skill.emoji || (skill.name ?? "?").charAt(0)).toUpperCase();
            const missing = [
              ...(skill.missing?.bins ?? []).map((b: string) => `bin:${b}`),
              ...(skill.missing?.env ?? []).map((e: string) => `env:${e}`),
              ...(skill.missing?.config ?? []).map((c: string) => `config:${c}`),
              ...(skill.missing?.os ?? []).map((o: string) => `os:${o}`),
            ];
            return html`
              <div class="skill-store__card">
                <div class="skill-store__card-header">
                  <div class="skill-store__card-icon" style="background: ${skillColor(key)}; color: #fff;">
                    <span class="skill-store__card-letter">${letter}</span>
                  </div>
                  <div class="skill-store__card-info">
                    <div class="skill-store__card-name">${skill.name ?? key}</div>
                    <div class="skill-store__card-meta">
                      <span class="skills-badge">${skill.source}</span>
                      <span class="skills-badge ${skill.eligible ? "skills-badge--ok" : "skills-badge--warn"}">
                        ${skill.eligible ? t("skills.eligible") : t("skills.blocked")}
                      </span>
                      ${skill.disabled
                        ? html`<span class="skills-badge skills-badge--warn">${t("skills.disabled")}</span>`
                        : nothing}
                    </div>
                  </div>
                  <div class="skill-store__card-action">
                    <button
                      class="skill-store__btn ${skill.disabled ? "skill-store__btn--install" : "skill-store__btn--installed"}"
                      type="button"
                      ?disabled=${isBusy}
                      @click=${() => void updateSkillEnabled(state as unknown as SkillsState, key, !!skill.disabled)}
                    >${skill.disabled ? t("skills.enable") : t("skills.disable")}</button>
                    ${skill.source !== "openclaw-bundled"
                      ? html`
                        <button
                          class="skill-store__btn skill-store__btn--installed"
                          type="button"
                          ?disabled=${isBusy}
                          @click=${() => void uninstallLocalSkill(state, skill.name ?? key)}
                        >${t("skillStore.uninstall")}</button>`
                      : nothing}
                  </div>
                </div>
                <div class="skill-store__card-desc">${clamp(skill.description as string, 160)}</div>
                ${missing.length > 0
                  ? html`<div class="skills-missing">${t("skills.missing")}: ${missing.join(", ")}</div>`
                  : nothing}
                ${msg
                  ? html`<div class="skills-msg ${msg.kind === "error" ? "skills-msg--error" : "skills-msg--ok"}">${msg.message}</div>`
                  : nothing}
                ${skill.primaryEnv
                  ? html`
                    <div class="skills-apikey-row">
                      <input
                        class="skill-store__search-input"
                        type="password"
                        placeholder="API key (${skill.primaryEnv})"
                        .value=${state.skillEdits[key] ?? ""}
                        @input=${(e: Event) => updateSkillEdit(state as unknown as SkillsState, key, (e.target as HTMLInputElement).value)}
                      />
                      <button
                        class="skill-store__btn skill-store__btn--install"
                        type="button"
                        ?disabled=${isBusy}
                        @click=${() => void saveSkillApiKey(state as unknown as SkillsState, key)}
                      >${t("skills.saveKey")}</button>
                    </div>
                  `
                  : nothing}
              </div>
            `;
          })}
        </div>
      </details>
    `)}
  `;
}

// 打开技能管理视图（默认显示已安装技能）
function openSkillsView(state: AppViewState, subTab: "installed" | "store" = "installed") {
  skillsSubTab = subTab;
  setOneClawView(state, "skills");
  if (subTab === "installed") {
    void loadSkills(state as unknown as SkillsState);
  } else if (!skillStoreDataLoaded) {
    void loadSkillStoreData(state);
  }
}

// 打开工作区文件浏览视图
function openWorkspaceView(state: AppViewState) {
  setOneClawView(state, "workspace");
  void initWorkspace(state);
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
  // 新建会话时重置模型选择为默认
  state.resetModelToDefault();
  // 标记为待自动命名。label 将在首条消息发送 + chat.event final 后持久化到 gateway。
  pendingSessionLabels.set(newKey, label);
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
  if (state.chatLoading) return;
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

// 断开连接时尝试重连，3 秒后仍失败则弹窗询问是否重启 Gateway
function handleReconnect(state: AppViewState) {
  (state as any).client?.reconnectNow();
  setTimeout(() => {
    if (!state.connected) {
      state.showRestartGatewayDialog = true;
    }
  }, 3000);
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

    if (data.type === "navigate-back") {
      setOneClawView(bridge.state, "chat");
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

  // 监听 preload 派发的文件拖拽/粘贴事件，添加为文件附件
  window.addEventListener("oneclaw:file-drop", ((e: CustomEvent<{ paths: string[] }>) => {
    const bridge = (window as unknown as { [bridgeKey]?: { state: AppViewState } })[bridgeKey];
    if (!bridge) return;
    const { state } = bridge;
    const current = state.chatAttachments ?? [];
    const additions = e.detail.paths.map((p: string) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      filePath: p,
      name: p.split(/[/\\]/).pop() || p,
    }));
    state.chatAttachments = [...current, ...additions];
  }) as EventListener);

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

// 在聊天页顶部展示待审批卡片，把“去设置里找批准”改成主流程内的一步动作。
function renderPairingNotice(state: AppViewState) {
  if (!state.shouldShowPairingNotice()) {
    return nothing;
  }
  const first = state.pairingState.requests[0];
  const peerLabel = first?.name?.trim() || first?.id?.trim() || t("pairing.pendingUnknown");
  const channelLabel = state.getPendingPairingChannelLabel();
  return html`
    <section class="oneclaw-pairing-notice">
      <div class="oneclaw-pairing-notice__main">
        <div class="oneclaw-pairing-notice__title">${t("pairing.pendingTitle").replace("{channel}", channelLabel)}</div>
        <div class="oneclaw-pairing-notice__desc">
          ${t("pairing.pendingDesc").replace("{name}", peerLabel)}
        </div>
      </div>
      <div class="oneclaw-pairing-notice__actions">
        <button
          class="oneclaw-pairing-notice__icon-btn is-approve"
          type="button"
          ?disabled=${state.pairingApproving || state.pairingRejecting}
          data-tooltip=${t("pairing.approveNow")}
          aria-label=${t("pairing.approveNow")}
          @click=${() => void state.approveFirstPairing()}
        >
          ${icons.check}
        </button>
        <button
          class="oneclaw-pairing-notice__icon-btn is-reject"
          type="button"
          ?disabled=${state.pairingApproving || state.pairingRejecting}
          data-tooltip=${t("pairing.rejectNow")}
          aria-label=${t("pairing.rejectNow")}
          @click=${() => void state.rejectFirstPairing()}
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
  const skillsActive = oneclawView === "skills";
  const workspaceActive = oneclawView === "workspace";
  const cronActive = oneclawView === "cron";
  const updateBannerState = state.updateBannerState;

  return html`
    <div
      class="oneclaw-shell ${navigator.platform?.includes("Mac") ? "is-mac" : ""} ${chatFocus ? "oneclaw-shell--focus" : ""} ${sidebarCollapsed ? "oneclaw-shell--sidebar-collapsed" : ""} ${settingsActive || skillsActive || workspaceActive || cronActive ? "oneclaw-shell--fullpage" : ""}"
    >
      ${chatFocus || sidebarCollapsed || settingsActive || skillsActive || workspaceActive || cronActive
        ? nothing
        : renderSidebar({
            connected: state.connected,
            currentSessionKey,
            sessionOptions,
            settingsActive,
            skillsActive,
            workspaceActive,
            cronActive,
            cronJobCount: state.cronJobs.length,
            onOpenCron: () => setOneClawView(state, "cron"),
            updateStatus: updateBannerState.status,
            updateVersion: updateBannerState.version,
            updatePercent: updateBannerState.percent,
            updateShowBadge: updateBannerState.showBadge,
            onSelectSession: (nextSessionKey: string) => handleSessionChange(state, nextSessionKey),
            onNewChat: () => createNewSession(state),
            onRenameSession: (key: string, newLabel: string) => {
              void patchSessionFromSidebar(state, key, newLabel);
            },
            onDeleteSession: (key: string) => {
              void deleteSessionFromSidebar(state, key);
            },
            onToggleSidebar: () => {
              state.applySettings({
                ...state.settings,
                navCollapsed: !state.settings.navCollapsed,
              });
            },
            settingsBadge: !localStorage.getItem("oneclaw:weixin-badge-seen"),
            onOpenSettings: () => {
              localStorage.setItem("oneclaw:weixin-badge-seen", "1");
              openSettingsView(
                state,
                state.pairingState.pendingCount > 0 ? "channels" : null,
              );
            },
            onOpenSkillStore: () => openSkillsView(state),
            onOpenWorkspace: () => openWorkspaceView(state),
            onOpenWebUI: () => void handleOpenWebUI(state),
            errors: [chatDisabledReason, state.lastError].filter(Boolean) as string[],
            onReconnect: () => handleReconnect(state),
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
        <div class="oneclaw-titlebar">
          ${
            settingsActive || skillsActive || workspaceActive || cronActive
              ? html`
                  <div class="oneclaw-floating-actions">
                    <button
                      class="oneclaw-floating-btn"
                      type="button"
                      @click=${() => setOneClawView(state, "chat")}
                      data-tooltip=${t("sidebar.backToChat")}
                      data-tooltip-pos="bottom"
                      aria-label=${t("sidebar.backToChat")}
                    >
                      ${icons.arrowLeft}
                    </button>
                  </div>
                `
              : sidebarCollapsed && !chatFocus
                ? html`
                    <div class="oneclaw-floating-actions">
                      <button
                        class="oneclaw-floating-btn"
                        type="button"
                        @click=${() => {
                          state.applySettings({
                            ...state.settings,
                            navCollapsed: false,
                          });
                        }}
                        data-tooltip=${t("sidebar.expand")}
                        data-tooltip-pos="bottom"
                        aria-label=${t("sidebar.expand")}
                      >
                        ${icons.panelLeft}
                      </button>
                      <button
                        class="oneclaw-floating-btn"
                        type="button"
                        @click=${() => handleSessionChange(state, generateSessionKey())}
                        data-tooltip=${t("sidebar.newChat")}
                        data-tooltip-pos="bottom"
                        aria-label=${t("sidebar.newChat")}
                      >
                        ${icons.messagePlus}
                      </button>
                    </div>
                  `
                : nothing
          }
        </div>

        <main class="oneclaw-content">
          ${renderPairingNotice(state)}
          ${settingsActive
            ? renderOneClawSettingsPage(state)
            : skillsActive
              ? html`
                  <div class="skills-scroll" @scroll=${(e: Event) => {
                    if (skillsSubTab !== "store") return;
                    if (skillStoreState.loading || !skillStoreState.nextCursor) return;
                    const el = e.target as HTMLElement;
                    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) {
                      void loadSkillStoreData(state, true);
                    }
                  }}>
                    <section class="skill-store">
                      <div class="skill-store__header">
                        <h2 class="skill-store__title">${t("skillStore.title")}</h2>
                      </div>

                      <!-- 标签栏 + 右侧操作区 -->
                      <div class="skills-tab-bar">
                        <button
                          class="skills-tab-btn ${skillsSubTab === "installed" ? "active" : ""}"
                          type="button"
                          @click=${() => {
                            skillsSubTab = "installed";
                            void loadSkills(state as unknown as SkillsState);
                            state.requestUpdate();
                          }}
                        >${t("skills.tabInstalled")}</button>
                        <button
                          class="skills-tab-btn ${skillsSubTab === "store" ? "active" : ""}"
                          type="button"
                          @click=${() => {
                            skillsSubTab = "store";
                            if (!skillStoreDataLoaded) {
                              void loadSkillStoreData(state);
                            }
                            state.requestUpdate();
                          }}
                        >${t("skills.tabStore")}</button>
                        <div class="skills-tab-bar__actions">
                          ${skillsSubTab === "installed"
                            ? html`
                                <span class="skills-count">${t("skills.shown").replace("{n}", String((state.skillsReport?.skills ?? []).length))}</span>
                                <button
                                  class="skill-store__sort-btn"
                                  type="button"
                                  ?disabled=${state.skillsLoading}
                                  @click=${() => void loadSkills(state as unknown as SkillsState)}
                                >${state.skillsLoading ? t("skills.refreshing") : t("skills.refresh")}</button>
                              `
                            : html`
                                ${(["trending", "downloads", "updated"] as const).map((key) => html`
                                  <button
                                    class="skill-store__sort-btn ${storeMode === key ? "active" : ""}"
                                    type="button"
                                    @click=${() => {
                                      storeMode = key;
                                      skillStoreState.sort = key;
                                      skillStoreState.skills = [];
                                      skillStoreState.nextCursor = null;
                                      skillStoreState.searchQuery = "";
                                      skillStoreState.error = null;
                                      skillStoreDataLoaded = false;
                                      state.requestUpdate();
                                      void loadSkillStoreData(state);
                                    }}
                                  >${t(`skillStore.sort${key.charAt(0).toUpperCase() + key.slice(1)}`)}</button>
                                `)}
                                <button
                                  class="skill-store__sort-btn ${storeMode === "search" ? "active" : ""}"
                                  type="button"
                                  @click=${() => {
                                    storeMode = "search";
                                    skillStoreState.skills = [];
                                    skillStoreState.nextCursor = null;
                                    skillStoreState.searchQuery = "";
                                    skillStoreState.error = null;
                                    state.requestUpdate();
                                    requestAnimationFrame(() => {
                                      (state.renderRoot?.querySelector(".skill-store__search-input") as HTMLInputElement)?.focus();
                                    });
                                  }}
                                  data-tooltip="${t("skillStore.search")}"
                                ><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
                              `
                          }
                        </div>
                      </div>

                      <!-- 搜索框：已安装 tab 始终显示，商店 tab 仅搜索模式显示 -->
                      ${skillsSubTab === "installed" || storeMode === "search"
                        ? html`
                          <div class="skill-store__toolbar">
                            <div class="skill-store__search">
                              <input
                                class="skill-store__search-input"
                                type="text"
                                placeholder=${t(skillsSubTab === "installed" ? "skills.search" : "skillStore.search")}
                                .value=${skillsSubTab === "installed" ? ((state as any).skillsFilter ?? "") : skillStoreState.searchQuery}
                                @input=${(e: Event) => {
                                  const val = (e.target as HTMLInputElement).value;
                                  if (skillsSubTab === "installed") {
                                    (state as any).skillsFilter = val;
                                    state.requestUpdate();
                                  } else {
                                    skillStoreState.searchQuery = val;
                                    state.requestUpdate();
                                  }
                                }}
                                @keydown=${(e: KeyboardEvent) => {
                                  if (e.key === "Enter" && skillsSubTab === "store") {
                                    void searchSkillStore(state);
                                  }
                                }}
                              />
                            </div>
                          </div>
                        `
                        : nothing
                      }

                      <!-- 标签页内容 -->
                      ${skillsSubTab === "installed"
                        ? renderInstalledSkillsView(state)
                        : renderSkillStoreView(skillStoreState, {
                            onInstall: (slug) => void installSkillFromStore(state, slug),
                            onUninstall: (slug) => void uninstallSkillFromStore(state, slug),
                          })
                      }
                    </section>
                  </div>
                `
              : workspaceActive
                ? renderWorkspaceView(state, () => setOneClawView(state, "chat"))
              : cronActive
                ? renderCronReadonly({
                    jobs: state.cronJobs,
                    loading: state.cronLoading,
                    error: state.cronError,
                    expandedJobId: cronExpandedJobId,
                    runs: state.cronRuns,
                    runsLoading: cronRunsLoading,
                    onToggleExpand: (jobId: string) => {
                      if (cronExpandedJobId === jobId) {
                        cronExpandedJobId = null;
                        state.requestUpdate();
                        return;
                      }
                      cronExpandedJobId = jobId;
                      cronRunsLoading = true;
                      state.requestUpdate();
                      void loadCronRuns(state as any, jobId).finally(() => {
                        cronRunsLoading = false;
                        state.requestUpdate();
                      });
                    },
                    onNavigateToSession: (sessionKey: string) => {
                      setOneClawView(state, "chat");
                      state.applySettings({
                        ...state.settings,
                        sessionKey,
                        oneclawView: "chat",
                      });
                    },
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
                  disabledReason: null,
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
                  configuredModels: state.configuredModels,
                  currentModel: state.currentModel,
                  onModelChange: (modelKey) => state.handleModelChange(modelKey),
                  thinkingToggleLevel: state.thinkingLevel,
                  thinkingToggleLevels: state.thinkingLevels,
                  isBinaryThinking: state.isBinaryThinking,
                  onThinkingToggle: () => state.handleThinkingToggle(),
                  onThinkingLevelChange: (level: string) => state.handleThinkingLevelChange(level),
                  attachments: state.chatAttachments,
                  onAttachmentsChange: (next) => (state.chatAttachments = next),
                  onSend: () => state.handleSendChat(),
                  canAbort: Boolean(state.chatRunId),
                  onAbort: () => void state.handleAbortChat(),
                  onQueueRemove: (id) => state.removeQueuedMessage(id),
                  onNewSession: () => confirmAndCreateNewSession(state),
                  showNewMessages: !state.chatUserNearBottom,
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
      ${renderRestartGatewayDialog(state)}
      ${renderSharePrompt(state)}
      ${renderReleaseNotesModal(state)}
    </div>
  `;
}
