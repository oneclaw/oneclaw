/**
 * Status message display (error / success / info).
 *
 * Usage:
 *   <oc-message-box .message=${"Saved!"} .type=${"success"} .visible=${true}></oc-message-box>
 */
import { LitElement, html, nothing } from "lit";
import { property } from "lit/decorators.js";

export class MessageBox extends LitElement {
  createRenderRoot() { return this; }

  @property({ type: String }) message = "";
  @property({ type: String }) type: "error" | "success" | "info" = "info";
  @property({ type: Boolean }) visible = false;

  render() {
    if (!this.visible || !this.message) return nothing;
    return html`
      <div class="oc-msgbox oc-msgbox--${this.type}">${this.message}</div>
    `;
  }
}

customElements.define("oc-message-box", MessageBox);

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(/* css */`
  .oc-msgbox {
    padding: 10px 14px;
    border-radius: var(--radius-sm, 8px);
    font-size: 12.5px;
    line-height: 1.4;
    margin: 8px 0;
  }
  .oc-msgbox--error { background: rgba(192,57,43,0.1); color: var(--accent, #c0392b); border: 1px solid var(--accent-subtle, rgba(192,57,43,0.15)); }
  .oc-msgbox--success { background: rgba(212,119,106,0.1); color: #d4776a; border: 1px solid var(--accent-subtle, rgba(192,57,43,0.15)); }
  .oc-msgbox--info { background: rgba(41,128,185,0.08); color: #2980b9; border: 1px solid rgba(41,128,185,0.15); }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

declare global {
  interface HTMLElementTagNameMap {
    "oc-message-box": MessageBox;
  }
}
