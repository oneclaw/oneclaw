/**
 * iOS-style toggle switch component.
 *
 * Usage:
 *   <oc-toggle-switch .label=${"Enable"} .checked=${true}
 *     @change=${(e: CustomEvent) => { e.detail.checked }}
 *   ></oc-toggle-switch>
 */
import { LitElement, html, css } from "lit";
import { property } from "lit/decorators.js";

export class ToggleSwitch extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Boolean }) checked = false;
  @property({ type: Boolean }) disabled = false;
  @property({ type: String }) label = "";

  private toggle() {
    if (this.disabled) return;
    this.checked = !this.checked;
    this.dispatchEvent(new CustomEvent("change", { detail: { checked: this.checked }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="oc-toggle ${this.disabled ? "oc-toggle--disabled" : ""}" @click=${this.toggle}>
        <span class="oc-toggle-label">${this.label}</span>
        <span class="oc-toggle-track ${this.checked ? "oc-toggle-track--on" : ""}">
          <span class="oc-toggle-thumb"></span>
        </span>
      </div>
    `;
  }
}

customElements.define("oc-toggle-switch", ToggleSwitch);

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    user-select: none;
  }
  .oc-toggle--disabled { opacity: 0.5; cursor: not-allowed; }
  .oc-toggle-label { font-size: 13px; font-weight: 500; color: var(--text-secondary, #a1a1aa); }
  .oc-toggle-track {
    position: relative;
    width: 42px;
    height: 24px;
    border-radius: 12px;
    background: var(--border, #ccc);
    transition: background 0.2s;
    flex-shrink: 0;
  }
  .oc-toggle-track--on { background: var(--accent, #c0392b); }
  .oc-toggle-thumb {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    transition: transform 0.2s;
  }
  .oc-toggle-track--on .oc-toggle-thumb { transform: translateX(18px); }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

declare global {
  interface HTMLElementTagNameMap {
    "oc-toggle-switch": ToggleSwitch;
  }
}
