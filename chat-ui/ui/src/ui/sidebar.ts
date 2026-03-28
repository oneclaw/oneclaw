/**
 * OneClaw sidebar component.
 * Replaces the upstream 13-tab navigation with a compact chat sidebar.
 */
import { html } from "lit";
import { nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { t } from "./i18n.ts";
import { icons } from "./icons.ts";
import oneClawLogo from "../assets/openclaw-favicon.svg";

export type SidebarProps = {
  connected: boolean;
  currentSessionKey: string;
  sessionOptions: Array<{ key: string; label: string; updatedAt?: number }>;
  settingsActive: boolean;
  skillsActive: boolean;
  workspaceActive: boolean;
  cronActive: boolean;
  cronJobCount: number;
  onOpenCron: () => void;
  updateStatus: "hidden" | "available" | "downloading";
  updateVersion: string | null;
  updatePercent: number | null;
  updateShowBadge: boolean;
  onToggleSidebar: () => void;
  onSelectSession: (sessionKey: string) => void;
  onNewChat: () => void;
  onRenameSession: (key: string, newLabel: string) => void;
  onDeleteSession: (key: string) => void;
  settingsBadge: boolean;
  onOpenSettings: () => void;
  onOpenSkillStore: () => void;
  onOpenWorkspace: () => void;
  onOpenWebUI: () => void;
  onOpenDocs: () => void;
  errors: string[];
  onApplyUpdate: () => void;
  onReconnect: () => void;
};

// 双击会话名触发内联重命名：创建 input 替换 span，Enter 保存，Escape 取消
function startInlineRename(
  span: HTMLSpanElement,
  sessionKey: string,
  currentLabel: string,
  onRename: (key: string, newLabel: string) => void,
) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "oneclaw-sidebar__session-edit";
  input.value = currentLabel;
  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const val = input.value.trim();
    if (val && val !== currentLabel) {
      onRename(sessionKey, val);
    }
    input.replaceWith(span);
  };
  input.addEventListener("keydown", (ev: KeyboardEvent) => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      save();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      saved = true;
      input.replaceWith(span);
    }
  });
  input.addEventListener("blur", save);
  span.replaceWith(input);
  input.focus();
  input.select();
}

export function renderSidebar(props: SidebarProps) {
  // 刷新图标，断开连接时复用为重连按钮图标
  const refreshIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
      <path d="M21 3v5h-5"></path>
    </svg>
  `;
  const showUpdateAction = props.updateStatus !== "hidden";
  const updateLabel = props.updateStatus === "downloading"
    ? t("sidebar.updateDownloading").replace(
        "{percent}",
        String(Math.max(0, Math.min(100, Math.round(props.updatePercent ?? 0)))),
      )
    : t("sidebar.updateReady");

  return html`
    <aside class="oneclaw-sidebar">
      <div class="oneclaw-sidebar__brand">
        <button
          class="oneclaw-sidebar__collapse"
          type="button"
          @click=${props.onToggleSidebar}
          data-tooltip=${t("sidebar.collapse")}
          data-tooltip-pos="bottom"
          aria-label=${t("sidebar.collapse")}
        >
          ${icons.panelLeft}
        </button>
      </div>

      <nav class="oneclaw-sidebar__nav">
        <!-- Prominent New Chat Button -->
        <div style="padding: 12px 14px 16px;">
          <button
            class="oneclaw-sidebar__new-chat-btn"
            @click=${props.onNewChat}
          >
            ${icons.messagePlus} ${t("sidebar.newChat")}
          </button>
        </div>

        <!-- 会话列表标题行 -->
        <div class="oneclaw-sidebar__session-header">
          <span class="oneclaw-sidebar__section-title">${t("sidebar.agent")}</span>
        </div>

        <!-- 会话列表 -->
        <div class="oneclaw-sidebar__session-list">
          ${repeat(
            props.sessionOptions,
            (s) => s.key,
            (s) => {
              const isActive = s.key === props.currentSessionKey;
              return html`
                <div
                  class="oneclaw-sidebar__session-item ${isActive ? "active" : ""}"
                  @click=${() => props.onSelectSession(s.key)}
                >
                  <span
                    class="oneclaw-sidebar__session-name"
                    title=${s.label}
                  >${s.label}</span>
                  <button
                    class="oneclaw-sidebar__session-action"
                    type="button"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      const item = (e.currentTarget as HTMLElement).closest(".oneclaw-sidebar__session-item")!;
                      const span = item.querySelector(".oneclaw-sidebar__session-name") as HTMLSpanElement;
                      startInlineRename(span, s.key, s.label, props.onRenameSession);
                    }}
                    data-tooltip=${t("sidebar.rename")}
                    aria-label=${t("sidebar.rename")}
                  >
                    ${icons.edit}
                  </button>
                  <button
                    class="oneclaw-sidebar__session-action"
                    type="button"
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      props.onDeleteSession(s.key);
                    }}
                    data-tooltip=${t("sidebar.delete")}
                    aria-label=${t("sidebar.delete")}
                  >
                    ${icons.x}
                  </button>
                </div>
              `;
            },
          )}
        </div>
      </nav>

      <div class="oneclaw-sidebar__footer">
        ${showUpdateAction
          ? html`
              <button
                class="oneclaw-sidebar__item oneclaw-sidebar__item--update ${props.updateStatus === "downloading"
                  ? "is-loading"
                  : ""}"
                type="button"
                @click=${props.onApplyUpdate}
                data-tooltip=${props.updateVersion ? `${updateLabel} (${props.updateVersion})` : updateLabel}
                ?disabled=${props.updateStatus === "downloading"}
              >
                <span class="oneclaw-sidebar__icon">
                  ${props.updateStatus === "downloading" ? icons.loader : icons.zap}
                </span>
                <span class="oneclaw-sidebar__label">${updateLabel}</span>
                ${props.updateShowBadge
                  ? html`<span class="oneclaw-sidebar__update-dot" aria-hidden="true"></span>`
                  : nothing}
              </button>
            `
          : nothing}
        <button
          class="oneclaw-sidebar__item oneclaw-sidebar__item--settings ${props.settingsActive
            ? "active"
            : ""}"
          type="button"
          @click=${props.onOpenSettings}
          data-tooltip=${t("sidebar.settings")}
        >
          <span class="oneclaw-sidebar__icon">${icons.settings}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.settings")}</span>
          ${props.settingsBadge
            ? html`<span class="oneclaw-sidebar__badge oneclaw-sidebar__badge--new">${t("sidebar.weixinBadge")}</span>`
            : nothing}
        </button>

        <button
          class="oneclaw-sidebar__item ${props.skillsActive ? "active" : ""}"
          type="button"
          @click=${props.onOpenSkillStore}
          data-tooltip=${t("sidebar.skillStore")}
        >
          <span class="oneclaw-sidebar__icon">${icons.puzzle}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.skillStore")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item ${props.workspaceActive ? "active" : ""}"
          type="button"
          @click=${props.onOpenWorkspace}
          title=${t("sidebar.workspace")}
        >
          <span class="oneclaw-sidebar__icon">${icons.folder}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.workspace")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item ${props.cronActive ? "active" : ""}"
          type="button"
          @click=${props.onOpenCron}
          data-tooltip=${t("sidebar.cron")}
        >
          <span class="oneclaw-sidebar__icon">${icons.clock}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.cron")}</span>
          ${props.cronJobCount > 0
            ? html`<span class="oneclaw-sidebar__badge">${props.cronJobCount}</span>`
            : nothing}
        </button>

        <button
          class="oneclaw-sidebar__item"
          type="button"
          @click=${props.onOpenDocs}
          data-tooltip=${t("sidebar.docs")}
        >
          <span class="oneclaw-sidebar__icon">${icons.book}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.docs")}</span>
        </button>

        ${props.connected
          ? html`
            <div class="oneclaw-sidebar__reconnect-wrap">
              <button
                class="oneclaw-sidebar__item"
                type="button"
                @click=${props.onOpenWebUI}
                data-tooltip=${t("sidebar.fullUI")}
              >
                <span class="oneclaw-sidebar__icon">${icons.externalLink}</span>
                <span class="oneclaw-sidebar__label">${t("sidebar.fullUI")}</span>
                ${props.errors.length > 0
                  ? html`<span class="oneclaw-sidebar__error-badge" title=${props.errors.join("\n")}>${props.errors.length}</span>`
                  : nothing}
              </button>
              ${props.errors.length > 0
                ? html`
                  <div class="oneclaw-sidebar__error-popup">
                    ${props.errors.map((msg) => html`<div class="oneclaw-sidebar__error-item">${msg}</div>`)}
                  </div>`
                : nothing}
            </div>`
          : html`
            <div class="oneclaw-sidebar__reconnect-wrap">
              <button
                class="oneclaw-sidebar__item oneclaw-sidebar__item--disconnected"
                type="button"
                @click=${props.onReconnect}
              >
                <span class="oneclaw-sidebar__icon">${refreshIcon}</span>
                <span class="oneclaw-sidebar__label">${t("sidebar.reconnect")}</span>
                ${props.errors.length > 0
                  ? html`<span class="oneclaw-sidebar__error-badge" title=${props.errors.join("\n")}>${props.errors.length}</span>`
                  : nothing}
              </button>
              ${props.errors.length > 0
                ? html`
                  <div class="oneclaw-sidebar__error-popup">
                    ${props.errors.map((msg) => html`<div class="oneclaw-sidebar__error-item">${msg}</div>`)}
                  </div>`
                : nothing}
            </div>`
        }
      </div>
    </aside>
  `;
}
