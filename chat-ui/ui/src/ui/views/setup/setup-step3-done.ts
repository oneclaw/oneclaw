/**
 * Setup Step 3: Completion — launch OneClaw.
 *
 * WebBridge toggle 行为：
 *   - 系统默认浏览器是 Chrome/Edge → 默认开启，可手动关闭
 *   - 系统默认浏览器是其他（Safari/Firefox/...）→ 关闭 + 禁用，hover info 图标解释原因
 *   - 后端 setup-ipc 也会做兜底（默认浏览器非 Chrome/Edge 时静默跳过 webbridge 后台 task）
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
  // 系统默认浏览器；null = 非 Chrome/Edge → toggle 强制 OFF + disabled
  defaultBrowser: null as { id: string; name: string } | null,
  // null = 还在加载默认浏览器，避免在已知前先渲染 false 状态闪烁
  defaultBrowserLoaded: false,
  enableWebbridge: true,
  starting: false,
  error: null as string | null,
  statusMsg: null as string | null,
  initialized: false,
};

async function init(state: AppViewState) {
  if (s.initialized) return;
  s.initialized = true;
  try {
    const [launch, def] = await Promise.all([
      ipc.setupGetLaunchAtLogin(),
      ipc.settingsGetDefaultBrowserName().catch(() => null),
    ]);
    s.launchAtLoginSupported = launch.supported ?? false;
    s.launchAtLogin = launch.enabled ?? false;
    s.defaultBrowser = def;
    s.defaultBrowserLoaded = true;
    // 默认浏览器非 Chrome/Edge → 强制关 toggle，让用户看到禁用状态
    if (!def) s.enableWebbridge = false;
    state.requestUpdate();
  } catch {
    s.defaultBrowserLoaded = true;
    state.requestUpdate();
  }
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
      // 默认浏览器不支持时强制 false（即便用户用 dev tools 改了 state 也兜底）
      enableWebbridge: !!s.defaultBrowser && s.enableWebbridge,
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

  // toggle 是否禁用：默认浏览器还没加载完不禁（loading 闪烁不友好），加载完且 null 才禁
  const wbDisabled = s.defaultBrowserLoaded && !s.defaultBrowser;

  return html`
    <div class="oc-setup-step">
      <div class="oc-setup-step-body">
        <h2 class="oc-setup-title">${t("setup.done.title")}</h2>
        <p class="oc-setup-subtitle">${t("setup.done.subtitle")}</p>

        <div class="oc-setup-options">
          ${s.launchAtLoginSupported ? html`
            <oc-toggle-switch .label=${t("setup.done.launchAtLogin")} .checked=${s.launchAtLogin}
              @change=${(e: CustomEvent) => { s.launchAtLogin = e.detail.checked; state.requestUpdate(); }}
            ></oc-toggle-switch>
          ` : nothing}

          <!-- WebBridge toggle：
               - 标题旁 info 图标永远显示「这选项干啥」的常规说明
               - 禁用态：tooltip 挂在右侧 track 上，hover 时显示在开关附近（不再居中漂在 row 中间） -->
          <div class="oc-toggle ${wbDisabled ? 'oc-toggle--disabled' : ''}"
            @click=${() => { if (wbDisabled) return; s.enableWebbridge = !s.enableWebbridge; state.requestUpdate(); }}>
            <span class="oc-toggle-label">
              ${t("setup.done.enableWebbridge")}
              <span class="oc-info-icon"
                data-tooltip=${t("setup.done.enableWebbridgeTooltip")}
                @click=${(e: Event) => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <path d="M12 16v-4"/>
                  <path d="M12 8h.01"/>
                </svg>
              </span>
            </span>
            <span class="oc-toggle-track ${s.enableWebbridge && !wbDisabled ? 'oc-toggle-track--on' : ''}"
              data-tooltip=${wbDisabled ? t("setup.done.enableWebbridgeDisabledTooltip") : ""}>
              <span class="oc-toggle-thumb"></span>
            </span>
          </div>
        </div>

        <oc-message-box .message=${s.error ?? ""} .type=${"error"} .visible=${!!s.error}></oc-message-box>
        <oc-message-box .message=${s.statusMsg ?? ""} .type=${"info"} .visible=${!!s.statusMsg && !s.error}></oc-message-box>
      </div>

      <div class="oc-setup-btn-row">
        <button class="oc-setup-btn oc-setup-btn--primary" ?disabled=${s.starting}
          @click=${() => handleComplete(state)}>
          ${s.starting ? t("setup.done.starting") : t("setup.done.start")}
        </button>
      </div>
    </div>
  `;
}
