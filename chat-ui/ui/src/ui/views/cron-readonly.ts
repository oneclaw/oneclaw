/**
 * 只读定时任务视图 — 展示任务卡片列表，点击展开运行历史
 */
import { html, nothing } from "lit";
import type { CronJob, CronRunLogEntry } from "../types.ts";
import { formatRelativeTimestamp, formatMs } from "../format.ts";
import { formatCronSchedule } from "../presenter.ts";
import { t } from "../i18n.ts";

export type CronReadonlyProps = {
  jobs: CronJob[];
  loading: boolean;
  error: string | null;
  expandedJobId: string | null;
  runs: CronRunLogEntry[];
  runsLoading: boolean;
  onToggleExpand: (jobId: string) => void;
  onNavigateToSession: (sessionKey: string) => void;
};

// 相对时间格式化，缺失值显示 n/a
function fmtRelative(ms?: number): string {
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    return "n/a";
  }
  return formatRelativeTimestamp(ms);
}

// 状态对应 CSS 后缀
function statusClass(status: string): string {
  if (status === "ok") return "cron-readonly__status--ok";
  if (status === "error") return "cron-readonly__status--error";
  if (status === "skipped") return "cron-readonly__status--skipped";
  return "cron-readonly__status--na";
}

// 截断文本
function truncate(text: string | undefined, max: number): string {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// 渲染单条运行记录
function renderRun(
  entry: CronRunLogEntry,
  onNavigateToSession: (sessionKey: string) => void,
) {
  const status = entry.status ?? "n/a";
  const hasSession =
    typeof entry.sessionKey === "string" && entry.sessionKey.trim().length > 0;

  return html`
    <div class="cron-readonly__run" @click=${(e: Event) => e.stopPropagation()}>
      <div class="cron-readonly__run-main">
        <span class="cron-readonly__run-status ${statusClass(status)}">${status}</span>
        <span>${formatMs(entry.ts)}</span>
        ${entry.durationMs != null ? html`<span>${entry.durationMs}ms</span>` : nothing}
      </div>
      ${entry.summary ? html`<div class="cron-readonly__run-summary">${entry.summary}</div>` : nothing}
      ${entry.error ? html`<div class="cron-readonly__run-error">${entry.error}</div>` : nothing}
      ${
        hasSession
          ? html`<a
              class="cron-readonly__run-link"
              href="javascript:void(0)"
              @click=${(e: Event) => {
                e.preventDefault();
                e.stopPropagation();
                onNavigateToSession(entry.sessionKey!);
              }}
            >Open chat &rarr;</a>`
          : nothing
      }
    </div>
  `;
}

// 渲染运行历史面板
function renderHistory(props: CronReadonlyProps) {
  if (props.runsLoading) {
    return html`<div class="cron-readonly__history">
      <div class="cron-readonly__history-title">${t("cron.history")}</div>
      <div class="muted">Loading…</div>
    </div>`;
  }

  const sorted = props.runs.toSorted((a, b) => b.ts - a.ts);

  return html`
    <div class="cron-readonly__history" @click=${(e: Event) => e.stopPropagation()}>
      <div class="cron-readonly__history-title">${t("cron.history")}</div>
      ${
        sorted.length === 0
          ? html`<div class="muted">${t("cron.noRuns")}</div>`
          : sorted.map((entry) => renderRun(entry, props.onNavigateToSession))
      }
    </div>
  `;
}

// 渲染单张任务卡片
function renderCard(job: CronJob, props: CronReadonlyProps) {
  const expanded = props.expandedJobId === job.id;
  const name = job.name || job.id;
  const enabled = job.enabled !== false;
  const status = job.state?.lastStatus ?? "n/a";
  const prompt = job.payload?.message ?? job.payload?.text ?? "";

  return html`
    <div
      class="cron-readonly__card ${expanded ? "cron-readonly__card--expanded" : ""}"
      @click=${() => props.onToggleExpand(job.id)}
    >
      <div class="cron-readonly__card-header">
        <span class="cron-readonly__card-name">${name}</span>
        <span class="cron-readonly__pill ${enabled ? "cron-readonly__pill--enabled" : "cron-readonly__pill--disabled"}">
          ${enabled ? "enabled" : "disabled"}
        </span>
      </div>

      <div class="cron-readonly__card-detail">
        <span class="cron-readonly__detail-label">${t("cron.schedule")}</span>
        <span class="cron-readonly__detail-value">${formatCronSchedule(job)}</span>
      </div>

      <div class="cron-readonly__card-detail">
        <span class="cron-readonly__detail-label">${t("cron.prompt")}</span>
        <span class="cron-readonly__detail-value">${truncate(prompt, 80)}</span>
      </div>

      <div class="cron-readonly__card-meta">
        <span>${t("cron.nextRun")}: ${fmtRelative(job.state?.nextRunAtMs)}</span>
        <span>${t("cron.lastRun")}: ${fmtRelative(job.state?.lastRunAtMs)}</span>
        <span class="cron-readonly__status-pill ${statusClass(status)}">${status}</span>
      </div>

      ${expanded ? renderHistory(props) : nothing}
    </div>
  `;
}

// 主渲染函数
export function renderCronReadonly(props: CronReadonlyProps) {
  return html`
    <div class="cron-readonly">
      <div class="cron-readonly__header">
        <h2 class="cron-readonly__title">${t("cron.title")}</h2>
      </div>

      ${
        props.loading
          ? html`<div class="muted">Loading…</div>`
          : props.error
            ? html`<div class="muted">${props.error}</div>`
            : props.jobs.length === 0
              ? html`<div class="muted">${t("cron.noRuns")}</div>`
              : html`
                  <div class="cron-readonly__list">
                    ${props.jobs.map((job) => renderCard(job, props))}
                  </div>
                `
      }
    </div>
  `;
}
