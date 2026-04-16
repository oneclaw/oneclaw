/**
 * Setup View — top-level container for the Setup wizard.
 * Renders a 4-step wizard inside the Chat UI single window.
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../../app-view-state.ts";
import * as ipc from "../../data/ipc-bridge.ts";
import type { DetectionResult } from "../../data/ipc-bridge.ts";
import { renderStep0 } from "./setup-step0-conflict.ts";
import { renderStep1 } from "./setup-step1-welcome.ts";
import { renderStep2 } from "./setup-step2-provider.ts";
import { renderStep3 } from "./setup-step3-done.ts";

/* ── module-level state ── */

const setupState = {
  currentStep: -1, // -1 = detecting, 0..3 = steps
  conflictResult: null as DetectionResult | null,
  initialized: false,
};

/* ── init: detect conflict to decide starting step ── */

async function init(state: AppViewState) {
  if (setupState.initialized) return;
  setupState.initialized = true;
  try {
    const result = await ipc.detectInstallation();
    if (result.portInUse || result.globalInstalled) {
      setupState.conflictResult = result;
      setupState.currentStep = 0;
    } else {
      setupState.currentStep = 1;
    }
  } catch {
    setupState.currentStep = 1;
  }
  state.requestUpdate();
}

/* ── navigation ── */

function goToStep(step: number, state: AppViewState) {
  setupState.currentStep = step;
  state.requestUpdate();
}

/* ── CSS (injected once into document) ── */

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(/* css */`
    .oc-setup-container {
      width: 65%;
      margin: 0 auto;
      padding: 72px 32px 32px;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      overflow-y: auto;
    }
    .oc-setup-container--step2 {
      padding-top: 48px;
      padding-bottom: 48px;
    }

    .oc-setup-progress {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background: var(--bg-secondary, #f0f0f0);
      z-index: 100;
      display: flex;
      gap: 0;
      margin: 0;
      max-width: none;
    }
    .oc-setup-progress-dot {
      flex: 1;
      height: 3px;
      border-radius: 0;
      background: transparent;
      transition: background 0.4s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .oc-setup-progress-dot--active {
      background: var(--accent, #c0392b);
    }

    .oc-setup-step {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: stretch;
      text-align: left;
      flex: 1;
    }

    .oc-setup-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md, 12px);
      margin-bottom: 16px;
    }
    .oc-setup-icon--warning {
      color: #e67e22;
      background: rgba(230, 126, 34, 0.12);
    }
    .oc-setup-icon--success {
      color: var(--accent, #c0392b);
      background: var(--accent-subtle, rgba(192, 57, 43, 0.08));
    }

    .oc-setup-logo {
      margin-bottom: 4px;
    }

    .oc-setup-title {
      font-size: 30px;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 0 0 24px;
      color: var(--text-strong, #18181b);
    }
    .oc-setup-subtitle {
      font-size: 15px;
      color: var(--text-secondary, #888);
      margin: 0 0 28px;
      max-width: none;
    }
    .oc-setup-reassure {
      font-size: 15px;
      color: var(--text-secondary, #888);
      margin: 0 0 20px;
    }

    .oc-setup-features {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 32px;
      text-align: left;
    }
    .oc-setup-feature-item {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 15px;
      color: var(--text-secondary, #888);
      line-height: 1.45;
    }
    .oc-setup-feature-icon {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--accent-subtle, rgba(192, 57, 43, 0.08));
      border-radius: var(--radius-sm, 8px);
      color: var(--accent, #c0392b);
    }
    .oc-setup-feature-item svg { flex-shrink: 0; color: var(--accent, #c0392b); }

    .oc-setup-warning {
      font-size: 14px;
      color: var(--warning, #d97706);
      line-height: 1.5;
      margin-bottom: 12px;
      width: 100%;
    }

    .oc-setup-conflict-details {
      width: 100%;
      background: var(--bg-secondary, #f5f5f5);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      text-align: left;
      font-size: 15px;
      color: var(--text-secondary, #888);
    }
    .oc-setup-conflict-item { margin-bottom: 6px; }
    .oc-setup-conflict-item:last-child { margin-bottom: 0; }

    .oc-setup-info-card {
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: var(--accent-subtle, rgba(192, 57, 43, 0.08));
      border: 1px solid var(--accent-subtle, rgba(192, 57, 43, 0.08));
      border-radius: var(--radius-md, 12px);
      margin-bottom: 20px;
      text-align: left;
      font-size: 14px;
      color: var(--text-secondary, #888);
      line-height: 1.45;
    }
    .oc-setup-info-card--compact {
      padding: 10px 14px;
    }
    .oc-setup-info-card-text {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .oc-setup-link {
      color: var(--accent, #c0392b);
      cursor: pointer;
      text-decoration: none;
      font-size: 15px;
    }
    .oc-setup-link:hover { text-decoration: underline; }

    .oc-setup-form-group {
      width: 100%;
      margin-bottom: 20px;
      text-align: left;
    }
    .oc-setup-label {
      display: block;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary, #71717a);
      margin-bottom: 6px;
    }
    .oc-setup-input, .oc-setup-select {
      width: 100%;
      padding: 9px 12px;
      font-size: 15px;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-sm, 8px);
      background: var(--bg-input, #f5f5f5);
      color: var(--text, #1a1a1a);
      box-sizing: border-box;
      outline: none;
      transition: border-color var(--transition, 0.18s ease), box-shadow var(--transition, 0.18s ease);
      font-family: inherit;
    }
    .oc-setup-input::placeholder { color: var(--text-muted, #a1a1aa); }
    .oc-setup-input:focus, .oc-setup-select:focus {
      outline: none;
      border-color: var(--border-focus, var(--accent, #c0392b));
      box-shadow: 0 0 0 3px var(--accent-subtle, rgba(192,57,43,0.15));
    }
    .oc-setup-select {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%2364748b' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
      cursor: pointer;
    }

    .oc-setup-radio-group {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
    }
    .oc-setup-radio {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 15px;
      color: var(--text-secondary, #71717a);
      cursor: pointer;
    }
    .oc-setup-radio input[type="radio"] {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--border, #e4e4e7);
      border-radius: 50%;
      background: var(--bg-input, #f5f5f5);
      cursor: pointer;
      position: relative;
      margin: 0;
      transition: border-color var(--transition, 0.18s ease);
    }
    .oc-setup-radio input[type="radio"]:checked {
      border-color: var(--accent, #c0392b);
    }
    .oc-setup-radio input[type="radio"]:checked::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent, #c0392b);
    }

    .oc-setup-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      color: var(--text-secondary, #71717a);
      cursor: pointer;
    }
    .oc-setup-checkbox input[type="checkbox"] {
      -webkit-appearance: none;
      appearance: none;
      width: 16px;
      height: 16px;
      border: 1.5px solid var(--border, #e4e4e7);
      border-radius: 3px;
      background: var(--bg-input, #f5f5f5);
      cursor: pointer;
      position: relative;
      flex-shrink: 0;
      margin: 0;
      transition: border-color var(--transition, 0.18s ease), background var(--transition, 0.18s ease);
    }
    .oc-setup-checkbox input[type="checkbox"]:checked {
      border-color: var(--accent, #c0392b);
      background: var(--accent, #c0392b);
    }
    .oc-setup-checkbox input[type="checkbox"]:checked::after {
      content: "";
      position: absolute;
      top: 1px;
      left: 4px;
      width: 5px;
      height: 9px;
      border: solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .oc-setup-btn-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 12px;
      margin-top: auto;
      padding-top: 24px;
      padding-bottom: 16px;
      width: 100%;
      position: sticky;
      bottom: 48px;
      background: var(--bg, #fff);
    }

    .oc-setup-btn {
      padding: 11px 30px;
      font-size: 16px;
      font-weight: 600;
      border-radius: var(--radius-pill, 9999px);
      cursor: pointer;
      border: 1px solid transparent;
      transition: background var(--transition, 0.18s ease), transform 80ms ease;
      min-height: 40px;
      font-family: inherit;
    }
    .oc-setup-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .oc-setup-btn--primary {
      background: var(--accent, #c0392b);
      color: #fff;
      border-color: var(--accent, #c0392b);
    }
    .oc-setup-btn--primary:hover:not(:disabled) { background: var(--accent-hover, #a93226); }
    .oc-setup-btn--primary:active:not(:disabled) { transform: scale(0.97); }
    .oc-setup-btn--secondary {
      background: transparent;
      color: var(--text, #1a1a1a);
      border-color: var(--border, #ddd);
      margin-right: auto;
    }
    .oc-setup-btn--secondary:hover:not(:disabled) { background: var(--bg-secondary, #f5f5f5); }
    .oc-setup-btn--text {
      background: transparent;
      border: none;
      color: var(--text-secondary, #888);
      padding: 4px 8px;
      font-size: 15px;
    }
    .oc-setup-btn--text:hover { color: var(--text, #1a1a1a); }

    .oc-setup-oauth-section {
      width: 100%;
      margin-bottom: 20px;
      text-align: left;
    }
    .oc-setup-oauth-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 16px;
      color: var(--text, #1a1a1a);
      margin-bottom: 8px;
    }
    .oc-setup-oauth-status--success { color: #27ae60; }

    .oc-setup-oauth-no-membership {
      width: 100%;
      padding: 10px 14px;
      background: rgba(231, 76, 60, 0.08);
      border-radius: 8px;
      font-size: 15px;
      color: var(--text, #1a1a1a);
      margin-bottom: 12px;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .oc-setup-details-advanced {
      margin-top: 12px;
      border: 1px solid var(--border, #e4e4e7);
      border-radius: var(--radius-sm, 8px);
      padding: 0;
    }
    .oc-setup-details-advanced > summary {
      cursor: pointer;
      padding: 8px 12px;
      font-size: 15px;
      color: var(--text-secondary, #888);
      user-select: none;
    }
    .oc-setup-details-advanced[open] > summary {
      border-bottom: 1px solid var(--border, #e4e4e7);
    }
    .oc-setup-details-advanced .oc-setup-form-group {
      padding: 12px;
      margin: 0;
    }

    .oc-setup-options {
      width: 100%;
      margin-bottom: 16px;
    }

    /* Override password-input to match setup form field sizes */
    .oc-setup-step .oc-password-input {
      padding: 9px 12px;
      font-size: 15px;
      border-radius: var(--radius-sm, 8px);
    }

    .oc-setup-spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid var(--border, #ddd);
      border-top-color: var(--accent, #c0392b);
      border-radius: 50%;
      animation: oc-setup-spin 0.6s linear infinite;
    }
    @keyframes oc-setup-spin { to { transform: rotate(360deg); } }
  `);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
}

/* ── render entry point ── */

export function renderSetupView(state: AppViewState) {
  injectStyles();
  if (!setupState.initialized) init(state);

  const step = setupState.currentStep;
  const totalSteps = 4;

  return html`
    <div class="oc-setup-container ${step === 2 ? 'oc-setup-container--step2' : ''}">
      ${step >= 0 ? html`
        <div class="oc-setup-progress">
          ${[0, 1, 2, 3].map(i => html`
            <div class="oc-setup-progress-dot ${i <= step ? 'oc-setup-progress-dot--active' : ''}"></div>
          `)}
        </div>
      ` : nothing}

      ${step === -1 ? html`<div class="oc-setup-spinner" style="width:24px;height:24px"></div>` : nothing}
      ${step === 0 ? renderStep0(state, setupState.conflictResult!, (s) => goToStep(s, state)) : nothing}
      ${step === 1 ? renderStep1(state, (s) => goToStep(s, state)) : nothing}
      ${step === 2 ? renderStep2(state, (s) => goToStep(s, state)) : nothing}
      ${step === 3 ? renderStep3(state) : nothing}
    </div>
  `;
}
