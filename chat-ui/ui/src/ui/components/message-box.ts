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
    padding: 8px 12px;
    border-radius: var(--radius-s, 6px);
    font-size: 13px;
    margin: 8px 0;
  }
  .oc-msgbox--error { background: rgba(192,57,43,0.08); color: #c0392b; }
  .oc-msgbox--success { background: rgba(39,174,96,0.08); color: #27ae60; }
  .oc-msgbox--info { background: rgba(41,128,185,0.08); color: #2980b9; }
`);
document.adoptedStyleSheets = [...document.adoptedStyleSheets, styleSheet];

declare global {
  interface HTMLElementTagNameMap {
    "oc-message-box": MessageBox;
  }
}
