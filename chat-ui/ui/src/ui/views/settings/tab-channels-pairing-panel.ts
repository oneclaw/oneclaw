/**
 * Shared pairing approval panel for Feishu and WeCom.
 */
import { html, nothing, type TemplateResult } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { PairingRequest, ApprovedEntry } from "../../data/ipc-bridge.ts";

export interface PairingPanelState {
  pairingRequests: PairingRequest[];
  approvedEntries: ApprovedEntry[];
  loading: boolean;
}

export interface PairingPanelOptions {
  extraApproved?: { kind: string; id: string; onRemove: () => void }[];
  onAddGroup?: () => void;
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

// Lucide icons (16x16)
const refreshIcon = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
const plusIcon = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

export function renderPairingPanel(
  state: AppViewState,
  platform: "feishu" | "wecom",
  panelState: PairingPanelState,
  refresh: () => void,
  options?: PairingPanelOptions,
) {
  const extraApproved = options?.extraApproved ?? [];
  const extraIds = new Set(extraApproved.map(e => e.id));
  const filteredApproved = panelState.approvedEntries.filter(e => !extraIds.has(e.id));
  const allApproved = [
    ...extraApproved.map(e => ({ ...e, isExtra: true as const })),
    ...filteredApproved.map(e => ({ ...e, isExtra: false as const, onRemove: () => handleRemoveApproved(state, platform, e, refresh) })),
  ];
  const hasToolbar = options?.onAddGroup;

  return html`
    <div class="oc-settings-pairing">
      <!-- Toolbar -->
      ${hasToolbar ? html`
        <div class="oc-settings-pairing__toolbar">
          <div class="oc-settings__label" style="margin:0">${t("settings.channels.pairing.whitelistTitle")}</div>
          <div style="display:flex;gap:12px">
            <button class="oc-settings-pairing__text-btn" @click=${refresh}>${refreshIcon} ${t("settings.provider.usage.refresh")}</button>
            <button class="oc-settings-pairing__text-btn" @click=${options!.onAddGroup}>${plusIcon} ${t("settings.channels.feishu.addGroup")}</button>
          </div>
        </div>
      ` : nothing}

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
        ${allApproved.length ? allApproved.map(entry => html`
          <div class="oc-settings-pairing__item">
            <span style="font-size:11px;color:var(--text-secondary)">${entry.kind}</span>
            <span class="oc-settings-pairing__name">${(entry as any).name || entry.id}</span>
            <button class="oc-settings-pairing__text-btn" style="margin-left:auto;color:var(--accent,#c0392b)" @click=${entry.onRemove}>${t("settings.channels.pairing.remove")}</button>
          </div>
        `) : html`<div style="font-size:12px;color:var(--text-secondary)">${t("settings.channels.pairing.approvedEmpty")}</div>`}
      </div>
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
  .oc-settings-pairing__toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }
  .oc-settings-pairing__text-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 0;
    font-size: 12px;
    color: var(--text-secondary, #71717a);
    cursor: pointer;
    font-family: inherit;
    transition: color var(--transition, 0.18s ease);
  }
  .oc-settings-pairing__text-btn:hover { color: var(--text, #1a1a1a); }
  .oc-settings-pairing__text-btn svg { flex-shrink: 0; }
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
