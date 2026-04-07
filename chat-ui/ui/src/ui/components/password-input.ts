/**
 * Password field with visibility toggle.
 *
 * Usage:
 *   <oc-password-input .value=${"sk-..."} placeholder="sk-..."
 *     @input=${(e: CustomEvent) => { e.detail.value }}
 *   ></oc-password-input>
 */
import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";

export class PasswordInput extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String }) value = "";
  @property({ type: String }) placeholder = "";
  @property({ type: Boolean }) disabled = false;

  private visible = false;

  private toggleVisibility() {
    this.visible = !this.visible;
    this.requestUpdate();
  }

  private handleInput(e: Event) {
    this.value = (e.target as HTMLInputElement).value;
    this.dispatchEvent(new CustomEvent("input", { detail: { value: this.value }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="oc-password">
        <input
          class="oc-password__input oc-password-input"
          .type=${this.visible ? "text" : "password"}
          .value=${this.value}
          .placeholder=${this.placeholder}
          ?disabled=${this.disabled}
          @input=${this.handleInput}
        />
        <button class="oc-password__toggle" type="button" @click=${this.toggleVisibility} tabindex="-1">
          ${this.visible ? eyeOffSvg : eyeSvg}
        </button>
      </div>
    `;
  }
}

// Lucide eye / eye-off inline SVG (16x16)
const eyeSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
const eyeOffSvg = html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

customElements.define("oc-password-input", PasswordInput);

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-password {
    position: relative;
    display: flex;
    align-items: center;
  }
  .oc-password__input {
    flex: 1;
    padding-right: 36px !important;
  }
  .oc-password-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid var(--border, #e0e0e0);
    border-radius: var(--radius-s, 6px);
    background: var(--bg, #fff);
    color: var(--text, #333);
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
  }
  .oc-password-input:focus {
    border-color: var(--accent, #c0392b);
  }
  .oc-password-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .oc-password__toggle {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    padding: 4px;
    cursor: pointer;
    color: var(--text-secondary, #888);
    display: flex;
    align-items: center;
  }
  .oc-password__toggle:hover { color: var(--text); }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

declare global {
  interface HTMLElementTagNameMap {
    "oc-password-input": PasswordInput;
  }
}
