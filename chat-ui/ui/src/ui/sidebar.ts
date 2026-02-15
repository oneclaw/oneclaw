/**
 * OneClaw sidebar component.
 * Replaces the upstream 13-tab navigation with a minimal 4-item sidebar:
 *   - New Chat
 *   - Settings (IPC → Electron settings window)
 *   - Open Web UI (IPC → system browser)
 *   - Connection status indicator
 */
import { html, nothing } from "lit";
import { t } from "./i18n.ts";
import { icons } from "./icons.ts";

export type SidebarProps = {
  connected: boolean;
  onNewChat: () => void;
  onOpenSettings: () => void;
  onOpenWebUI: () => void;
};

export function renderSidebar(props: SidebarProps) {
  const statusClass = props.connected ? "ok" : "";
  const statusText = props.connected ? t("sidebar.connected") : t("sidebar.disconnected");

  return html`
    <aside class="oneclaw-sidebar">
      <div class="oneclaw-sidebar__brand">
        <div class="oneclaw-sidebar__logo">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 14s1.5 2 4 2 4-2 4-2" />
            <line x1="9" y1="9" x2="9.01" y2="9" stroke-width="3" stroke-linecap="round" />
            <line x1="15" y1="9" x2="15.01" y2="9" stroke-width="3" stroke-linecap="round" />
          </svg>
        </div>
        <span class="oneclaw-sidebar__title">${t("sidebar.brand")}</span>
      </div>

      <nav class="oneclaw-sidebar__nav">
        <button
          class="oneclaw-sidebar__item"
          type="button"
          @click=${props.onNewChat}
          title=${t("sidebar.newChat")}
        >
          <span class="oneclaw-sidebar__icon">${icons.messageSquare}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.newChat")}</span>
        </button>

        <button
          class="oneclaw-sidebar__item"
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
          @click=${props.onOpenWebUI}
          title=${t("sidebar.openWebUI")}
        >
          <span class="oneclaw-sidebar__icon">${icons.externalLink}</span>
          <span class="oneclaw-sidebar__label">${t("sidebar.openWebUI")}</span>
        </button>
      </nav>

      <div class="oneclaw-sidebar__footer">
        <div class="oneclaw-sidebar__status">
          <span class="statusDot ${statusClass}"></span>
          <span class="oneclaw-sidebar__status-text">${statusText}</span>
        </div>
      </div>
    </aside>
  `;
}
