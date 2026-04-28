/**
 * Setup Step 0: Installation conflict detection.
 * Shows when an existing OpenClaw installation is detected.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { DetectionResult } from "../../data/ipc-bridge.ts";
import "../../components/message-box.ts";

interface Step0State {
  resolving: boolean;
  error: string | null;
}

const s: Step0State = {
  resolving: false,
  error: null,
};

function tpl(key: string, vars: Record<string, string | number>): string {
  let result = t(key);
  for (const [k, v] of Object.entries(vars)) {
    result = result.replace(`{${k}}`, String(v));
  }
  return result;
}

async function handleUninstall(state: AppViewState, conflict: DetectionResult, goToStep: (step: number) => void) {
  if (s.resolving) return;
  s.resolving = true;
  s.error = null;
  state.requestUpdate();

  try {
    await ipc.resolveConflict({ action: "uninstall", pid: conflict.portPid ?? 0 });
    s.resolving = false;
    goToStep(1);
  } catch (e: any) {
    s.resolving = false;
    s.error = t("setup.conflict.failed") + (e?.message ?? "");
    state.requestUpdate();
  }
}

function handleQuit() {
  ipc.quit();
}

export function renderStep0(state: AppViewState, conflict: DetectionResult, goToStep: (step: number) => void) {
  return html`
    <div class="oc-setup-step">
      <div class="oc-setup-step-body">
        <div class="oc-setup-icon oc-setup-icon--warning">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <path d="M12 9v4"/><path d="M12 17h.01"/>
          </svg>
        </div>

        <h2 class="oc-setup-title">${t("setup.conflict.title")}</h2>
        <p class="oc-setup-subtitle">${t("setup.conflict.subtitle")}</p>
        <p class="oc-setup-reassure">${t("setup.conflict.reassure")}</p>

        <div class="oc-setup-conflict-details">
          ${conflict.portInUse ? html`
            <div class="oc-setup-conflict-item">
              ${tpl("setup.conflict.portInUse", {
                port: 18789,
                process: conflict.portProcess ?? "unknown",
                pid: conflict.portPid ?? "",
              })}
            </div>
          ` : nothing}
          ${conflict.globalInstalled ? html`
            <div class="oc-setup-conflict-item">
              ${tpl("setup.conflict.globalInstalled", { path: conflict.globalPath ?? "" })}
            </div>
          ` : nothing}
        </div>

        <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
      </div>

      <div class="oc-setup-btn-row">
        <button class="oc-setup-btn oc-setup-btn--secondary" @click=${handleQuit}>
          ${t("setup.conflict.quit")}
        </button>
        <button class="oc-setup-btn oc-setup-btn--primary" ?disabled=${s.resolving}
          @click=${() => handleUninstall(state, conflict, goToStep)}>
          ${s.resolving ? t("setup.conflict.uninstalling") : t("setup.conflict.uninstall")}
        </button>
      </div>
    </div>
  `;
}
