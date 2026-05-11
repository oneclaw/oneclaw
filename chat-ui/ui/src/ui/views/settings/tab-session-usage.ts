import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import "../../components/message-box.ts";
import { formatTokens } from "../usage-metrics.ts";
import {
  beginSessionUsageLoad,
  loadSessionUsageSnapshot,
  resolveSessionUsageDisplayLabel,
  SESSION_USAGE_DETAIL_LIST_MAX_HEIGHT_PX,
  SESSION_USAGE_DETAIL_ROW_HEIGHT_PX,
  type SessionUsageRow,
  type UsageTotals,
} from "./tab-session-usage.lib.ts";

const s = {
  rows: [] as SessionUsageRow[],
  totals: null as UsageTotals | null,
  totalSessions: 0,
  loading: false,
  error: null as string | null,
  initialized: false,
  wasConnected: false,
};

async function init(state: AppViewState) {
  const client = state.client;
  if (!beginSessionUsageLoad(s, state.connected, !!client) || !client) return;
  s.error = null;
  state.requestUpdate();
  try {
    const mapped = await loadSessionUsageSnapshot((method, params) => client.request(method, params));
    s.rows = mapped.rows;
    s.totals = mapped.totals;
    s.totalSessions = mapped.totalSessions;
    s.error = null;
  } catch {
    s.rows = [];
    s.totals = null;
    s.totalSessions = 0;
    s.error = t("settings.sessionUsage.loadFailedHint");
  } finally {
    s.loading = false;
    state.requestUpdate();
  }
}

export function resetSessionUsageTab() {
  s.initialized = false;
  s.rows = [];
  s.totals = null;
  s.totalSessions = 0;
  s.error = null;
  s.loading = false;
  s.wasConnected = false;
}

function formatDateTime(ms: number): string {
  return ms ? new Date(ms).toLocaleString() : "";
}

function formatToken(n: number | null): string {
  return n == null || !Number.isFinite(n) ? "—" : formatTokens(n);
}

// cacheWrite is intentionally omitted from totals/rows — see tab-session-usage.lib.ts.
function renderTotals(totals: UsageTotals) {
  return html`
    <div class="oc-session-usage__totals">
      <div class="oc-session-usage__totals-label">${t("settings.sessionUsage.totals.label")}</div>
      <div class="oc-session-usage__totals-tokens">
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenIn")}</span> ${formatToken(totals.input)}</span>
        <span class="oc-session-usage__sep">·</span>
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenOut")}</span> ${formatToken(totals.output)}</span>
        <span class="oc-session-usage__sep">·</span>
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenCacheRead")}</span> ${formatToken(totals.cacheRead)}</span>
      </div>
    </div>
  `;
}

function renderRow(row: SessionUsageRow) {
  const displayLabel = resolveSessionUsageDisplayLabel(row);
  return html`
    <div class="oc-session-usage__row">
      <span
        class="oc-session-usage__label"
        title=${displayLabel}
      >${displayLabel}</span>
      <div class="oc-session-usage__row-tokens">
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenIn")}</span> ${formatToken(row.input)}</span>
        <span class="oc-session-usage__sep">·</span>
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenOut")}</span> ${formatToken(row.output)}</span>
        <span class="oc-session-usage__sep">·</span>
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenCacheRead")}</span> ${formatToken(row.cacheRead)}</span>
      </div>
      <span class="oc-session-usage__time">${formatDateTime(row.updatedAt)}</span>
    </div>
  `;
}

function renderDetailsBody(rows: SessionUsageRow[], loading: boolean) {
  if (loading) return html`<div class="oc-session-usage__empty">…</div>`;
  if (!rows.length) return html`<div class="oc-session-usage__empty">${t("settings.sessionUsage.empty")}</div>`;
  return html`<div class="oc-session-usage__list">${rows.map(renderRow)}</div>`;
}

export function renderTabSessionUsage(state: AppViewState) {
  // Reset on disconnect so a stale "load failed" doesn't persist after the gateway comes back.
  if (s.wasConnected && !state.connected) s.initialized = false;
  s.wasConnected = state.connected;
  if (!s.initialized && !s.loading && state.connected && state.client) init(state);

  return html`
    <div class="oc-settings__section">
      <h2 class="oc-settings__section-title">${t("settings.sessionUsage.pageTitle")}</h2>
      <p class="oc-settings__hint">${t("settings.sessionUsage.pageDesc")}</p>

      ${s.totals && s.rows.length ? renderTotals(s.totals) : nothing}

      <div class="oc-settings__card">
        <div class="oc-settings__card-title oc-session-usage__details-title">${t("settings.sessionUsage.details.title")}</div>
        ${renderDetailsBody(s.rows, s.loading)}
      </div>

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
    </div>
  `;
}

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-session-usage__totals {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 0 2px;
    margin-bottom: 16px;
    background: transparent;
  }
  .oc-session-usage__totals-label {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary, #888);
  }
  .oc-session-usage__totals-tokens {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #a1a1aa);
    font-variant-numeric: tabular-nums;
  }
  .oc-settings__card-title.oc-session-usage__details-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary, #a1a1aa);
  }
  .oc-session-usage__list {
    display: flex;
    flex-direction: column;
    gap: 0;
    max-height: ${SESSION_USAGE_DETAIL_LIST_MAX_HEIGHT_PX}px;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    padding-right: 2px;
  }
  .oc-session-usage__row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    min-height: ${SESSION_USAGE_DETAIL_ROW_HEIGHT_PX}px;
    padding: 8px 0;
    border-bottom: 1px solid var(--border, #e4e4e7);
    background: transparent;
    box-sizing: border-box;
  }
  .oc-session-usage__row:last-child { border-bottom: none; }
  .oc-session-usage__label {
    flex: 1 1 0;
    min-width: 0;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary, #888);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .oc-session-usage__row-tokens {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px;
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary, #888);
    font-variant-numeric: tabular-nums;
  }
  .oc-session-usage__time {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary, #888);
  }
  .oc-session-usage__tag {
    color: var(--text-secondary, #888);
    margin-right: 2px;
  }
  .oc-session-usage__totals-tokens .oc-session-usage__tag {
    color: var(--text-secondary, #a1a1aa);
  }
  .oc-session-usage__sep {
    color: var(--text-secondary, #888);
  }
  .oc-session-usage__empty {
    font-size: 13px;
    font-weight: 400;
    color: var(--text-secondary, #888);
    padding: 4px 0;
  }
  @media (max-width: 640px) {
    .oc-session-usage__row {
      flex-wrap: wrap;
    }
    .oc-session-usage__time {
      margin-left: auto;
    }
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
