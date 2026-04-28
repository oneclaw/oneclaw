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

// 跟踪正在批准/拒绝的 pairing code，避免重复点击并驱动按钮 spinner。
const inflightApprove = new Set<string>();
const inflightReject = new Set<string>();
const inflightRefresh = new Set<"feishu" | "wecom">();

function inflightKey(platform: "feishu" | "wecom", code: string): string {
  return `${platform}:${code}`;
}

async function handleRefresh(state: AppViewState, platform: "feishu" | "wecom", refresh: () => void | Promise<void>) {
  if (inflightRefresh.has(platform)) return;
  inflightRefresh.add(platform);
  state.requestUpdate();
  try {
    await refresh();
  } finally {
    inflightRefresh.delete(platform);
    state.requestUpdate();
  }
}

async function handleApprove(state: AppViewState, platform: "feishu" | "wecom", req: PairingRequest, panelState: PairingPanelState, refresh: () => void) {
  const key = inflightKey(platform, req.code);
  if (inflightApprove.has(key) || inflightReject.has(key)) return;
  inflightApprove.add(key);
  state.requestUpdate();
  try {
    const fn = platform === "feishu" ? ipc.settingsApproveFeishuPairing : ipc.settingsApproveWecomPairing;
    await fn({ code: req.code, id: req.id, name: req.name });
  } finally {
    inflightApprove.delete(key);
    refresh();
  }
}

async function handleReject(state: AppViewState, platform: "feishu" | "wecom", req: PairingRequest, refresh: () => void) {
  const key = inflightKey(platform, req.code);
  if (inflightApprove.has(key) || inflightReject.has(key)) return;
  inflightReject.add(key);
  state.requestUpdate();
  try {
    const fn = platform === "feishu" ? ipc.settingsRejectFeishuPairing : ipc.settingsRejectWecomPairing;
    await fn({ code: req.code, id: req.id, name: req.name });
  } finally {
    inflightReject.delete(key);
    refresh();
  }
}

async function handleRemoveApproved(state: AppViewState, platform: "feishu" | "wecom", entry: ApprovedEntry, refresh: () => void) {
  const fn = platform === "feishu" ? ipc.settingsRemoveFeishuApproved : ipc.settingsRemoveWecomApproved;
  await fn({ kind: entry.kind, id: entry.id });
  refresh();
}

// Lucide icons (14x14)
const refreshIcon = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`;
const plusIcon = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const trashIcon = html`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>`;
const checkIcon = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const xIcon = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
const spinnerIcon = html`<svg class="oc-settings-pairing__spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

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
          <div class="oc-settings-pairing__toolbar-actions">
            <button class="oc-settings-pairing__icon-btn"
              ?disabled=${inflightRefresh.has(platform)}
              @click=${() => handleRefresh(state, platform, refresh)}
              data-tooltip=${t("settings.provider.usage.refresh")}
              data-tooltip-pos="bottom"
              aria-label=${t("settings.provider.usage.refresh")}>${inflightRefresh.has(platform) ? spinnerIcon : refreshIcon}</button>
            <button class="oc-settings-pairing__icon-btn" @click=${options!.onAddGroup}
              data-tooltip=${t("settings.channels.feishu.addGroup")}
              data-tooltip-pos="bottom"
              aria-label=${t("settings.channels.feishu.addGroup")}>${plusIcon}</button>
          </div>
        </div>
      ` : nothing}

      <!-- Pending -->
      <div class="oc-settings-pairing__section">
        <div class="oc-settings__label">${t("settings.channels.pairing.pending")}</div>
        ${panelState.pairingRequests.length ? panelState.pairingRequests.map(req => {
          const key = inflightKey(platform, req.code);
          const approving = inflightApprove.has(key);
          const rejecting = inflightReject.has(key);
          const busy = approving || rejecting;
          return html`
          <div class="oc-settings-pairing__item">
            <span class="oc-settings-pairing__name">${req.name || req.id}</span>
            <button class="oc-settings-pairing__action-btn oc-settings-pairing__action-btn--reject"
              ?disabled=${busy}
              @click=${() => handleReject(state, platform, req, refresh)}
              data-tooltip=${t("settings.channels.pairing.reject")}
              data-tooltip-pos="left"
              aria-label=${t("settings.channels.pairing.reject")}>${rejecting ? spinnerIcon : xIcon}</button>
            <button class="oc-settings-pairing__action-btn oc-settings-pairing__action-btn--approve"
              ?disabled=${busy}
              @click=${() => handleApprove(state, platform, req, panelState, refresh)}
              data-tooltip=${t("settings.channels.pairing.approve")}
              data-tooltip-pos="left"
              aria-label=${t("settings.channels.pairing.approve")}>${approving ? spinnerIcon : checkIcon}</button>
          </div>
        `;
        }) : html`<div style="font-size:12px;color:var(--text-secondary)">${t("settings.channels.pairing.empty")}</div>`}
      </div>

      <!-- Approved -->
      <div class="oc-settings-pairing__section" style="margin-top:12px">
        <div class="oc-settings__label">${t("settings.channels.pairing.approved")}</div>
        ${allApproved.length ? allApproved.map(entry => html`
          <div class="oc-settings-pairing__item">
            <span style="font-size:11px;color:var(--text-secondary)">${entry.kind}</span>
            <span class="oc-settings-pairing__name">${(entry as any).name || entry.id}</span>
            <button class="oc-settings-pairing__icon-btn oc-settings-pairing__icon-btn--danger"
              style="margin-left:auto"
              @click=${entry.onRemove}
              data-tooltip=${t("settings.channels.pairing.remove")}
              data-tooltip-pos="left"
              aria-label=${t("settings.channels.pairing.remove")}>${trashIcon}</button>
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
  .oc-settings-pairing__toolbar-actions {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .oc-settings-pairing__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm, 6px);
    color: var(--text-secondary, #71717a);
    cursor: pointer;
    transition: background var(--transition, 0.18s ease), color var(--transition, 0.18s ease);
  }
  .oc-settings-pairing__icon-btn:hover {
    color: var(--text, #1a1a1a);
    background: var(--bg-hover, rgba(0,0,0,0.06));
  }
  .oc-settings-pairing__icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--focus-ring, rgba(192,57,43,0.4)); }
  .oc-settings-pairing__icon-btn svg { flex-shrink: 0; }
  .oc-settings-pairing__icon-btn--danger:hover {
    color: var(--accent, #c0392b);
    background: rgba(192,57,43,0.08);
  }
  .oc-settings-pairing__action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid var(--border, rgba(0,0,0,0.12));
    background: transparent;
    color: var(--text-secondary, #71717a);
    cursor: pointer;
    transition: background var(--transition, 0.18s ease), color var(--transition, 0.18s ease), border-color var(--transition, 0.18s ease);
  }
  .oc-settings-pairing__action-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--focus-ring, rgba(192,57,43,0.4)); }
  .oc-settings-pairing__action-btn svg { flex-shrink: 0; }
  .oc-settings-pairing__action-btn:disabled { cursor: default; opacity: 0.6; }
  .oc-settings-pairing__action-btn--reject:not(:disabled):hover {
    color: var(--accent, #c0392b);
    border-color: var(--accent, #c0392b);
    background: rgba(192,57,43,0.06);
  }
  .oc-settings-pairing__action-btn--approve:not(:disabled):hover {
    color: var(--text, #1a1a1a);
    background: var(--bg-hover, rgba(0,0,0,0.06));
  }
  .oc-settings-pairing__spinner {
    animation: oc-settings-pairing-spin 0.85s linear infinite;
  }
  @keyframes oc-settings-pairing-spin {
    to { transform: rotate(360deg); }
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
