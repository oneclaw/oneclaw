/**
 * Shared pairing approval panel for Feishu and WeCom.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { PairingRequest, ApprovedEntry } from "../../data/ipc-bridge.ts";

export interface PairingPanelState {
  pairingRequests: PairingRequest[];
  approvedEntries: ApprovedEntry[];
  loading: boolean;
}

export async function loadPairingData(platform: "feishu" | "wecom"): Promise<PairingPanelState> {
  try {
    const [pending, approved] = await Promise.all([
      platform === "feishu" ? ipc.settingsListFeishuPairing() : ipc.settingsListWecomPairing(),
      platform === "feishu" ? ipc.settingsListFeishuApproved() : ipc.settingsListWecomApproved(),
    ]);
    return { pairingRequests: pending ?? [], approvedEntries: approved ?? [], loading: false };
  } catch {
    return { pairingRequests: [], approvedEntries: [], loading: false };
  }
}

async function handleApprove(state: AppViewState, platform: "feishu" | "wecom", req: PairingRequest, panelState: PairingPanelState, refresh: () => void) {
  const fn = platform === "feishu" ? ipc.settingsApproveFeishuPairing : ipc.settingsApproveWecomPairing;
  await fn({ code: req.code, id: req.id, name: req.name });
  refresh();
}

async function handleReject(state: AppViewState, platform: "feishu" | "wecom", req: PairingRequest, refresh: () => void) {
  const fn = platform === "feishu" ? ipc.settingsRejectFeishuPairing : ipc.settingsRejectWecomPairing;
  await fn({ code: req.code, id: req.id, name: req.name });
  refresh();
}

async function handleRemoveApproved(state: AppViewState, platform: "feishu" | "wecom", entry: ApprovedEntry, refresh: () => void) {
  const fn = platform === "feishu" ? ipc.settingsRemoveFeishuApproved : ipc.settingsRemoveWecomApproved;
  await fn({ kind: entry.kind, id: entry.id });
  refresh();
}

export function renderPairingPanel(
  state: AppViewState,
  platform: "feishu" | "wecom",
  panelState: PairingPanelState,
  refresh: () => void,
) {
  return html`
    <div class="oc-settings-pairing">
      <!-- Pending -->
      <div class="oc-settings-pairing__section">
        <div class="oc-settings__label">${t("settings.channels.pairing.pending")}</div>
        ${panelState.pairingRequests.length ? panelState.pairingRequests.map(req => html`
          <div class="oc-settings-pairing__item">
            <span class="oc-settings-pairing__name">${req.name || req.id}</span>
            <button class="oc-settings__btn" style="padding:4px 12px;font-size:12px" @click=${() => handleApprove(state, platform, req, panelState, refresh)}>${t("settings.channels.pairing.approve")}</button>
            <button class="oc-settings__btn" style="padding:4px 12px;font-size:12px" @click=${() => handleReject(state, platform, req, refresh)}>${t("settings.channels.pairing.reject")}</button>
          </div>
        `) : html`<div style="font-size:12px;color:var(--text-secondary)">${t("settings.channels.pairing.empty")}</div>`}
      </div>

      <!-- Approved -->
      <div class="oc-settings-pairing__section" style="margin-top:12px">
        <div class="oc-settings__label">${t("settings.channels.pairing.approved")}</div>
        ${panelState.approvedEntries.length ? panelState.approvedEntries.map(entry => html`
          <div class="oc-settings-pairing__item">
            <span style="font-size:11px;color:var(--text-secondary)">${entry.kind}</span>
            <span class="oc-settings-pairing__name">${entry.name || entry.id}</span>
            <button class="oc-settings__btn oc-settings__btn--danger" style="padding:4px 12px;font-size:12px;margin-left:auto" @click=${() => handleRemoveApproved(state, platform, entry, refresh)}>${t("settings.channels.pairing.remove")}</button>
          </div>
        `) : html`<div style="font-size:12px;color:var(--text-secondary)">${t("settings.channels.pairing.approvedEmpty")}</div>`}
      </div>

      <button class="oc-settings__btn" style="margin-top:8px" @click=${refresh}>${t("settings.provider.usage.refresh")}</button>
    </div>
  `;
}

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-settings-pairing {
    border: 1px solid var(--border, #e4e4e7);
    border-radius: var(--radius-md, 12px);
    background: var(--glass-xs, rgba(255,255,255,0.02));
    padding: 10px 12px;
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .oc-settings-pairing__section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .oc-settings-pairing__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    border: 1px solid var(--glass-border, rgba(255,255,255,0.08));
    border-radius: var(--radius-sm, 8px);
    padding: 6px 10px;
    background: var(--glass-xs, rgba(255,255,255,0.02));
    font-size: 12.5px;
  }
  .oc-settings-pairing__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    color: var(--text, #e4e4e7);
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
