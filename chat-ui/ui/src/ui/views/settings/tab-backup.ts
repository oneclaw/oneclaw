/**
 * Settings: Backup & Restore Tab.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { BackupEntry, GatewayState } from "../../data/ipc-bridge.ts";
import { registerTickHandler, unregisterTickHandler } from "../../client-ticker.ts";
import "../../components/message-box.ts";
import { invalidateAllSettings } from "./settings-view.ts";

const s = {
  backups: [] as BackupEntry[],
  hasLastKnownGood: false,
  lastKnownGoodUpdatedAt: "",
  gatewayState: "stopped" as GatewayState,
  restoring: false,
  resetting: false,
  error: null as string | null,
  successMsg: null as string | null,
  initialized: false,
  refreshTimers: [] as ReturnType<typeof setTimeout>[],
  stateRef: null as AppViewState | null,
};

const TICK_HANDLER_NAME = "settings-backup-gateway";

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  s.stateRef = state;
  try {
    const [backup, gw] = await Promise.all([ipc.settingsListConfigBackups(), ipc.getGatewayState()]);
    s.backups = backup.backups ?? [];
    s.hasLastKnownGood = backup.hasLastKnownGood ?? false;
    s.lastKnownGoodUpdatedAt = backup.lastKnownGoodUpdatedAt ?? "";
    s.gatewayState = gw;
    state.requestUpdate();
  } catch {}

  // Steady-state gateway polling via tick handler
  registerTickHandler(TICK_HANDLER_NAME, async () => {
    try {
      const gw = await ipc.getGatewayState();
      if (gw !== s.gatewayState) {
        s.gatewayState = gw;
        s.stateRef?.requestUpdate();
      }
    } catch {}
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleString(); } catch { return iso; }
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}

async function handleRestoreBackup(state: AppViewState, fileName: string) {
  if (!confirm(t("settings.backup.confirmRestore").replace("{fileName}", fileName))) return;
  s.restoring = true; state.requestUpdate();
  try {
    await ipc.settingsRestoreConfigBackup({ fileName });
    ipc.restartGateway();
    scheduleGatewayRefresh(state);
    // Invalidate all settings tabs so they re-fetch from disk on next render
    invalidateAllSettings();
    s.restoring = false;
    s.successMsg = t("settings.saved");
    // Re-init backup tab itself after invalidation
    s.initialized = false;
    init(state);
    state.requestUpdate();
  } catch (e: any) { s.restoring = false; s.error = tWithDetail("settings.error.restoreFailed", e?.message); state.requestUpdate(); }
}

async function handleRestoreLKG(state: AppViewState) {
  if (!confirm(t("settings.backup.confirmRestoreLKG"))) return;
  s.restoring = true; state.requestUpdate();
  try {
    await ipc.settingsRestoreLastKnownGood();
    ipc.restartGateway();
    scheduleGatewayRefresh(state);
    // Invalidate all settings tabs so they re-fetch from disk on next render
    invalidateAllSettings();
    s.restoring = false; s.successMsg = t("settings.saved");
    s.initialized = false;
    init(state);
    state.requestUpdate();
  } catch (e: any) { s.restoring = false; s.error = tWithDetail("settings.error.restoreFailed", e?.message); state.requestUpdate(); }
}

async function handleResetConfig(state: AppViewState) {
  if (!confirm(t("settings.backup.resetConfirm"))) return;
  s.resetting = true; state.requestUpdate();
  try { await ipc.settingsResetConfigAndRelaunch(); } catch {}
  s.resetting = false; state.requestUpdate();
}

async function handleGatewayAction(state: AppViewState, action: "restart" | "start" | "stop") {
  if (action === "restart") ipc.restartGateway();
  else if (action === "start") ipc.startGateway();
  else ipc.stopGateway();
  scheduleGatewayRefresh(state);
}

function scheduleGatewayRefresh(state: AppViewState) {
  // Clear any pending refresh timers
  for (const t of s.refreshTimers) clearTimeout(t);
  s.refreshTimers = [];
  for (const delay of [200, 1200, 3000]) {
    s.refreshTimers.push(setTimeout(async () => {
      s.gatewayState = await ipc.getGatewayState();
      state.requestUpdate();
    }, delay));
  }
}

export function cleanupBackupTab() {
  unregisterTickHandler(TICK_HANDLER_NAME);
  for (const t of s.refreshTimers) clearTimeout(t);
  s.refreshTimers = [];
  s.stateRef = null;
  s.initialized = false;
}

function gwStatusKey(gw: GatewayState): string {
  return t(`settings.backup.gatewayStatus.${gw}`);
}

function mapRecoveryNotice(notice: string): string {
  const map: Record<string, string> = {
    "config-invalid-json": t("settings.backup.noticeInvalidJson"),
    "gateway-start-failed": t("settings.backup.noticeGatewayFailed"),
    "gateway-recovery-failed": t("settings.backup.noticeGatewayRecoverFailed"),
    "gateway-recovery-exception": t("settings.backup.noticeGatewayRecoverFailed"),
  };
  return map[notice] ?? notice;
}

export function renderTabBackup(state: AppViewState, notice: string | null) {
  if (!s.initialized) init(state);
  const gw = s.gatewayState;

  return html`
    <div class="oc-settings__section">
      <h2 class="oc-settings__section-title">${t("settings.backup.pageTitle")}</h2>
      <p class="oc-settings__hint">${t("settings.backup.pageDesc")}</p>

      ${notice ? html`<oc-message-box .message=${mapRecoveryNotice(notice)} .type=${"error"} .visible=${true}></oc-message-box>` : nothing}

      <!-- Backup History -->
      <div class="oc-settings__card">
        <div class="oc-settings__card-title">${t("settings.backup.title")}</div>
        ${s.hasLastKnownGood ? html`
          <div class="oc-settings-backup__lkg-row">
            <span class="oc-settings-backup__meta">${t("settings.backup.lastKnownGood")}: ${formatDateTime(s.lastKnownGoodUpdatedAt)}</span>
            <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" ?disabled=${s.restoring} @click=${() => handleRestoreLKG(state)}>${t("settings.backup.restoreLastKnownGood")}</button>
          </div>
        ` : nothing}
        ${s.backups.length ? html`
          <div class="oc-settings-backup__list">
            ${s.backups.map(b => html`
              <div class="oc-settings-backup__item">
                <span class="oc-settings-backup__item-time">${formatDateTime(b.createdAt)} · ${formatBytes(b.size)}</span>
                <button class="oc-settings-backup__restore-link" ?disabled=${s.restoring} @click=${() => handleRestoreBackup(state, b.fileName)}>${t("settings.backup.restoreBackup")}</button>
              </div>
            `)}
          </div>
        ` : html`<div class="oc-settings-backup__empty">${t("settings.backup.noBackups")}</div>`}
      </div>

      <!-- Gateway Control -->
      <div class="oc-settings__card">
        <div class="oc-settings-backup__card-header">
          <div>
            <div class="oc-settings__card-title">${t("settings.backup.gateway")}</div>
            <span class="oc-settings-backup__meta">${gwStatusKey(gw)}</span>
          </div>
          <div style="display:flex;gap:8px">
            ${gw === "running" ? html`
              <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" @click=${() => handleGatewayAction(state, "restart")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                ${t("settings.backup.restart")}
              </button>
              <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" @click=${() => handleGatewayAction(state, "stop")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ${t("settings.backup.stop")}
              </button>
            ` : nothing}
            ${gw === "stopped" ? html`
              <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" @click=${() => handleGatewayAction(state, "start")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                ${t("settings.backup.start")}
              </button>
            ` : nothing}
          </div>
        </div>
      </div>

      <!-- Reset -->
      <div class="oc-settings__card">
        <div class="oc-settings-backup__card-header">
          <div>
            <div class="oc-settings__card-title">${t("settings.backup.resetTitle")}</div>
            <p class="oc-settings-backup__reset-desc">${t("settings.backup.resetDescription")}</p>
          </div>
          <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" ?disabled=${s.resetting} @click=${() => handleResetConfig(state)}>
            ${t("settings.backup.resetButton")}
          </button>
        </div>
      </div>

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
      <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>
    </div>
  `;
}

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-settings-backup__card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .oc-settings-backup__meta {
    font-size: 12.5px;
    color: var(--text-secondary, #71717a);
    line-height: 1.5;
  }
  .oc-settings-backup__empty {
    font-size: 12.5px;
    color: var(--text-muted, #a1a1aa);
  }
  .oc-settings-backup__lkg-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .oc-settings-backup__list {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: 300px;
    overflow-y: auto;
  }
  .oc-settings-backup__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--border, #e4e4e7);
  }
  .oc-settings-backup__item:last-child { border-bottom: none; }
  .oc-settings-backup__item-time {
    font-size: 12.5px;
    color: var(--text, #3f3f46);
    user-select: text;
  }
  .oc-settings-backup__restore-link {
    border: none;
    background: none;
    color: var(--accent, #c0392b);
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    transition: background var(--transition, 0.18s ease);
    font-family: inherit;
    flex-shrink: 0;
  }
  .oc-settings-backup__restore-link:hover { background: var(--accent-subtle, rgba(192,57,43,0.08)); }
  .oc-settings-backup__restore-link:disabled { opacity: 0.5; cursor: not-allowed; }
  .oc-settings-backup__reset-desc {
    font-size: 13px;
    color: var(--text-secondary, #71717a);
    margin: 0;
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
