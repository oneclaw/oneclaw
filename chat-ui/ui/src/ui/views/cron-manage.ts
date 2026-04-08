/**
 * 定时任务管理视图 — 左右分栏：左侧任务列表，右侧详情/表单
 */
import { html, nothing } from "lit";
import type { CronJob, CronRunLogEntry, ChannelUiMetaEntry } from "../types.ts";
import type { CronFormState } from "../ui-types.ts";
import { formatRelativeTimestamp, formatMs } from "../format.ts";
import { formatCronSchedule, isExpiredOneShot } from "../presenter.ts";
import { t } from "../i18n.ts";

export type CronManageProps = {
  jobs: CronJob[];
  loading: boolean;
  error: string | null;
  expandedJobId: string | null;
  runs: CronRunLogEntry[];
  runsLoading: boolean;
  busy: boolean;
  showForm: boolean;
  editingJobId: string | null;
  form: CronFormState;
  channelMeta: ChannelUiMetaEntry[];
  onToggleExpand: (jobId: string) => void;
  onNavigateToSession: (sessionKey: string) => void;
  onRemove: (jobId: string) => void;
  onToggle: (jobId: string, enabled: boolean) => void;
  onRun: (jobId: string) => void;
  onEdit: (jobId: string) => void;
  onToggleForm: () => void;
  onFormChange: (patch: Partial<CronFormState>) => void;
  onAddJob: () => void;
};

function fmtRelative(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "n/a";
  return formatRelativeTimestamp(ms);
}

function statusClass(status: string): string {
  if (status === "ok") return "cm-status--ok";
  if (status === "error") return "cm-status--error";
  if (status === "skipped") return "cm-status--skipped";
  return "cm-status--na";
}

// ── 左侧列表项 ──

function renderListItem(job: CronJob, selected: boolean, props: CronManageProps) {
  const name = job.name || job.id;
  const expired = isExpiredOneShot(job);
  const enabled = job.enabled !== false;
  const schedule = formatCronSchedule(job);

  return html`
    <div
      class="cm-list__item ${selected ? "cm-list__item--selected" : ""} ${expired ? "cm-list__item--expired" : ""}"
      @click=${() => props.onToggleExpand(job.id)}
    >
      <div class="cm-list__item-top">
        <span class="cm-list__item-name">${name}</span>
        <span class="cm-list__item-pill ${expired ? "cm-pill--expired" : enabled ? "cm-pill--enabled" : "cm-pill--disabled"}">
          ${expired ? t("cron.expired") : enabled ? t("cron.enabled") : t("cron.disabled")}
        </span>
      </div>
      <div class="cm-list__item-schedule">${schedule}</div>
      <div class="cm-list__item-actions">
        <button class="cm-list__item-action" type="button"
          @click=${(e: Event) => { e.stopPropagation(); props.onEdit(job.id); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" />
          </svg>
        </button>
        <button class="cm-list__item-action cm-list__item-action--danger" type="button"
          @click=${(e: Event) => { e.stopPropagation(); if (confirm(t("cron.removeConfirm"))) props.onRemove(job.id); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ── 右侧详情面板 ──

function renderDetail(job: CronJob, props: CronManageProps) {
  const name = job.name || job.id;
  const enabled = job.enabled !== false;
  const expired = isExpiredOneShot(job);
  const status = job.state?.lastStatus ?? "n/a";
  const prompt = job.payload?.message ?? job.payload?.text ?? "";

  const sorted = props.runs.toSorted((a, b) => b.ts - a.ts);

  return html`
    <div class="cm-detail">
      <div class="cm-detail__header">
        <h3 class="cm-detail__name">${name}</h3>
        <div class="cm-detail__actions">
          ${expired
            ? nothing
            : html`
              <button class="cm-detail__action-btn" type="button" ?disabled=${props.busy}
                data-tooltip=${t("cron.run")} data-tooltip-pos="bottom"
                @click=${() => props.onRun(job.id)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6,3 20,12 6,21" /></svg>
              </button>
              <label class="cm-detail__toggle">
                <input type="checkbox" .checked=${enabled} ?disabled=${props.busy}
                  @change=${() => props.onToggle(job.id, !enabled)} />
                <span class="cm-detail__toggle-track"></span>
              </label>
            `}
        </div>
      </div>

      <div class="cm-detail__meta">
        <div class="cm-detail__meta-row">
          <span class="cm-detail__meta-label">${t("cron.schedule")}</span>
          <span class="cm-detail__meta-value">${formatCronSchedule(job)}</span>
        </div>
        ${prompt ? html`
          <div class="cm-detail__meta-row">
            <span class="cm-detail__meta-label">${t("cron.prompt")}</span>
            <span class="cm-detail__meta-value cm-detail__prompt">${prompt}</span>
          </div>` : nothing}
        <div class="cm-detail__meta-row">
          <span class="cm-detail__meta-label">${t("cron.nextRun")}</span>
          <span class="cm-detail__meta-value">${fmtRelative(job.state?.nextRunAtMs)}</span>
        </div>
        <div class="cm-detail__meta-row">
          <span class="cm-detail__meta-label">${t("cron.lastRun")}</span>
          <span class="cm-detail__meta-value">${fmtRelative(job.state?.lastRunAtMs)}</span>
        </div>
        <div class="cm-detail__meta-row">
          <span class="cm-detail__meta-label">Status</span>
          <span class="cm-detail__status-pill ${statusClass(status)}">${status}</span>
        </div>
      </div>

      <div class="cm-detail__history">
        <div class="cm-detail__history-title">${t("cron.history")}</div>
        ${props.runsLoading
          ? html`<div class="muted">Loading…</div>`
          : sorted.length === 0
            ? html`<div class="muted">${t("cron.noRuns")}</div>`
            : sorted.map((entry) => {
                const st = entry.status ?? "n/a";
                const summary = (entry as any).summary as string | undefined;
                const error = (entry as any).error as string | undefined;
                const hasSession = typeof entry.sessionKey === "string" && entry.sessionKey.trim().length > 0;
                return html`
                  <div class="cm-detail__run-card">
                    <div class="cm-detail__run">
                      <span class="cm-detail__run-status ${statusClass(st)}">${st}</span>
                      <span class="cm-detail__run-time">${formatMs(entry.ts)}</span>
                      ${entry.durationMs != null ? html`<span class="cm-detail__run-dur">${entry.durationMs}ms</span>` : nothing}
                      ${hasSession ? html`<button class="cm-detail__run-link" type="button"
                        @click=${() => props.onNavigateToSession(entry.sessionKey!)}>${t("cron.openChat")}</button>` : nothing}
                    </div>
                    ${summary ? html`<div class="cm-detail__run-summary">${summary}</div>` : nothing}
                    ${error ? html`<div class="cm-detail__run-error">${error}</div>` : nothing}
                  </div>`;
              })
        }
      </div>
    </div>
  `;
}

// ── 右侧：新建表单 ──

function renderScheduleFields(props: CronManageProps) {
  const form = props.form;
  if ((form.scheduleKind as string) === "daily") {
    // dailyTime stored in cronExpr as "HH:MM" for convenience
    const time = /^\d{2}:\d{2}$/.test(form.cronExpr) ? form.cronExpr : "10:00";
    return html`
      <label class="cron-form__field">
        <span class="cron-form__label">${t("cron.form.dailyTime")}</span>
        <input class="cron-form__input" type="time" .value=${time}
          @input=${(e: Event) => props.onFormChange({ cronExpr: (e.target as HTMLInputElement).value })} />
      </label>`;
  }
  if (form.scheduleKind === "at") {
    return html`
      <label class="cron-form__field">
        <span class="cron-form__label">${t("cron.form.runAt")}</span>
        <input class="cron-form__input" type="datetime-local" .value=${form.scheduleAt}
          @input=${(e: Event) => props.onFormChange({ scheduleAt: (e.target as HTMLInputElement).value })} />
      </label>`;
  }
  if (form.scheduleKind === "every") {
    return html`
      <div class="cron-form__row">
        <label class="cron-form__field cron-form__field--grow">
          <span class="cron-form__label">${t("cron.form.every")}</span>
          <input class="cron-form__input" type="number" min="1" .value=${form.everyAmount}
            @input=${(e: Event) => props.onFormChange({ everyAmount: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="cron-form__field cron-form__field--grow">
          <span class="cron-form__label">${t("cron.form.unit")}</span>
          <select class="cron-form__select" .value=${form.everyUnit}
            @change=${(e: Event) => props.onFormChange({ everyUnit: (e.target as HTMLSelectElement).value })}>
            <option value="minutes">${t("cron.form.minutes")}</option>
            <option value="hours">${t("cron.form.hours")}</option>
            <option value="days">${t("cron.form.days")}</option>
          </select>
        </label>
      </div>`;
  }
  return html`
    <div class="cron-form__row">
      <label class="cron-form__field cron-form__field--grow">
        <span class="cron-form__label">${t("cron.form.cronExpr")}</span>
        <input class="cron-form__input" .value=${form.cronExpr} placeholder="0 7 * * *"
          @input=${(e: Event) => props.onFormChange({ cronExpr: (e.target as HTMLInputElement).value })} />
      </label>
      <label class="cron-form__field cron-form__field--grow">
        <span class="cron-form__label">${t("cron.form.timezone")}</span>
        <input class="cron-form__input" .value=${form.cronTz} placeholder="Asia/Shanghai"
          @input=${(e: Event) => props.onFormChange({ cronTz: (e.target as HTMLInputElement).value })} />
      </label>
    </div>`;
}

function renderForm(props: CronManageProps) {
  const form = props.form;
  const isEdit = props.editingJobId != null;
  return html`
    <div class="cm-detail">
      <h3 class="cm-detail__form-title">${isEdit ? t("cron.form.editTitle") : t("cron.form.newTitle")}</h3>
      <div class="cron-form">
        <label class="cron-form__field">
          <span class="cron-form__label">${t("cron.form.name")}</span>
          <input class="cron-form__input" .value=${form.name} placeholder=${t("cron.form.namePlaceholder")}
            @input=${(e: Event) => props.onFormChange({ name: (e.target as HTMLInputElement).value })} />
        </label>
        <label class="cron-form__field">
          <span class="cron-form__label">${t("cron.schedule")}</span>
          <select class="cron-form__select" .value=${form.scheduleKind}
            @change=${(e: Event) => props.onFormChange({ scheduleKind: (e.target as HTMLSelectElement).value as CronFormState["scheduleKind"] })}>
            <option value="daily">${t("cron.form.daily")}</option>
            <option value="every">${t("cron.form.every")}</option>
            <option value="at">${t("cron.form.once")}</option>
            <option value="cron">Cron</option>
          </select>
        </label>
        ${renderScheduleFields(props)}
        <label class="cron-form__field">
          <span class="cron-form__label">${t("cron.prompt")}</span>
          <textarea class="cron-form__textarea" rows="4" .value=${form.payloadText}
            placeholder=${t("cron.form.promptPlaceholder")}
            @input=${(e: Event) => props.onFormChange({ payloadText: (e.target as HTMLTextAreaElement).value })}></textarea>
        </label>
        <div class="cron-form__row">
          <label class="cron-form__field cron-form__field--grow">
            <span class="cron-form__label">${t("cron.form.session")}</span>
            <select class="cron-form__select" .value=${form.sessionTarget}
              @change=${(e: Event) => props.onFormChange({ sessionTarget: (e.target as HTMLSelectElement).value })}>
              <option value="main">${t("cron.form.sessionMain")}</option>
              <option value="isolated">${t("cron.form.sessionIsolated")}</option>
            </select>
          </label>
          <label class="cron-form__field cron-form__field--grow">
            <span class="cron-form__label">${t("cron.form.delivery")}</span>
            <select class="cron-form__select" .value=${form.deliveryMode}
              @change=${(e: Event) => props.onFormChange({ deliveryMode: (e.target as HTMLSelectElement).value })}>
              <option value="announce">${t("cron.form.deliveryAnnounce")}</option>
              <option value="none">${t("cron.form.deliveryNone")}</option>
            </select>
          </label>
        </div>
        ${form.deliveryMode === "announce" && props.channelMeta.length > 0 ? html`
          <div class="cron-form__row">
            <label class="cron-form__field cron-form__field--grow">
              <span class="cron-form__label">${t("cron.form.channel")}</span>
              <select class="cron-form__select" .value=${form.deliveryChannel || "last"}
                @change=${(e: Event) => props.onFormChange({ deliveryChannel: (e.target as HTMLSelectElement).value })}>
                <option value="last">${t("cron.form.channelLast")}</option>
                ${props.channelMeta.map((ch) => html`<option value=${ch.id}>${ch.label || ch.id}</option>`)}
              </select>
            </label>
            <label class="cron-form__field cron-form__field--grow">
              <span class="cron-form__label">${t("cron.form.deliveryTo")}</span>
              <input class="cron-form__input" .value=${form.deliveryTo}
                placeholder=${t("cron.form.deliveryToPlaceholder")}
                @input=${(e: Event) => props.onFormChange({ deliveryTo: (e.target as HTMLInputElement).value })} />
            </label>
          </div>
        ` : nothing}
        <div class="cron-form__footer">
          <button class="cron-form__btn cron-form__btn--secondary" type="button"
            @click=${props.onToggleForm}>${t("cron.form.cancel")}</button>
          <button class="cron-form__btn cron-form__btn--primary" type="button"
            ?disabled=${props.busy || !form.name.trim() || !form.payloadText.trim()}
            @click=${props.onAddJob}>${props.busy ? t("cron.form.saving") : isEdit ? t("cron.form.save") : t("cron.form.create")}</button>
        </div>
      </div>
    </div>
  `;
}

// ── 右侧：空状态 ──

function renderDetailEmpty() {
  return html`
    <div class="cm-detail cm-detail--empty">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.25">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <p class="muted" style="margin:12px 0 0; font-size:13px;">${t("cron.selectHint")}</p>
    </div>
  `;
}

// ── 全屏空状态（无任务时） ──

function renderGlobalEmpty(props: CronManageProps) {
  return html`
    <div class="cm-empty">
      <svg class="cm-empty__icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
      </svg>
      <p class="cm-empty__title">${t("cron.noJobs")}</p>
      <p class="cm-empty__desc">${t("cron.emptyHint")}</p>
      <button class="cm-empty__action" type="button" @click=${props.onToggleForm}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        ${t("cron.form.createFirst")}
      </button>
    </div>
  `;
}

// ── 主渲染 ──

export function renderCronManage(props: CronManageProps) {
  const hasJobs = props.jobs.length > 0;
  const selectedJob = props.expandedJobId ? props.jobs.find((j) => j.id === props.expandedJobId) : null;

  // 无任务且不在创建中 → 全屏空状态（有错误时显示错误而非空状态）
  if (!hasJobs && !props.showForm && !props.loading && !props.error) {
    return renderGlobalEmpty(props);
  }

  return html`
    <div class="cm-layout">
      <!-- 左侧列表 -->
      <div class="cm-list">
        <div class="cm-list__top">
          <h2 class="cm-list__title">${t("cron.title")}</h2>
        </div>
        <div class="cm-list__new-wrap">
          <button class="cm-list__new-btn" type="button" @click=${props.onToggleForm}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            ${t("cron.form.new")}
          </button>
        </div>
        <div class="cm-list__items">
          ${props.loading
            ? html`<div class="muted" style="padding:16px;">Loading…</div>`
            : props.jobs.map((job) => renderListItem(job, job.id === props.expandedJobId, props))}
        </div>
      </div>

      <!-- 右侧详情 -->
      <div class="cm-layout__detail">
        ${props.error ? html`<div class="cm-detail__error">${props.error}</div>` : nothing}
        ${props.showForm
          ? renderForm(props)
          : selectedJob
            ? renderDetail(selectedJob, props)
            : renderDetailEmpty()}
      </div>
    </div>
  `;
}
