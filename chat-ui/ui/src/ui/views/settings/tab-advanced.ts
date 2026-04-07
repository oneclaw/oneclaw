/**
 * Settings: Advanced Tab.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import { t, tWithDetail } from "../../i18n.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import "../../components/toggle-switch.ts";
import "../../components/message-box.ts";

// IPC persists "openclaw"/"chrome"; UI displays as "dedicated"/"chrome" for clarity.
// Map at the boundary to keep the stored enum stable.
function profileToUi(stored: string): string { return stored === "openclaw" ? "dedicated" : stored; }
function profileToStored(ui: string): string { return ui === "dedicated" ? "openclaw" : ui; }

// Advanced 页状态必须可整体回滚，避免切换 CLI/登录项后的脏状态跨会话残留。
function createAdvancedState() {
  return {
    browserProfile: "dedicated",
    imessageEnabled: false,
    launchAtLoginSupported: false,
    launchAtLogin: false,
    clawHubRegistry: "",
    cliInstalled: false,
    cliLoading: false,
    saving: false,
    error: null as string | null,
    successMsg: null as string | null,
    initialized: false,
  };
}

const s = createAdvancedState();

// 退出 Settings 时直接丢掉 Advanced 页缓存，下次重新从 IPC 拉真配置。
function resetAdvancedState() {
  Object.assign(s, createAdvancedState());
}

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const [adv, cli] = await Promise.all([ipc.settingsGetAdvanced(), ipc.settingsGetCliStatus()]);
    s.browserProfile = profileToUi(adv.browserProfile ?? "openclaw");
    s.imessageEnabled = adv.imessageEnabled ?? false;
    s.launchAtLoginSupported = adv.launchAtLoginSupported ?? false;
    s.launchAtLogin = adv.launchAtLogin ?? false;
    s.clawHubRegistry = adv.clawHubRegistry ?? "";
    s.cliInstalled = cli.installed ?? false;
    state.requestUpdate();
  } catch {}
}

async function toggleCli(state: AppViewState, install: boolean) {
  s.cliLoading = true; state.requestUpdate();
  try {
    if (install) await ipc.settingsInstallCli(); else await ipc.settingsUninstallCli();
    const cli = await ipc.settingsGetCliStatus();
    s.cliInstalled = cli.installed;
  } catch {}
  s.cliLoading = false; state.requestUpdate();
}

async function handleSave(state: AppViewState) {
  s.saving = true; s.error = null; s.successMsg = null; state.requestUpdate();
  try {
    await ipc.settingsSaveAdvanced({ browserProfile: profileToStored(s.browserProfile), imessageEnabled: s.imessageEnabled, launchAtLogin: s.launchAtLogin, clawHubRegistry: s.clawHubRegistry });
    s.saving = false; s.successMsg = t("settings.saved"); state.requestUpdate();
  } catch (e: any) { s.saving = false; s.error = tWithDetail("settings.error.saveFailed", e?.message); state.requestUpdate(); }
}

export function resetAdvancedTab() { resetAdvancedState(); }

export function renderTabAdvanced(state: AppViewState) {
  if (!s.initialized) init(state);

  return html`
    <div class="oc-settings__section">
      <div class="oc-settings__form-group">
        <label class="oc-settings__label">${t("settings.advanced.clawHubRegistry")}</label>
        <input class="oc-settings__input" .value=${s.clawHubRegistry}
          @input=${(e: Event) => { s.clawHubRegistry = (e.target as HTMLInputElement).value; }} />
      </div>

      <div class="oc-settings__form-group">
        <label class="oc-settings__label">${t("settings.advanced.browserProfile")}</label>
        <div class="oc-settings__radio-group">
          <label class="oc-settings__radio"><input type="radio" name="adv-browser" value="dedicated" .checked=${s.browserProfile === "dedicated"} @change=${() => { s.browserProfile = "dedicated"; state.requestUpdate(); }} /> ${t("settings.advanced.browserDedicated")}</label>
          <label class="oc-settings__radio"><input type="radio" name="adv-browser" value="chrome" .checked=${s.browserProfile === "chrome"} @change=${() => { s.browserProfile = "chrome"; state.requestUpdate(); }} /> ${t("settings.advanced.browserChrome")}</label>
        </div>
      </div>

      <div class="oc-settings__form-group">
        <oc-toggle-switch .label=${t("settings.advanced.imessage")} .checked=${s.imessageEnabled}
          @change=${(e: CustomEvent) => { s.imessageEnabled = e.detail.checked; state.requestUpdate(); }}
        ></oc-toggle-switch>
      </div>

      ${s.launchAtLoginSupported ? html`
        <div class="oc-settings__form-group">
          <oc-toggle-switch .label=${t("settings.advanced.launchAtLogin")} .checked=${s.launchAtLogin}
            @change=${(e: CustomEvent) => { s.launchAtLogin = e.detail.checked; state.requestUpdate(); }}
          ></oc-toggle-switch>
        </div>
      ` : nothing}

      <div class="oc-settings__form-group">
        <oc-toggle-switch
          .label=${s.cliLoading ? t("settings.advanced.cliInstalling") : t("settings.advanced.cli")}
          .checked=${s.cliInstalled}
          .disabled=${s.cliLoading}
          @change=${(e: CustomEvent) => toggleCli(state, e.detail.checked)}
        ></oc-toggle-switch>
      </div>

      <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
      <oc-message-box .message=${s.successMsg ?? ""} .type=${"success"} .visible=${!!s.successMsg}></oc-message-box>

      <div class="oc-settings__btn-row">
        <button class="oc-settings__btn oc-settings__btn--primary" ?disabled=${s.saving} @click=${() => handleSave(state)}>${t("settings.save")}</button>
      </div>
    </div>
  `;
}
