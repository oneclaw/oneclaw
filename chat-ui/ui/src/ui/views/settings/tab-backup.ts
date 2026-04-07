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
        <div class="oc-settings-backup__card-header">
          <div class="oc-settings__card-title">${t("settings.backup.title")}</div>
          ${s.hasLastKnownGood ? html`
            <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" ?disabled=${s.restoring} @click=${() => handleRestoreLKG(state)}>${t("settings.backup.restoreLastKnownGood")}</button>
          ` : nothing}
        </div>
        ${s.hasLastKnownGood ? html`
          <div class="oc-settings-backup__meta">${t("settings.backup.lastKnownGood")}: ${formatDateTime(s.lastKnownGoodUpdatedAt)}</div>
        ` : nothing}
        ${s.backups.length ? html`
          <div class="oc-settings-backup__list">
            ${s.backups.map(b => html`
              <div class="oc-settings-backup__item">
                <div class="oc-settings-backup__item-main">
                  <div class="oc-settings-backup__item-time">${formatDateTime(b.createdAt)} · ${formatBytes(b.size)}</div>
                  <div class="oc-settings-backup__item-name">${b.fileName}</div>
                </div>
                <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" ?disabled=${s.restoring} @click=${() => handleRestoreBackup(state, b.fileName)}>${t("settings.backup.restoreBackup")}</button>
              </div>
            `)}
          </div>
        ` : html`<div class="oc-settings-backup__empty">${t("settings.backup.noBackups")}</div>`}
      </div>

      <!-- Gateway Control -->
      <div class="oc-settings__card">
        <div class="oc-settings__card-title">${t("settings.backup.gateway")}</div>
        <div class="oc-settings-backup__gateway-row">
          <span class="oc-settings-backup__meta">${gwStatusKey(gw)}</span>
          ${gw === "running" ? html`
            <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" @click=${() => handleGatewayAction(state, "restart")}>${t("settings.backup.restart")}</button>
            <button class="oc-settings__btn oc-settings__btn--danger oc-settings__btn--compact" @click=${() => handleGatewayAction(state, "stop")}>${t("settings.backup.stop")}</button>
          ` : nothing}
          ${gw === "stopped" ? html`
            <button class="oc-settings__btn oc-settings__btn--primary oc-settings__btn--compact" @click=${() => handleGatewayAction(state, "start")}>${t("settings.backup.start")}</button>
          ` : nothing}
        </div>
      </div>

      <!-- Reset -->
      <div class="oc-settings__card">
        <div class="oc-settings__card-title">${t("settings.backup.resetTitle")}</div>
        <p class="oc-settings-backup__reset-desc">${t("settings.backup.resetDescription")}</p>
        <button class="oc-settings__btn oc-settings__btn--danger" ?disabled=${s.resetting} @click=${() => handleResetConfig(state)}>
          ${t("settings.backup.resetButton")}
        </button>
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
  .oc-settings-backup__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }
  .oc-settings-backup__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--border, #e0e0e0);
    border-radius: var(--radius-sm, 8px);
    background: var(--bg-input, #f5f5f5);
  }
  .oc-settings-backup__item-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .oc-settings-backup__item-time {
    font-size: 12px;
    color: var(--text, #3f3f46);
    user-select: text;
  }
  .oc-settings-backup__item-name {
    font-size: 11.5px;
    color: var(--text-muted, #a1a1aa);
    font-family: "SF Mono", "Fira Code", Menlo, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 460px;
    user-select: text;
  }
  .oc-settings-backup__gateway-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }
  .oc-settings-backup__gateway-row .oc-settings-backup__meta {
    margin-right: auto;
  }
  .oc-settings-backup__reset-desc {
    font-size: 13px;
    color: var(--text-secondary, #71717a);
    margin: 0;
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
