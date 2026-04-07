/**
 * Settings View — top-level container with tab navigation.
 * Replaces the old iframe-based settings page.
 */
import { html } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import { SETTINGS_TABS } from "./settings-constants.ts";
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
      width: 180px;
      min-width: 180px;
      border-right: 1px solid var(--border, #e0e0e0);
      padding: 16px 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
      overflow-y: auto;
    }

    .oc-settings-nav-item {
      display: block;
      padding: 8px 20px;
      font-size: 14px;
      color: var(--text-secondary, #888);
      cursor: pointer;
      border: none;
      background: none;
      text-align: left;
      width: 100%;
      border-radius: 0;
      transition: background 0.15s, color 0.15s;
    }
    .oc-settings-nav-item:hover {
      background: var(--bg-secondary, #f5f5f5);
      color: var(--text, #1a1a1a);
    }
    .oc-settings-nav-item--active {
      color: var(--accent, #c0392b);
      font-weight: 500;
      background: rgba(192, 57, 43, 0.06);
    }

    .oc-settings-content {
      flex: 1;
      overflow-y: auto;
      padding: 24px 32px;
    }

    /* Shared form styles for all settings tabs */
    .oc-settings__section {
      margin-bottom: 24px;
    }
    .oc-settings__section-title {
      font-size: 16px;
      font-weight: 600;
      margin: 0 0 16px;
      color: var(--text, #1a1a1a);
    }
    .oc-settings__form-group {
      margin-bottom: 16px;
    }
    .oc-settings__label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text, #1a1a1a);
      margin-bottom: 6px;
    }
    .oc-settings__input {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-s, 6px);
      background: var(--bg, #fff);
      color: var(--text, #1a1a1a);
      box-sizing: border-box;
    }
    .oc-settings__input:focus {
      outline: none;
      border-color: var(--accent, #c0392b);
    }
    .oc-settings__hint {
      font-size: 13px;
      color: var(--text-secondary, #888);
    }
    .oc-settings__btn-row {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      margin-top: 20px;
    }
    .oc-settings__btn {
      padding: 8px 20px;
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius-s, 6px);
      cursor: pointer;
      border: 1px solid transparent;
      transition: opacity 0.15s;
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
      gap: 12px;
    }
    .oc-settings__radio {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 14px;
      cursor: pointer;
    }
    .oc-settings__radio input[type="radio"] { accent-color: var(--accent, #c0392b); }

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
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-s, 6px);
      background: var(--bg, #fff);
      color: var(--text, #1a1a1a);
      box-sizing: border-box;
    }
    .oc-settings__select:focus {
      outline: none;
      border-color: var(--accent, #c0392b);
    }
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
        ${SETTINGS_TABS.map(tab => html`
          <button
            class="oc-settings-nav-item ${s.activeTab === tab.id ? 'oc-settings-nav-item--active' : ''}"
            @click=${() => { if (s.activeTab !== tab.id) { cleanupTab(s.activeTab); s.activeTab = tab.id; s.notice = null; state.requestUpdate(); } }}
          >${t(tab.labelKey)}</button>
        `)}
      </nav>
      <div class="oc-settings-content">
        ${renderActiveTab(state)}
      </div>
    </div>
  `;
}
