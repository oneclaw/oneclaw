# OneClaw 设计规范 (Design Guidelines)

OneClaw 主页面（Chat UI）展现出了一种**极简、现代、轻量且呼吸感强**的设计语言。以下是核心的设计规范维度：

## 1. 色彩系统 (Color Palette)：克制与聚焦

* **大面积留白与浅色背景**：以纯白 (`#ffffff`) 和极浅的灰 (`#fafafa`) 为主，通过微小的明暗对比来划分区域（如侧边栏与主聊天区），而不是使用生硬的分割线。
* **文字主次分明**：主标题和正文使用深灰/近黑（强调可读性），辅助信息、侧边栏未选中项使用浅灰色（Muted），极大地降低了视觉噪音。
* **克制的红色点缀 (Accent)**：红色仅作为品牌色和核心交互的强调色。它出现在：绝对主要的按钮（如发送按钮）、Hover 时的交互反馈（如新建对话的边框和文字）、以及用户气泡的极浅红色背景中。绝不滥用。

### 品牌色

OneClaw 的标志性红色主题色号是：**`#c0392b`**

在代码的 CSS 变量中，它主要对应以下几个状态（根据深色/浅色模式略有微调以保证对比度）：

* **深色模式 (Dark Theme) / 品牌标准色**：
  * 主色调 (`--accent` / `--primary`)：**`#c0392b`**
  * Hover 状态 (`--accent-hover`)：**`#a93226`** (稍微加深)
* **浅色模式 (Light Theme)**（为了在白底上更清晰，稍微提亮）：
  * 主色调 (`--accent` / `--primary`)：**`#dc2626`**
  * Hover 状态 (`--accent-hover`)：**`#ef4444`**

> **注意**：在设置页面或技能页面开发时，建议直接使用 CSS 变量 **`var(--accent)`**，这样它可以自动适配深浅色模式。

## 2. 几何与形状 (Geometry & Shapes)：圆润与空心

* **全圆角按钮 (Pill-shape)**：操作类按钮（如“新建对话”、输入框右侧的发送按钮）大量使用全圆角 (`border-radius: 9999px`)，视觉上非常亲和、现代。
* **中大圆角卡片**：聊天气泡、输入框等容器使用 8px - 12px 的圆角，边缘柔和，没有尖锐的直角。
* **线框化 (Outlined / Ghost)**：倾向于使用“透明背景 + 浅色描边”的空心设计（如“新建对话”按钮），而不是厚重的实心色块，让界面显得非常轻盈。

## 3. 排版与空间 (Typography & Spacing)：精巧与呼吸感

* **精巧的字号**：整体字号偏小且精致（13px - 14px 为主），通过字重（Font-weight 500/600）和颜色深浅来区分信息层级，而非夸张的字号大小对比。
* **宽裕的内边距 (Padding)**：元素之间、容器内部留有充足的空白（如侧边栏的上下间距、输入框的内边距），不拥挤。

## 4. 交互反馈 (Interaction)：平滑与细腻

* **渐进式反馈**：Hover 状态通常伴随平滑的过渡动画（`transition`）。例如鼠标悬浮时，边框颜色变深或变为红色，文字颜色同步点亮，背景出现极浅的色块。
* **无拖拽区的细节**：交互元素明确排除了系统拖拽区域（`-webkit-app-region: no-drag`），保证操作的精准。

## 5. Tooltip：全局 Fixed 定位方案

**禁止使用 CSS `::after` 伪元素做 tooltip**。在 `overflow: auto/hidden` 的容器内（如侧边栏会话列表），伪元素会被裁切，无论向哪个方向弹出都会被遮挡。

**统一方案：全局 `position: fixed` DOM 元素**，通过 JS 事件委托 + `getBoundingClientRect()` 动态定位：

* Chat UI（`main.ts`）和 Settings（`settings.js`）各自初始化一个 `.fixed-tooltip` 元素挂载到 `document.body`
* 任何需要 tooltip 的元素只需添加 `data-tooltip="提示文字"` 属性
* 默认向上弹出；添加 `data-tooltip-pos="bottom"` 可向下弹出
* `z-index: 10000` 保证始终在最上层，不受任何父容器 `overflow` 影响

```css
.fixed-tooltip {
  position: fixed;
  transform: translate(-50%, -100%);
  z-index: 10000;
  pointer-events: none;
}
```

## 6. Tooltip 使用原则：仅用于纯图标按钮

**有文字标签的按钮/菜单项禁止添加 tooltip。** Tooltip 仅用于纯图标按钮（无可见文字），此时 tooltip 提供必要的语义说明。如果按钮已有可读文字（如侧边栏的"设置"、"技能"、"工作空间"），tooltip 是冗余信息，只会干扰用户。

* 纯图标按钮（如折叠、删除、重命名）→ 添加 `data-tooltip`
* 图标 + 文字标签按钮（如侧边栏菜单项）→ 不加 tooltip
* 有 `title` 属性的纯文本元素 → 仅在文本可能被截断时使用

## 7. Design Tokens：共享设计语言

所有 CSS 变量（颜色、圆角、阴影、字体、动效）定义在 `shared/design-tokens.css` 中，Chat UI、Settings、Setup 三个页面通过 `@import` 引用。修改此文件即可全局生效。

* **禁止在组件样式中硬编码颜色值**（如 `color: #fff`），必须使用 token（如 `var(--text-on-accent)`）
* **禁止在组件样式中硬编码 `border-radius` 值**，必须使用 `var(--radius-sm/md/lg)` 等 token
* **禁止使用 `transition: all`**，必须指定具体属性（如 `transition: color 0.15s, background 0.15s`）
