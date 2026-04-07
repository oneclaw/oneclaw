/**
 * Settings: About / Software Update Tab.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { UpdateState } from "../../data/ipc-bridge.ts";

const s = {
  oneClawVersion: "",
  openClawVersion: "",
  updateState: { status: "hidden" } as UpdateState,
  initialized: false,
  updateCleanup: null as (() => void) | null,
};

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const [about, us] = await Promise.all([ipc.settingsGetAboutInfo(), ipc.getUpdateState()]);
    s.oneClawVersion = about.oneClawVersion ?? "";
    s.openClawVersion = about.openClawVersion ?? "";
    s.updateState = us;
    state.requestUpdate();
  } catch {}

  s.updateCleanup = ipc.onUpdateState((us) => {
    s.updateState = us;
    state.requestUpdate();
  });
}

export function cleanupAboutTab() {
  if (s.updateCleanup) {
    s.updateCleanup();
    s.updateCleanup = null;
  }
  s.initialized = false;
}

export function renderTabAbout(state: AppViewState) {
  if (!s.initialized) init(state);
  const us = s.updateState;

  return html`
    <div class="oc-settings__section">
      <!-- Version -->
      <div class="oc-settings__card">
        <div class="oc-settings__card-title">${t("settings.about.version")}</div>
        <div style="font-size:13px;display:flex;flex-direction:column;gap:6px">
          <div><strong>${t("settings.about.oneclaw")}</strong>: ${s.oneClawVersion}</div>
          <div><strong>${t("settings.about.openclaw")}</strong>: ${s.openClawVersion}</div>
        </div>
      </div>

      <!-- Update -->
      <div class="oc-settings__card">
        <div class="oc-settings__card-title">${t("settings.about.update")}</div>
        ${us.status === "hidden" ? html`
          <button class="oc-settings__btn oc-settings__btn--primary" @click=${() => ipc.checkForUpdates()}>
            ${t("settings.about.checkUpdate")}
          </button>
        ` : nothing}
        ${us.status === "available" ? html`
          <div style="font-size:13px;margin-bottom:8px">${us.version ?? ""}</div>
          <button class="oc-settings__btn oc-settings__btn--primary" @click=${() => ipc.downloadAndInstallUpdate()}>
            ${t("settings.about.installUpdate")}
          </button>
        ` : nothing}
        ${us.status === "downloading" ? html`
          <div style="font-size:13px">${t("settings.about.downloading").replace("{percent}", String(Math.round(us.percent ?? 0)))}</div>
        ` : nothing}
      </div>
    </div>
  `;
}
