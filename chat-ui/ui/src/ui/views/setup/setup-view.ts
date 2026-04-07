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
      max-width: 580px;
      margin: 0 auto;
      padding: 40px 32px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .oc-setup-progress {
      display: flex;
      gap: 6px;
      margin-bottom: 32px;
      width: 100%;
      max-width: 260px;
    }
    .oc-setup-progress-dot {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: var(--border, #e0e0e0);
      transition: background 0.2s;
    }
    .oc-setup-progress-dot--active {
      background: var(--accent, #c0392b);
    }

    .oc-setup-step {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }

    .oc-setup-icon {
      margin-bottom: 16px;
    }
    .oc-setup-icon--warning { color: #e67e22; }
    .oc-setup-icon--success { color: #27ae60; }

    .oc-setup-logo {
      margin-bottom: 16px;
    }

    .oc-setup-title {
      font-size: 22px;
      font-weight: 600;
      margin: 0 0 8px;
      color: var(--text, #1a1a1a);
    }
    .oc-setup-subtitle {
      font-size: 14px;
      color: var(--text-secondary, #888);
      margin: 0 0 24px;
    }
    .oc-setup-reassure {
      font-size: 13px;
      color: var(--text-secondary, #888);
      margin: 0 0 16px;
    }

    .oc-setup-features {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
      text-align: left;
    }
    .oc-setup-feature-item {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      color: var(--text, #1a1a1a);
    }
    .oc-setup-feature-item svg { flex-shrink: 0; color: var(--accent, #c0392b); }

    .oc-setup-warning {
      font-size: 13px;
      color: #e67e22;
      background: rgba(230, 126, 34, 0.08);
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 24px;
      width: 100%;
      text-align: left;
    }

    .oc-setup-conflict-details {
      width: 100%;
      background: var(--bg-secondary, #f5f5f5);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      text-align: left;
      font-size: 13px;
      color: var(--text-secondary, #888);
    }
    .oc-setup-conflict-item { margin-bottom: 6px; }
    .oc-setup-conflict-item:last-child { margin-bottom: 0; }

    .oc-setup-info-card {
      width: 100%;
      background: var(--bg-secondary, #f5f5f5);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 20px;
      text-align: left;
      font-size: 13px;
      color: var(--text-secondary, #888);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .oc-setup-link {
      color: var(--accent, #c0392b);
      cursor: pointer;
      text-decoration: none;
      font-size: 13px;
    }
    .oc-setup-link:hover { text-decoration: underline; }

    .oc-setup-form-group {
      width: 100%;
      margin-bottom: 16px;
      text-align: left;
    }
    .oc-setup-label {
      display: block;
      font-size: 13px;
      font-weight: 500;
      color: var(--text, #1a1a1a);
      margin-bottom: 6px;
    }
    .oc-setup-input, .oc-setup-select {
      width: 100%;
      padding: 8px 12px;
      font-size: 14px;
      border: 1px solid var(--border, #ddd);
      border-radius: var(--radius-s, 6px);
      background: var(--bg, #fff);
      color: var(--text, #1a1a1a);
      box-sizing: border-box;
    }
    .oc-setup-input:focus, .oc-setup-select:focus {
      outline: none;
      border-color: var(--accent, #c0392b);
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
      font-size: 14px;
      color: var(--text, #1a1a1a);
      cursor: pointer;
    }
    .oc-setup-radio input[type="radio"] { accent-color: var(--accent, #c0392b); }

    .oc-setup-checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--text, #1a1a1a);
      cursor: pointer;
    }
    .oc-setup-checkbox input[type="checkbox"] { accent-color: var(--accent, #c0392b); }

    .oc-setup-btn-row {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 24px;
      width: 100%;
    }

    .oc-setup-btn {
      padding: 10px 28px;
      font-size: 14px;
      font-weight: 500;
      border-radius: var(--radius-s, 6px);
      cursor: pointer;
      border: 1px solid transparent;
      transition: opacity 0.15s;
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
    .oc-setup-btn--primary:hover:not(:disabled) { opacity: 0.9; }
    .oc-setup-btn--secondary {
      background: transparent;
      color: var(--text, #1a1a1a);
      border-color: var(--border, #ddd);
    }
    .oc-setup-btn--secondary:hover:not(:disabled) { background: var(--bg-secondary, #f5f5f5); }
    .oc-setup-btn--text {
      background: transparent;
      border: none;
      color: var(--text-secondary, #888);
      padding: 4px 8px;
      font-size: 13px;
    }
    .oc-setup-btn--text:hover { color: var(--text, #1a1a1a); }

    .oc-setup-oauth-section {
      width: 100%;
      margin-bottom: 16px;
      text-align: left;
    }
    .oc-setup-oauth-status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--text, #1a1a1a);
      margin-bottom: 8px;
    }
    .oc-setup-oauth-status--success { color: #27ae60; }

    .oc-setup-oauth-no-membership {
      width: 100%;
      padding: 10px 14px;
      background: rgba(231, 76, 60, 0.08);
      border-radius: 8px;
      font-size: 13px;
      color: var(--text, #1a1a1a);
      margin-bottom: 12px;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .oc-setup-details-summary {
      font-size: 13px;
      color: var(--text-secondary, #888);
      cursor: pointer;
    }

    .oc-setup-options {
      width: 100%;
      margin-bottom: 16px;
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
    <div class="oc-setup-container">
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
