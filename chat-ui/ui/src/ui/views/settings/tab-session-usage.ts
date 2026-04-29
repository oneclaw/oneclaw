/**
 * Settings: Session Usage Tab.
 * Read-only listing of all sessions across agents with cumulative token usage.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { SessionUsageRow } from "../../data/ipc-bridge.ts";
import "../../components/message-box.ts";

const s = {
  rows: [] as SessionUsageRow[],
  loading: false,
  error: null as string | null,
  initialized: false,
};

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  s.loading = true;
  state.requestUpdate();
  try {
    const data = await ipc.settingsListSessionUsage();
    s.rows = data?.rows ?? [];
    s.error = null;
  } catch (e: any) {
    s.rows = [];
    s.error = tWithDetail("settings.error.loadFailed", e?.message);
  } finally {
    s.loading = false;
    state.requestUpdate();
  }
}

export function resetSessionUsageTab() {
  s.initialized = false;
  s.rows = [];
  s.error = null;
  s.loading = false;
}

function formatDateTime(ms: number): string {
  if (!ms) return "";
  try { return new Date(ms).toLocaleString(); } catch { return ""; }
}

function formatToken(n: number | null): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

function renderRow(row: SessionUsageRow) {
  const label = row.customLabel || row.originLabel || t("settings.sessionUsage.unlabeled");
  return html`
    <div class="oc-session-usage__row">
      <div class="oc-session-usage__row-head">
        <span class="oc-session-usage__id">${row.agent}/${shortId(row.sessionId)}</span>
        <span class="oc-session-usage__label" title=${label}>${label}</span>
        <span class="oc-session-usage__time">${formatDateTime(row.updatedAt)}</span>
      </div>
      <div class="oc-session-usage__row-tokens">
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenIn")}</span> ${formatToken(row.input)}</span>
        <span class="oc-session-usage__sep">·</span>
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenOut")}</span> ${row.outputUnsupported ? html`<span class="oc-session-usage__unsupported">${t("settings.sessionUsage.unsupported")}</span>` : formatToken(row.output)}</span>
        <span class="oc-session-usage__sep">·</span>
        <span><span class="oc-session-usage__tag">${t("settings.sessionUsage.tokenCacheRead")}</span> ${row.cacheReadUnsupported ? html`<span class="oc-session-usage__unsupported">${t("settings.sessionUsage.unsupported")}</span>` : formatToken(row.cacheRead)}</span>
      </div>
    </div>
  `;
}

export function renderTabSessionUsage(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <h2 class="oc-settings__section-title">${t("settings.sessionUsage.pageTitle")}</h2>
      <p class="oc-settings__hint">${t("settings.sessionUsage.pageDesc")}</p>

      <div class="oc-settings__card">
        ${s.loading
          ? html`<div class="oc-session-usage__empty">…</div>`
          : s.rows.length
            ? html`<div class="oc-session-usage__list">${s.rows.map(renderRow)}</div>`
            : html`<div class="oc-session-usage__empty">${t("settings.sessionUsage.empty")}</div>`}
      </div>

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
    </div>
  `;
}

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-session-usage__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .oc-session-usage__row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--border-strong, var(--border, #d4d4d8));
    border-radius: var(--radius-md, 10px);
    background: var(--bg-secondary, #fbfbfb);
    box-shadow: none;
    transition: background var(--duration-fast, 0.12s) ease, border-color var(--duration-fast, 0.12s) ease;
  }
  .oc-session-usage__row:hover {
    background: var(--bg-hover, #ebebeb);
    border-color: var(--border-strong, var(--border, #d4d4d8));
  }
  .oc-session-usage__row-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
  .oc-session-usage__id {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size: 12px;
    color: var(--text, #3f3f46);
    background: var(--bg-input, #f5f5f5);
    border: 1px solid var(--border, #e4e4e7);
    padding: 2px 6px;
    border-radius: var(--radius-sm, 6px);
    flex-shrink: 0;
    user-select: text;
  }
  .oc-session-usage__label {
    min-width: 0;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-strong, #18181b);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .oc-session-usage__time {
    font-size: 11.5px;
    color: var(--text-muted, #a1a1aa);
    flex-shrink: 0;
  }
  .oc-session-usage__row-tokens {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding-top: 2px;
    font-size: 12.5px;
    color: var(--text-secondary, #71717a);
    font-variant-numeric: tabular-nums;
  }
  .oc-session-usage__tag {
    color: var(--text-muted, #a1a1aa);
    margin-right: 2px;
  }
  .oc-session-usage__unsupported {
    color: var(--text-muted, #a1a1aa);
    font-style: italic;
  }
  .oc-session-usage__sep {
    color: var(--text-muted, #d4d4d8);
  }
  .oc-session-usage__empty {
    font-size: 12.5px;
    color: var(--text-muted, #a1a1aa);
    padding: 4px 0;
  }
  @media (max-width: 640px) {
    .oc-session-usage__row-head {
      grid-template-columns: 1fr auto;
    }
    .oc-session-usage__id {
      grid-column: 1 / -1;
      width: fit-content;
    }
  }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];
