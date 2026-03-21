import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { t } from "../i18n.ts";

// "What's New" 弹窗：展示自上次打开以来的所有版本更新内容
export function renderReleaseNotesModal(state: AppViewState) {
  if (!state.showReleaseNotesModal || !state.releaseNotesData) return nothing;
  const { currentVersion, entries, locale } = state.releaseNotesData;
  if (!entries.length) return nothing;

  // 按用户语言取 notes，fallback 到 en
  const lang = locale.startsWith("zh") ? "zh" : "en";

  const handleDismiss = () => {
    state.dismissReleaseNotes();
  };

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true" @click=${handleDismiss}>
      <div class="release-notes-card" @click=${(e: Event) => e.stopPropagation()}>
        <button class="release-notes-close" @click=${handleDismiss} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>

        <div class="release-notes-header">
          <div class="release-notes-title">${t("releaseNotes.title")}</div>
          <div class="release-notes-version">${t("releaseNotes.currentVersion")} ${currentVersion}</div>
        </div>

        <div class="release-notes-entries">
          ${entries.map((entry) => html`
            <div class="release-notes-entry">
              <div class="release-notes-entry-version">${entry.version}</div>
              <div class="release-notes-entry-content">${entry.notes[lang as "zh" | "en"] ?? entry.notes.en ?? ""}</div>
            </div>
          `)}
        </div>

        <div class="release-notes-footer">
          <button class="release-notes-ok-btn" @click=${handleDismiss}>
            ${t("releaseNotes.ok")}
          </button>
        </div>
      </div>
    </div>
  `;
}
