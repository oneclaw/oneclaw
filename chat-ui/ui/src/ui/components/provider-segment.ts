/**
 * Pill-style provider selector, shared between Setup Step 2 and Settings Provider Tab.
 *
 * Usage:
 *   <oc-provider-segment .providers=${["moonshot","anthropic"]} .selected=${"moonshot"}
 *     .locked=${["anthropic"]}
 *     @select=${(e: CustomEvent) => { e.detail.provider }}
 *   ></oc-provider-segment>
 */
import { LitElement, html } from "lit";
import { property } from "lit/decorators.js";

export class ProviderSegment extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: Array }) providers: string[] = [];
  @property({ type: String }) selected = "";
  @property({ type: Array }) locked: string[] = [];
  @property({ type: Object }) labels: Record<string, string> = {};

  private handleClick(provider: string) {
    if (this.locked.includes(provider)) return;
    this.dispatchEvent(new CustomEvent("select", { detail: { provider }, bubbles: true, composed: true }));
  }

  render() {
    return html`
      <div class="oc-provider-seg">
        ${this.providers.map(p => {
          const isActive = p === this.selected;
          const isLocked = this.locked.includes(p);
          return html`
            <button class="oc-provider-seg__pill ${isActive ? "oc-provider-seg__pill--active" : ""} ${isLocked ? "oc-provider-seg__pill--locked" : ""}"
              ?disabled=${isLocked}
              @click=${() => this.handleClick(p)}>
              ${this.labels[p] ?? p}
            </button>
          `;
        })}
      </div>
    `;
  }
}

customElements.define("oc-provider-segment", ProviderSegment);

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-provider-seg {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 12px;
  }
  .oc-provider-seg__pill {
    padding: 6px 16px;
    border: 1px solid var(--border, #ddd);
    border-radius: 999px;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }
  .oc-provider-seg__pill:hover:not(:disabled) { border-color: var(--accent, #c0392b); color: var(--accent, #c0392b); }
  .oc-provider-seg__pill--active {
    background: var(--accent, #c0392b);
    color: #fff;
    border-color: var(--accent, #c0392b);
  }
  .oc-provider-seg__pill--active:hover { opacity: 0.9; }
  .oc-provider-seg__pill--locked { opacity: 0.4; cursor: not-allowed; }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

declare global {
  interface HTMLElementTagNameMap {
    "oc-provider-segment": ProviderSegment;
  }
}
