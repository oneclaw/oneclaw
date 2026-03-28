import { html, nothing } from "lit";
import { icons } from "../icons.ts";
import { t } from "../i18n.ts";

// 反馈弹窗状态
export interface FeedbackDialogState {
  open: boolean;
  content: string;
  screenshots: string[];        // base64 数据
  screenshotPreviews: string[]; // data URL 预览
  previewSrc: string | null;    // 当前预览的截图 data URL
  includeLogs: boolean;
  submitting: boolean;
  error: string | null;
}

// 创建初始状态
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

// 反馈回调集合
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

// 渲染右上角反馈按钮
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

// 渲染反馈弹窗（复用 exec-approval-overlay 遮罩层样式）
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

        <!-- 截图预览区 -->
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

        <!-- 日志附带选项（iOS 风格开关，标签左 / 开关右） -->
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
