# OneClaw Design Guidelines

The OneClaw main interface (Chat UI) exhibits a **minimalist, modern, lightweight, and breathable** design language. Below are the core dimensions of the design guidelines:

## 1. Color Palette: Restraint and Focus

* **Extensive Whitespace and Light Backgrounds**: Dominated by pure white (`#ffffff`) and very light gray (`#fafafa`). Areas (such as the sidebar and main chat area) are divided by subtle contrast in lightness rather than harsh dividing lines.
* **Clear Text Hierarchy**: Main titles and body text use dark gray/near-black (emphasizing readability). Auxiliary information and unselected sidebar items use light gray (Muted), significantly reducing visual noise.
* **Restrained Red Accents**: Red is used solely as a brand color and an accent for core interactions. It appears in absolutely primary buttons (like the send button), hover interaction feedback (like the border and text of "New Chat"), and the very light red background of user bubbles. It is never abused.

### Brand Color

OneClaw's signature red theme color is: **`#c0392b`**

In the CSS variables of the code, it mainly corresponds to the following states (slightly adjusted according to dark/light modes to ensure contrast):

* **Dark Theme / Standard Brand Color**:
  * Main Tone (`--accent` / `--primary`): **`#c0392b`**
  * Hover State (`--accent-hover`): **`#a93226`** (slightly darkened)
* **Light Theme** (slightly brightened for better clarity on a white background):
  * Main Tone (`--accent` / `--primary`): **`#dc2626`**
  * Hover State (`--accent-hover`): **`#ef4444`**

> **Note**: When developing settings pages or skill pages, it is recommended to directly use the CSS variable **`var(--accent)`**, so it automatically adapts to dark and light modes.

## 2. Geometry & Shapes: Rounded and Outlined

* **Pill-shape Buttons**: Action buttons (like "New Chat" and the send button on the right of the input box) extensively use fully rounded corners (`border-radius: 9999px`), visually appearing very approachable and modern.
* **Medium-to-Large Rounded Cards**: Containers like chat bubbles and input boxes use 8px - 12px rounded corners, with soft edges and no sharp right angles.
* **Outlined / Ghost Style**: Tends to use an outlined design with "transparent background + light stroke" (like the "New Chat" button) rather than heavy solid color blocks, making the interface look very lightweight.

## 3. Typography & Spacing: Delicate and Breathable

* **Delicate Font Sizes**: Overall font sizes lean towards small and refined (mostly 13px - 14px). Information hierarchy is distinguished through font weight (500/600) and color depth, rather than exaggerated font size contrast.
* **Generous Padding**: Ample whitespace is left between elements and inside containers (such as the top and bottom spacing of the sidebar, and the padding of the input box), avoiding a crowded feel.

## 4. Interaction: Smooth and Refined

* **Progressive Feedback**: Hover states are usually accompanied by smooth transition animations (`transition`). For example, when hovering, border colors deepen or turn red, text colors light up synchronously, and a very light color block appears in the background.
* **Non-draggable Area Details**: Interactive elements explicitly exclude the system drag area (`-webkit-app-region: no-drag`) to ensure precise operation.
