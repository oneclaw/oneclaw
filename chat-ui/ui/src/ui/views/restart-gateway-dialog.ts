import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { t } from "../i18n.ts";

// 重启 Gateway 确认弹窗
export function renderRestartGatewayDialog(state: AppViewState) {
  if (!state.showRestartGatewayDialog) return nothing;

  const handleRestart = () => {
    state.showRestartGatewayDialog = false;
    window.oneclaw?.restartGateway?.();
  };

  const handleDismiss = () => {
    state.showRestartGatewayDialog = false;
  };

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-modal="true">
      <div class="exec-approval-card">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">${t("restartDialog.title")}</div>
            <div class="exec-approval-sub">${t("restartDialog.subtitle")}</div>
          </div>
        </div>
        <div class="exec-approval-actions">
          <button class="btn primary" @click=${handleRestart}>
            ${t("restartDialog.restart")}
          </button>
          <button class="btn" @click=${handleDismiss}>
            ${t("restartDialog.dismiss")}
          </button>
        </div>
      </div>
    </div>
  `;
}
