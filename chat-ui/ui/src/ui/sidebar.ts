/**
 * OneClaw sidebar component.
 * Replaces the upstream 13-tab navigation with a compact chat sidebar.
 */
import { html } from "lit";
import { t } from "./i18n.ts";
import { icons } from "./icons.ts";
import oneClawLogo from "../assets/openclaw-favicon.svg";

export type SidebarProps = {
  connected: boolean;
  currentSessionKey: string;
  sessionOptions: Array<{ key: string; label: string }>;
  chatActive: boolean;
  settingsActive: boolean;
  refreshDisabled: boolean;
  onToggleSidebar: () => void;
  onOpenChat: () => void;
  onSelectSession: (sessionKey: string) => void;
  onRefresh: () => void;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenWebUI: () => void;
};

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
        <button
          class="oneclaw-sidebar__item ${props.chatActive ? "active" : ""}"
          type="button"
          @click=${props.onOpenChat}
          title=${t("sidebar.chat")}
        >
          <span class="oneclaw-sidebar__icon">${icons.messageSquare}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.chat")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item"
          type="button"
          @click=${props.onNewChat}
          title=${t("sidebar.newChat")}
        >
          <span class="oneclaw-sidebar__icon">${icons.plus}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.newChat")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item"
          type="button"
          @click=${props.onOpenWebUI}
          title=${t("sidebar.openWebUI")}
        >
          <span class="oneclaw-sidebar__icon">${icons.externalLink}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.openWebUI")}</span>
        </button>

        <div class="oneclaw-sidebar__divider"></div>

        <div class="oneclaw-sidebar__section oneclaw-sidebar__section--agent">
          <label class="oneclaw-sidebar__section-title" for="oneclaw-session-select">
            ${t("sidebar.agent")}
          </label>
          <div class="oneclaw-sidebar__select-wrap">
            <select
              id="oneclaw-session-select"
              class="oneclaw-sidebar__select"
              .value=${props.currentSessionKey}
              @change=${(event: Event) => {
                const nextSessionKey = (event.target as HTMLSelectElement).value;
                props.onSelectSession(nextSessionKey);
              }}
            >
              ${props.sessionOptions.map(
                (session) => html`<option value=${session.key}>${session.label}</option>`,
              )}
            </select>
          </div>
        </div>
      </nav>

      <div class="oneclaw-sidebar__footer">
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
