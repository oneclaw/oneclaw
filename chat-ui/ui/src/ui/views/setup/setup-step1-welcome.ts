/**
 * Setup Step 1: Welcome page.
 */
import { html } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";

export function renderStep1(_state: AppViewState, goToStep: (step: number) => void) {
  return html`
    <div class="oc-setup-step">
      <div class="oc-setup-step-body">
        <h2 class="oc-setup-title">${t("setup.welcome.title")}</h2>
        <p class="oc-setup-subtitle">${t("setup.welcome.subtitle")}</p>

        <div class="oc-setup-features">
          <div class="oc-setup-feature-item">
            <div class="oc-setup-feature-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
            </div>
            <span>${t("setup.welcome.feat2")}</span>
          </div>
          <div class="oc-setup-feature-item">
            <div class="oc-setup-feature-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span>${t("setup.welcome.feat3")}</span>
          </div>
          <div class="oc-setup-feature-item">
            <div class="oc-setup-feature-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </div>
            <span>${t("setup.welcome.security")}</span>
          </div>
        </div>

        <p class="oc-setup-warning">${t("setup.welcome.warning")}</p>
      </div>

      <div class="oc-setup-btn-row">
        <button class="oc-setup-btn oc-setup-btn--primary" @click=${() => goToStep(2)}>
          ${t("setup.welcome.next")}
        </button>
      </div>
    </div>
  `;
}
