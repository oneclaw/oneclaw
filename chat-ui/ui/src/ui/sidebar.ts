/**
 * OneClaw sidebar component.
 * Replaces the upstream 13-tab navigation with a minimal 4-item sidebar:
 *   - New Chat
 *   - Settings (IPC → Electron settings window)
 *   - Open Web UI (IPC → system browser)
 *   - Connection status indicator
 */
import { html } from "lit";
import { t } from "./i18n.ts";
import { icons } from "./icons.ts";
import oneClawLogo from "../assets/openclaw-favicon.svg";

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
          <img src=${oneClawLogo} alt=${t("sidebar.brand")} />
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
