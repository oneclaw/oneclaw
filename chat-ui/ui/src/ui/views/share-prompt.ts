import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";

export function renderSharePrompt(state: AppViewState) {
  if (!state.sharePromptVisible) {
    return nothing;
  }

  const handleInput = (event: Event) => {
    const target = event.target as HTMLTextAreaElement | null;
    if (!target) {
      return;
    }
    state.sharePromptText = target.value;
    state.sharePromptCopied = false;
    state.sharePromptCopyError = null;
  };

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" aria-live="polite">
      <div class="exec-approval-card">
        <div class="exec-approval-header" style="align-items: flex-start;">
          <div style="flex: 1; min-width: 0;">
            <div class="exec-approval-title">${state.sharePromptTitle}</div>
            <div class="exec-approval-sub">${state.sharePromptSubtitle}</div>
          </div>
          <button
            class="btn"
            type="button"
            aria-label=${t("sharePrompt.close")}
            title=${t("sharePrompt.close")}
            @click=${() => state.dismissSharePrompt()}
            style="width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"
          >
            <span aria-hidden="true" style="display: inline-flex; width: 16px; height: 16px;">
              ${icons.x}
            </span>
          </button>
        </div>
        <textarea
          class="exec-approval-command"
          style="display: block; width: 100%; min-height: 320px; max-height: 320px; resize: vertical; overflow-y: auto; text-align: left; line-height: 1.6; white-space: pre-wrap;"
          .value=${state.sharePromptText}
          @input=${handleInput}
          spellcheck="false"
          aria-label=${state.sharePromptTitle || t("sharePrompt.title")}
        ></textarea>
        ${state.sharePromptCopyError
          ? html`<div class="callout danger" style="margin-top: 12px;">${state.sharePromptCopyError}</div>`
          : nothing}
        <div class="exec-approval-actions" style="justify-content: flex-end;">
          <button
            class="btn primary"
            @click=${() => state.handleSharePromptCopy()}
          >
            ${state.sharePromptCopied ? t("sharePrompt.copied") : t("sharePrompt.copy")}
          </button>
        </div>
      </div>
    </div>
  `;
}
