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
  updateStatus: "hidden" | "available" | "downloading";
  updateVersion: string | null;
  updatePercent: number | null;
  updateShowBadge: boolean;
  refreshDisabled: boolean;
  onToggleSidebar: () => void;
  onSelectSession: (sessionKey: string) => void;
  onNewChat: () => void;
  onRenameSession: (key: string, newLabel: string) => void;
  onDeleteSession: (key: string) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenWebUI: () => void;
  onOpenDocs: () => void;
  onApplyUpdate: () => void;
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
  const statusClass = props.connected ? "ok" : "";
  const statusText = props.connected ? t("sidebar.connected") : t("sidebar.disconnected");
  const refreshIcon = html`
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
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
        <div class="oneclaw-sidebar__brand-main">
          <div class="oneclaw-sidebar__logo">
            <img src=${oneClawLogo} alt=${t("sidebar.brand")} />
          </div>
          <span class="oneclaw-sidebar__title">${t("sidebar.brand")}</span>
        </div>
        <button
          class="oneclaw-sidebar__collapse"
          type="button"
          @click=${props.onToggleSidebar}
          title=${t("sidebar.collapse")}
          aria-label=${t("sidebar.collapse")}
        >
          ${icons.menu}
        </button>
      </div>

      <nav class="oneclaw-sidebar__nav">
        <!-- 会话列表标题行 -->
        <div class="oneclaw-sidebar__session-header">
          <span class="oneclaw-sidebar__section-title">${t("sidebar.agent")}</span>
          <button
            class="oneclaw-sidebar__session-add"
            type="button"
            @click=${props.onNewChat}
            title=${t("sidebar.newChat")}
            aria-label=${t("sidebar.newChat")}
          >
            ${icons.plus}
          </button>
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
                    title=${t("sidebar.rename")}
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
                    title=${t("sidebar.delete")}
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
                title=${props.updateVersion ? `${updateLabel} (${props.updateVersion})` : updateLabel}
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
          title=${t("sidebar.settings")}
        >
          <span class="oneclaw-sidebar__icon">${icons.settings}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.settings")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item"
          type="button"
          @click=${props.onOpenDocs}
          title=${t("sidebar.docs")}
        >
          <span class="oneclaw-sidebar__icon">${icons.book}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.docs")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item"
          type="button"
          @click=${props.onOpenWebUI}
          title=${t("sidebar.fullUI")}
        >
          <span class="oneclaw-sidebar__icon">${icons.externalLink}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.fullUI")}</span>
        </button>

        <div class="oneclaw-sidebar__status-row">
          <div class="oneclaw-sidebar__status">
            <span class="statusDot ${statusClass}"></span>
            <span class="oneclaw-sidebar__status-text">${statusText}</span>
          </div>
          <button
            class="btn btn--sm btn--icon oneclaw-sidebar__refresh"
            type="button"
            ?disabled=${props.refreshDisabled}
            @click=${props.onRefresh}
            title=${t("sidebar.refresh")}
            aria-label=${t("sidebar.refresh")}
          >
            ${refreshIcon}
          </button>
        </div>
      </div>
    </aside>
  `;
}
