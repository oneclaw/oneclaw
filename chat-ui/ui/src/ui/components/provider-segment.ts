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
    gap: 0;
    background: var(--bg-input, #f5f5f5);
    border: 1px solid var(--border, #e4e4e7);
    border-radius: var(--radius-pill, 9999px);
    padding: 3px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .oc-provider-seg__pill {
    flex: 1;
    padding: 7px 0;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted, #a1a1aa);
    background: transparent;
    border: none;
    border-radius: var(--radius-pill, 9999px);
    cursor: pointer;
    transition: color var(--transition, 0.18s ease), background var(--transition, 0.18s ease);
    white-space: nowrap;
    font-family: inherit;
  }
  .oc-provider-seg__pill:hover:not(:disabled) { color: var(--text-secondary, #71717a); }
  .oc-provider-seg__pill--active {
    color: #fff;
    background: var(--accent, #c0392b);
    font-weight: 600;
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
