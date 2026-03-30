import { html, nothing } from "lit";
import { icons } from "../icons.ts";
import { t } from "../i18n.ts";

// ── 旧弹窗接口（保留向后兼容，app-render.ts 仍使用） ──

export interface FeedbackDialogState {
  open: boolean;
  content: string;
  screenshots: string[];
  screenshotPreviews: string[];
  previewSrc: string | null;
  includeLogs: boolean;
  submitting: boolean;
  error: string | null;
}

export function createFeedbackDialogState(): FeedbackDialogState {
  return {
    open: false,
    content: "",
    screenshots: [],
    screenshotPreviews: [],
    previewSrc: null,
    includeLogs: true,
    submitting: false,
    error: null,
  };
}

export interface FeedbackCallbacks {
  onClose: () => void;
  onSubmit: () => void;
  onContentChange: (value: string) => void;
  onToggleLogs: (checked: boolean) => void;
  onAddScreenshots: (files: FileList) => void;
  onRemoveScreenshot: (index: number) => void;
  onPaste: (e: ClipboardEvent) => void;
  onPreviewScreenshot: (src: string | null) => void;
}

export function renderFeedbackButton(onClick: () => void) {
  return html`
    <button
      class="feedback-trigger-btn"
      type="button"
      @click=${onClick}
      title=${t("feedback.title")}
      aria-label=${t("feedback.title")}
    >
      ${icons.bug}
      <span class="feedback-trigger-label">${t("feedback.title")}</span>
    </button>
  `;
}

export function renderFeedbackDialog(
  state: FeedbackDialogState,
  callbacks: FeedbackCallbacks,
) {
  if (!state.open) return nothing;

  return html`
    <div
      class="exec-approval-overlay"
      role="dialog"
      aria-modal="true"
      @click=${(e: Event) => {
        if ((e.target as HTMLElement).classList.contains("exec-approval-overlay")) {
          callbacks.onClose();
        }
      }}
    >
      <div class="feedback-card">
        <div class="feedback-header">
          <div class="feedback-title">${t("feedback.title")}</div>
          <button
            class="feedback-close"
            type="button"
            @click=${callbacks.onClose}
            aria-label="Close"
          >${icons.x}</button>
        </div>

        <textarea
          class="feedback-textarea"
          placeholder=${t("feedback.placeholder")}
          .value=${state.content}
          @input=${(e: Event) => callbacks.onContentChange((e.target as HTMLTextAreaElement).value)}
          @paste=${callbacks.onPaste}
          ?disabled=${state.submitting}
          rows="5"
        ></textarea>

        <div class="feedback-screenshots">
          ${state.screenshotPreviews.map(
            (src, i) => html`
              <div class="feedback-screenshot-item">
                <img src=${src} alt="screenshot"
                  @click=${() => callbacks.onPreviewScreenshot(src)}
                  style="cursor: pointer"
                />
                <button
                  class="feedback-screenshot-remove"
                  type="button"
                  @click=${() => callbacks.onRemoveScreenshot(i)}
                  ?disabled=${state.submitting}
                >${icons.x}</button>
              </div>
            `,
          )}

          <label class="feedback-screenshot-add">
            <input
              type="file"
              accept="image/*"
              multiple
              @change=${(e: Event) => {
                const files = (e.target as HTMLInputElement).files;
                if (files) callbacks.onAddScreenshots(files);
                (e.target as HTMLInputElement).value = "";
              }}
              ?disabled=${state.submitting}
              style="display: none"
            />
            ${icons.image}
            <span>${t("feedback.addScreenshot")}</span>
          </label>
        </div>

        <div class="feedback-logs-toggle">
          <span>${t("feedback.includeLogs")}</span>
          <label class="toggle-switch">
            <input
              type="checkbox"
              .checked=${state.includeLogs}
              @change=${(e: Event) => callbacks.onToggleLogs((e.target as HTMLInputElement).checked)}
              ?disabled=${state.submitting}
            />
            <span class="toggle-slider"></span>
          </label>
        </div>

        ${state.error ? html`<div class="feedback-error">${state.error}</div>` : nothing}

        <div class="feedback-actions">
          <button
            class="btn"
            type="button"
            @click=${callbacks.onClose}
            ?disabled=${state.submitting}
          >${t("feedback.cancel")}</button>
          <button
            class="btn primary"
            type="button"
            @click=${callbacks.onSubmit}
            ?disabled=${state.submitting || !state.content.trim()}
          >
            ${state.submitting ? t("feedback.submitting") : t("feedback.submit")}
          </button>
        </div>
      </div>
    </div>
    ${state.previewSrc ? html`
      <div
        class="feedback-preview-overlay"
        @click=${() => callbacks.onPreviewScreenshot(null)}
      >
        <img src=${state.previewSrc} alt="preview" class="feedback-preview-img" />
      </div>
    ` : nothing}
  `;
}

// ── 反馈面板（新：列表 / 新建 / 详情三视图） ──

export type FeedbackPanelView = "list" | "new" | "detail";

interface FeedbackThread {
  id: number;
  content: string;
  status: string;
  has_reply: boolean;
  created_at: string;
  updated_at: string;
}

interface FeedbackMessage {
  id: number;
  thread_id: number;
  role: "user" | "admin";
  content: string;
  created_at: string;
}

export interface FeedbackPanelState {
  view: FeedbackPanelView;
  // list
  threads: FeedbackThread[];
  threadsLoading: boolean;
  threadsError: string | null;
  // new
  newContent: string;
  newEmail: string;
  newScreenshots: string[];
  newScreenshotPreviews: string[];
  newPreviewSrc: string | null;
  newIncludeLogs: boolean;
  newSubmitting: boolean;
  newError: string | null;
  // detail
  detailThread: FeedbackThread | null;
  detailMessages: FeedbackMessage[];
  detailLoading: boolean;
  detailReplyContent: string;
  detailReplySending: boolean;
}

export function createFeedbackPanelState(): FeedbackPanelState {
  return {
    view: "list",
    threads: [],
    threadsLoading: false,
    threadsError: null,
    newContent: "",
    newEmail: "",
    newScreenshots: [],
    newScreenshotPreviews: [],
    newPreviewSrc: null,
    newIncludeLogs: true,
    newSubmitting: false,
    newError: null,
    detailThread: null,
    detailMessages: [],
    detailLoading: false,
    detailReplyContent: "",
    detailReplySending: false,
  };
}

// 相对时间格式化
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return "<1m";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}mo`;
}

export interface FeedbackPanelCallbacks {
  onLoadThreads: () => void;
  onOpenNew: () => void;
  onOpenDetail: (id: number) => void;
  onBackToList: () => void;
  // new form
  onNewContentChange: (value: string) => void;
  onNewEmailChange: (value: string) => void;
  onNewToggleLogs: (checked: boolean) => void;
  onNewAddScreenshots: (files: FileList) => void;
  onNewRemoveScreenshot: (index: number) => void;
  onNewPaste: (e: ClipboardEvent) => void;
  onNewPreviewScreenshot: (src: string | null) => void;
  onNewSubmit: () => void;
  // detail
  onReplyChange: (value: string) => void;
  onReplySend: () => void;
  requestUpdate: () => void;
}

export function renderFeedbackPanel(
  state: FeedbackPanelState,
  callbacks: FeedbackPanelCallbacks,
) {
  const selectedId = state.detailThread?.id ?? null;
  return html`
    <div class="feedback-layout">
      ${renderSidebarNav(state, callbacks, selectedId)}
      <div class="feedback-layout__content">
        ${state.view === "detail"
          ? renderDetailContent(state, callbacks)
          : state.view === "new"
            ? renderNewContent(state, callbacks)
            : renderEmptyContent()}
      </div>
    </div>
    ${state.newPreviewSrc ? html`
      <div class="feedback-preview-overlay" @click=${() => callbacks.onNewPreviewScreenshot(null)}>
        <img src=${state.newPreviewSrc} alt="preview" class="feedback-preview-img" />
      </div>
    ` : nothing}
  `;
}

// ── Sidebar Nav (always visible) ──

function renderSidebarNav(
  state: FeedbackPanelState,
  callbacks: FeedbackPanelCallbacks,
  selectedId: number | null,
) {
  return html`
    <nav class="feedback-layout__sidebar">
      <div class="feedback-layout__sidebar-header">
        <span class="feedback-layout__sidebar-title">${t("feedback.tab")}</span>
      </div>

      <button
        class="feedback-layout__nav-item feedback-layout__nav-new ${state.view === "new" ? "active" : ""}"
        type="button"
        @click=${callbacks.onOpenNew}
      >
        ${icons.messagePlus}
        <span>${t("feedback.newThread")}</span>
      </button>

      <div class="feedback-layout__nav-list">
        ${state.threadsLoading
          ? html`<div class="feedback-layout__nav-loading">${icons.loader}</div>`
          : state.threads.length === 0
            ? html`<div class="feedback-layout__nav-empty">${t("feedback.noThreads")}</div>`
            : state.threads.map((thread) => html`
                <button
                  class="feedback-layout__nav-item ${selectedId === thread.id && state.view === "detail" ? "active" : ""}"
                  type="button"
                  @click=${() => callbacks.onOpenDetail(thread.id)}
                >
                  <div class="feedback-layout__nav-item-text">${thread.content}</div>
                  <div class="feedback-layout__nav-item-meta">
                    <span class="feedback-layout__nav-time">${timeAgo(thread.updated_at || thread.created_at)}</span>
                    ${thread.has_reply
                      ? html`<span class="feedback-layout__nav-dot" aria-label="${t("feedback.hasReply")}"></span>`
                      : nothing}
                  </div>
                </button>
              `)}
      </div>
    </nav>
  `;
}

// ── Empty Content (initial state) ──

function renderEmptyContent() {
  return html`
    <div class="feedback-layout__empty">
      <p>${t("feedback.noThreads")}</p>
    </div>
  `;
}

// ── New Feedback Content ──

function renderNewContent(
  state: FeedbackPanelState,
  callbacks: FeedbackPanelCallbacks,
) {
  return html`
    <div class="feedback-layout__content-inner">
      <h2 class="feedback-layout__content-title">${t("feedback.newThread")}</h2>

      <textarea
        class="feedback-textarea"
        placeholder=${t("feedback.placeholder")}
        .value=${state.newContent}
        @input=${(e: Event) => callbacks.onNewContentChange((e.target as HTMLTextAreaElement).value)}
        @paste=${callbacks.onNewPaste}
        ?disabled=${state.newSubmitting}
        rows="5"
      ></textarea>

      <input
        class="feedback-email-input"
        type="email"
        placeholder=${t("feedback.emailPlaceholder")}
        .value=${state.newEmail}
        @input=${(e: Event) => callbacks.onNewEmailChange((e.target as HTMLInputElement).value)}
        ?disabled=${state.newSubmitting}
      />

      <div class="feedback-screenshots">
        ${state.newScreenshotPreviews.map(
          (src, i) => html`
            <div class="feedback-screenshot-item">
              <img src=${src} alt="screenshot"
                @click=${() => callbacks.onNewPreviewScreenshot(src)}
                style="cursor: pointer"
              />
              <button
                class="feedback-screenshot-remove"
                type="button"
                @click=${() => callbacks.onNewRemoveScreenshot(i)}
                ?disabled=${state.newSubmitting}
              >${icons.x}</button>
            </div>
          `,
        )}
        <label class="feedback-screenshot-add">
          <input
            type="file"
            accept="image/*"
            multiple
            @change=${(e: Event) => {
              const files = (e.target as HTMLInputElement).files;
              if (files) callbacks.onNewAddScreenshots(files);
              (e.target as HTMLInputElement).value = "";
            }}
            ?disabled=${state.newSubmitting}
            style="display: none"
          />
          ${icons.image}
          <span>${t("feedback.addScreenshot")}</span>
        </label>
      </div>

      <div class="feedback-logs-toggle">
        <div class="feedback-logs-toggle__text">
          <span>${t("feedback.includeLogs")}</span>
          <span class="feedback-logs-toggle__hint">${t("feedback.includeLogsHint")}</span>
        </div>
        <label class="toggle-switch">
          <input
            type="checkbox"
            .checked=${state.newIncludeLogs}
            @change=${(e: Event) => callbacks.onNewToggleLogs((e.target as HTMLInputElement).checked)}
            ?disabled=${state.newSubmitting}
          />
          <span class="toggle-slider"></span>
        </label>
      </div>

      ${state.newError ? html`<div class="feedback-error">${state.newError}</div>` : nothing}

      <div class="feedback-actions">
        <button
          class="btn primary"
          type="button"
          @click=${callbacks.onNewSubmit}
          ?disabled=${state.newSubmitting || !state.newContent.trim()}
        >
          ${state.newSubmitting ? t("feedback.submitting") : t("feedback.submit")}
        </button>
      </div>
    </div>
  `;
}

// ── Detail Content ──

function renderDetailContent(
  state: FeedbackPanelState,
  callbacks: FeedbackPanelCallbacks,
) {
  const thread = state.detailThread;
  if (!thread) return nothing;

  const isOpen = thread.status === "open";

  return html`
    <div class="feedback-layout__content-inner feedback-layout__content-inner--detail">
      <div class="feedback-layout__content-header">
        <span class="feedback-panel__thread-status ${isOpen ? "feedback-panel__thread-status--open" : "feedback-panel__thread-status--closed"}">
          ${isOpen ? t("feedback.open") : t("feedback.closed")}
        </span>
      </div>

      <div class="feedback-panel__messages">
        ${state.detailLoading
          ? html`<div class="feedback-panel__loading">${icons.loader}</div>`
          : html`
              <div class="feedback-msg feedback-msg--user">
                <div class="feedback-msg__bubble">${thread.content}</div>
                <div class="feedback-msg__time">${timeAgo(thread.created_at)}</div>
              </div>
              ${state.detailMessages.map((msg) => html`
                <div class="feedback-msg ${msg.role === "user" ? "feedback-msg--user" : "feedback-msg--admin"}">
                  ${msg.role === "admin"
                    ? html`<div class="feedback-msg__label">${t("feedback.official")}</div>`
                    : nothing}
                  <div class="feedback-msg__bubble">${msg.content}</div>
                  <div class="feedback-msg__time">${timeAgo(msg.created_at)}</div>
                </div>
              `)}
            `}
      </div>

      ${isOpen
        ? html`
            <div class="feedback-panel__reply-bar">
              <input
                class="feedback-panel__reply-input"
                type="text"
                placeholder=${t("feedback.replyPlaceholder")}
                .value=${state.detailReplyContent}
                @input=${(e: Event) => callbacks.onReplyChange((e.target as HTMLInputElement).value)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter" && !e.shiftKey && state.detailReplyContent.trim()) {
                    e.preventDefault();
                    callbacks.onReplySend();
                  }
                }}
                ?disabled=${state.detailReplySending}
              />
              <button
                class="btn primary feedback-panel__reply-send"
                type="button"
                @click=${callbacks.onReplySend}
                ?disabled=${state.detailReplySending || !state.detailReplyContent.trim()}
              >${t("feedback.send")}</button>
            </div>
          `
        : nothing}
    </div>
  `;
}
