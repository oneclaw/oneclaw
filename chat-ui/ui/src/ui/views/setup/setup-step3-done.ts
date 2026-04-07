/**
 * Setup Step 3: Completion — launch OneClaw.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/message-box.ts";

const s = {
  launchAtLoginSupported: false,
  launchAtLogin: false,
  starting: false,
  error: null as string | null,
  statusMsg: null as string | null,
  initialized: false,
};

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const result = await ipc.setupGetLaunchAtLogin();
    s.launchAtLoginSupported = result.supported ?? false;
    s.launchAtLogin = result.enabled ?? false;
    state.requestUpdate();
  } catch {}
}

async function handleComplete(state: AppViewState) {
  if (s.starting) return;
  s.starting = true;
  s.error = null;
  s.statusMsg = t("setup.done.starting");
  state.requestUpdate();

  try {
    const payload: Record<string, unknown> = {
      installCli: true,
      sessionMemory: true,
    };
    if (s.launchAtLoginSupported) {
      payload.launchAtLogin = s.launchAtLogin;
    }
    const result = await ipc.completeSetup(payload);
    if (!result || !result.success) {
      s.starting = false;
      s.error = (result as any)?.message ?? t("setup.done.startFailed");
      s.statusMsg = null;
      state.requestUpdate();
    }
    // On success, main process sends app:navigate { view: "chat" }
  } catch (e: any) {
    s.starting = false;
    s.error = e?.message ?? t("setup.done.startFailed");
    s.statusMsg = null;
    state.requestUpdate();
  }
}

export function renderStep3(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-setup-step">
      <div class="oc-setup-icon oc-setup-icon--success">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#27ae60" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
      </div>

      <h2 class="oc-setup-title">${t("setup.done.title")}</h2>
      <p class="oc-setup-subtitle">${t("setup.done.subtitle")}</p>

      <div class="oc-setup-options">
        ${s.launchAtLoginSupported ? html`
          <oc-toggle-switch .label=${t("setup.done.launchAtLogin")} .checked=${s.launchAtLogin}
            @change=${(e: CustomEvent) => { s.launchAtLogin = e.detail.checked; state.requestUpdate(); }}
          ></oc-toggle-switch>
        ` : nothing}
      </div>

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
      <oc-message-box .message=${s.statusMsg ?? ""} .type=${"info"} .visible=${!!s.statusMsg && !s.error}></oc-message-box>

      <div class="oc-setup-btn-row">
        <button class="oc-setup-btn oc-setup-btn--primary" ?disabled=${s.starting}
          @click=${() => handleComplete(state)}>
          ${s.starting ? t("setup.done.starting") : t("setup.done.start")}
        </button>
      </div>
    </div>
  `;
}
