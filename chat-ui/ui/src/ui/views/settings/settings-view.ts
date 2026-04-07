/**
 * Settings View — top-level container with tab navigation.
 * Replaces the old iframe-based settings page.
 */
import { html } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import { SETTINGS_TABS, getTabIcon } from "./settings-constants.ts";
import { renderTabChannels, cleanupChannelsTab } from "./tab-channels.ts";
import { renderTabSearch, resetSearchTab } from "./tab-search.ts";
import { renderTabMemory, resetMemoryTab } from "./tab-memory.ts";
import { renderTabAppearance, resetAppearanceTab } from "./tab-appearance.ts";
import { renderTabAdvanced, resetAdvancedTab } from "./tab-advanced.ts";
import { renderTabBackup, cleanupBackupTab } from "./tab-backup.ts";
import { renderTabAbout, cleanupAboutTab } from "./tab-about.ts";
import { renderTabProvider, resetProviderTab } from "./tab-provider.ts";

/* ── module-level state ── */

const s = {
  activeTab: "channels",
  notice: null as string | null,
  navigateUnlisten: null as (() => void) | null,
  initialized: false,
};

/* ── init ── */

function init(state: AppViewState) {
  // Always consume tab hint + notice on every entry (not just first init).
  // These are set by the main process navigate payload so there is no race
  // with the IPC listener below.
  if (state.settingsTabHint) {
    s.activeTab = state.settingsTabHint;
    state.settingsTabHint = null;
  }
  if (state.settingsNotice) {
    s.notice = state.settingsNotice;
    state.settingsNotice = null;
  }

  if (s.initialized) return;
  s.initialized = true;

  // Listen for main-process tab navigation
  s.navigateUnlisten = ipc.onSettingsNavigate((payload: any) => {
    if (payload?.tab && payload.tab !== s.activeTab) {
      cleanupTab(s.activeTab);
      s.activeTab = payload.tab;
    }
    if (payload?.notice) {
      s.notice = payload.notice;
    }
    state.requestUpdate();
  });
}

/* ── tab cleanup on switch ── */

function cleanupTab(tabId: string) {
  switch (tabId) {
    case "channels": cleanupChannelsTab(); break;
    case "backup": cleanupBackupTab(); break;
    case "about": cleanupAboutTab(); break;
  }
}

/* ── tab rendering ── */

function renderActiveTab(state: AppViewState) {
  switch (s.activeTab) {
    case "channels": return renderTabChannels(state);
    case "provider": return renderTabProvider(state);
    case "search": return renderTabSearch(state);

    case "memory": return renderTabMemory(state);
    case "appearance": return renderTabAppearance(state);
    case "advanced": return renderTabAdvanced(state);
    case "backup": return renderTabBackup(state, s.notice);
    case "about": return renderTabAbout(state);
    default: return renderTabChannels(state);
  }
}

/* ── CSS (injected once) ── */

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(/* css */`
    .oc-settings-container {
      display: flex;
      height: 100%;
      width: 100%;
      overflow: hidden;
    }

    .oc-settings-nav {
      width: 280px;
      min-width: 280px;
      border-right: 1px solid var(--border, #e0e0e0);
      padding: 44px 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
      background: var(--bg-secondary, #fbfbfb);
      -webkit-app-region: drag;
    }

    .oc-settings-nav__title {
      font-size: 11px;
      font-weight: 500;
      color: var(--text-muted, #999);
      letter-spacing: 0.02em;
      padding: 8px 12px;
      margin-bottom: 4px;
    }

    .oc-settings-nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary, #888);
      cursor: pointer;
      border: none;
      background: none;
      text-align: left;
      width: 100%;
      border-radius: 10px;
      transition: color var(--transition, 0.18s ease), background var(--transition, 0.18s ease);
      -webkit-app-region: no-drag;
    }
    .oc-settings-nav-item svg {
      flex-shrink: 0;
      color: inherit;
    }
    .oc-settings-nav-item:hover {
      background: var(--bg-hover, #ebebeb);
      color: var(--text, #1a1a1a);
    }
    .oc-settings-nav-item--active {
      color: var(--text-strong, #18181b);
      font-weight: 500;
      background: var(--bg-hover, #ebebeb);
    }
    .oc-settings-nav-item--active svg {
      color: var(--text-strong, #18181b);
    }

    .oc-settings-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      padding: 44px 32px 28px;
      position: relative;
    }
    .oc-settings-content::before {
      content: "";
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 44px;
      -webkit-app-region: drag;
    }
    .oc-settings-content > * {
      max-width: 820px;
      width: 100%;
      margin-left: auto;
      margin-right: auto;
    }

    /* Shared form styles for all settings tabs */
    .oc-settings__section {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 0;
      flex: 1;
    }
    .oc-settings__section > * {
      flex-shrink: 0;
    }
    .oc-settings__section-title {
      font-size: 18px;
      font-weight: 600;
      letter-spacing: -0.01em;
      margin: 0;
      color: var(--text-strong, #18181b);
    }
    .oc-settings__form-group {
      margin-bottom: 0;
    }
    .oc-settings__label {
      display: block;
      font-size: 12px;
      font-weight: 500;
      color: var(--text-secondary, #71717a);
      margin-bottom: 6px;
    }
    .oc-settings__input {
      width: 100%;
      padding: 9px 12px;
      font-size: 13.5px;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-sm, 8px);
      background: var(--bg-input, #f5f5f5);
      color: var(--text, #1a1a1a);
      box-sizing: border-box;
      outline: none;
      transition: border-color var(--transition, 0.18s ease), box-shadow var(--transition, 0.18s ease);
      font-family: inherit;
    }
    .oc-settings__input::placeholder {
      color: var(--text-muted, #a1a1aa);
    }
    .oc-settings__input:focus {
      outline: none;
      border-color: var(--border-focus, var(--accent, #c0392b));
      box-shadow: 0 0 0 3px var(--accent-subtle, rgba(192,57,43,0.15));
    }
    .oc-settings__hint {
      font-size: 13px;
      color: var(--text-secondary, #888);
      margin: 0;
    }
    .oc-settings__btn-row {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: auto;
      padding-top: 24px;
      padding-bottom: 32px;
    }
    .oc-settings__btn {
      padding: 8px 20px;
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius-pill, 9999px);
      cursor: pointer;
      border: 1px solid transparent;
      transition: opacity var(--duration-fast, 0.12s) var(--ease-out);
    }
    .oc-settings__btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .oc-settings__btn--primary {
      background: var(--accent, #c0392b);
      color: #fff;
      border-color: var(--accent, #c0392b);
    }
    .oc-settings__btn--primary:hover:not(:disabled) { opacity: 0.9; }
    .oc-settings__btn--danger {
      background: #e74c3c;
      color: #fff;
      border-color: #e74c3c;
    }
    .oc-settings__btn--danger:hover:not(:disabled) { opacity: 0.9; }
    .oc-settings__btn--secondary {
      background: transparent;
      color: var(--text, #1a1a1a);
      border-color: var(--border, #ddd);
    }
    .oc-settings__btn--secondary:hover:not(:disabled) { background: var(--bg-secondary, #f5f5f5); }

    .oc-settings__radio-group {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
    }
    .oc-settings__radio {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: var(--text-secondary, #71717a);
      cursor: pointer;
    }
    .oc-settings__radio input[type="radio"] {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--border, #e4e4e7);
      border-radius: 50%;
      margin: 0;
      cursor: pointer;
      position: relative;
      background: var(--bg-input, #f5f5f5);
      transition: border-color var(--transition, 0.18s ease);
    }
    .oc-settings__radio input[type="radio"]:checked {
      border-color: var(--accent, #c0392b);
    }
    .oc-settings__radio input[type="radio"]:checked::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent, #c0392b);
    }

    /* Checkbox */
    .oc-settings__checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-secondary, #71717a);
    }
    .oc-settings__checkbox input[type="checkbox"] {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--border, #e4e4e7);
      border-radius: 3px;
      background: var(--bg-input, #f5f5f5);
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
      transition: border-color var(--transition, 0.18s ease), background var(--transition, 0.18s ease);
    }
    .oc-settings__checkbox input[type="checkbox"]:checked {
      border-color: var(--accent, #c0392b);
      background: var(--accent, #c0392b);
    }
    .oc-settings__checkbox input[type="checkbox"]:checked::after {
      content: "";
      position: absolute;
      top: 1px;
      left: 4px;
      width: 5px;
      height: 9px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .oc-settings__card {
      border: 1px solid var(--border, #e0e0e0);
      border-radius: var(--radius-m, 8px);
      padding: 16px 20px;
      margin-bottom: 16px;
    }
    .oc-settings__card-title {
      font-size: 14px;
      font-weight: 600;
      margin: 0 0 12px;
      color: var(--text, #1a1a1a);
    }

    .oc-settings__link {
      color: var(--accent, #c0392b);
      text-decoration: none;
      font-size: 13px;
    }
    .oc-settings__link:hover {
      text-decoration: underline;
    }

    .oc-settings__select {
      width: 100%;
      padding: 9px 12px;
      font-size: 13.5px;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-sm, 8px);
      background: var(--bg-input, #f5f5f5);
      color: var(--text, #1a1a1a);
      box-sizing: border-box;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
      cursor: pointer;
      outline: none;
      font-family: inherit;
      transition: border-color var(--transition, 0.18s ease), box-shadow var(--transition, 0.18s ease);
    }
    .oc-settings__select:focus {
      outline: none;
      border-color: var(--border-focus, var(--accent, #c0392b));
      box-shadow: 0 0 0 3px var(--accent-subtle, rgba(192,57,43,0.15));
    }

    /* Password field with visibility toggle */
    .oc-settings__password-wrap {
      position: relative;
    }
    .oc-settings__password-wrap .oc-settings__input {
      padding-right: 40px;
    }
    .oc-settings__btn-toggle-vis {
      position: absolute;
      right: 4px;
      top: 50%;
      transform: translateY(-50%);
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: transparent;
      color: var(--text-muted, #a1a1aa);
      cursor: pointer;
      border-radius: var(--radius-sm, 8px);
      transition: color var(--transition, 0.18s ease);
    }
    .oc-settings__btn-toggle-vis:hover {
      color: var(--text-secondary, #71717a);
    }

    /* Platform link */
    .oc-settings__platform-link {
      font-size: 12px;
      font-weight: 500;
      color: var(--accent, #c0392b);
      text-decoration: none;
      cursor: pointer;
      transition: color var(--transition, 0.18s ease);
      white-space: nowrap;
    }
    .oc-settings__platform-link:hover {
      color: var(--accent-hover, #a93226);
    }

    /* Field hint (below inputs) */
    .oc-settings__field-hint {
      margin: 0;
      font-size: 12px;
      color: var(--text-muted, #a1a1aa);
      line-height: 1.45;
    }

    /* Channel panel title */
    .oc-settings__panel-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text, #3f3f46);
    }

    /* Desc row with links */
    .oc-settings__desc-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
    }
    .oc-settings__desc-row .oc-settings__hint { margin-bottom: 0; }
    .oc-settings__channel-links {
      display: flex;
      gap: 16px;
      white-space: nowrap;
    }

    /* Collapsible advanced section */
    .oc-settings__details-advanced {
      margin-top: 12px;
      border: 1px solid var(--border, #e4e4e7);
      border-radius: var(--radius-sm, 8px);
      padding: 0;
    }
    .oc-settings__details-advanced > summary {
      cursor: pointer;
      padding: 8px 12px;
      font-size: 13px;
      color: var(--text-secondary, #71717a);
      user-select: none;
    }
    .oc-settings__details-advanced[open] > summary {
      border-bottom: 1px solid var(--border, #e4e4e7);
    }
    .oc-settings__details-advanced .oc-settings__form-group {
      padding: 12px;
      margin: 0;
    }

    /* OAuth buttons */
    .oc-settings__btn-oauth-logout {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      background: transparent;
      border: 1px solid var(--border, #e4e4e7);
      color: var(--text-secondary, #71717a);
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    .oc-settings__btn-oauth-logout:hover {
      background: var(--bg-hover, #ebebeb);
      color: var(--text, #3f3f46);
      border-color: var(--text-secondary, #71717a);
    }

    /* Spinner animation (reused in provider OAuth) */
    @keyframes oc-setup-spin { to { transform: rotate(360deg); } }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

/* ── invalidate all tabs (called after backup restore to force re-fetch) ── */

export function invalidateAllSettings() {
  resetProviderTab();
  resetSearchTab();
  resetMemoryTab();
  resetAppearanceTab();
  resetAdvancedTab();
  cleanupChannelsTab();
  cleanupBackupTab();
  cleanupAboutTab();
}

/* ── cleanup (called when leaving settings view) ── */

export function cleanupSettingsView() {
  if (s.navigateUnlisten) {
    s.navigateUnlisten();
    s.navigateUnlisten = null;
  }
  resetProviderTab();
  resetSearchTab();
  resetMemoryTab();
  resetAppearanceTab();
  resetAdvancedTab();
  cleanupChannelsTab();
  cleanupBackupTab();
  cleanupAboutTab();
  s.initialized = false;
  // Reset to defaults so next open starts at Channels (Plan: "Channels - default")
  s.activeTab = "channels";
  s.notice = null;
}

/* ── render entry point ── */

export function renderSettingsView(state: AppViewState) {
  injectStyles();
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings-container">
      <nav class="oc-settings-nav">
        <div class="oc-settings-nav__title">${t("settings.title")}</div>
        ${SETTINGS_TABS.map(tab => html`
          <button
            class="oc-settings-nav-item ${s.activeTab === tab.id ? 'oc-settings-nav-item--active' : ''}"
            @click=${() => { if (s.activeTab !== tab.id) { cleanupTab(s.activeTab); s.activeTab = tab.id; s.notice = null; state.requestUpdate(); } }}
          >${getTabIcon(tab.id)}${t(tab.labelKey)}</button>
        `)}
      </nav>
      <div class="oc-settings-content">
        ${renderActiveTab(state)}
      </div>
    </div>
  `;
}
