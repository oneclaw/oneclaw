# OneClaw UI React 重写任务

当前项目是 OneClaw——一个基于 Electron 的桌面应用，它将 openclaw gateway 封装为独立的可安装程序。参考 CLAUDE.md 和 docs/architecture.md 了解项目基本信息。使用 `tokei -o json chat-ui/ setup/ settings/` 命令可以看到当前 UI 层的代码行数分布。

现在需要把项目的**全部 UI 层**使用 React 现代架构重写，保持所有功能和对外行为完全不变。

## 重写范围

在项目的整个目录结构中：

- `chat-ui/ui/src/` 是 Chat UI 的核心代码（~29,000 LOC，108 个 TypeScript 文件）。使用 Lit 3 Web Components + Vite 构建，通过 `file://` 协议加载到 Electron BrowserWindow。包含：主 App 组件（`app.ts` + 11 个 `app-*.ts` 支持模块）、25 个 Controllers（网关调用封装）、52 个 Views（纯渲染函数返回 `html` 模板字面量）、WebSocket 网关连接、i18n、localStorage 状态持久化、CSS 设计系统。
- `setup/` 是 Setup 向导（~2,300 LOC，vanilla HTML/CSS/JS）。4 步流程：冲突检测 → 欢迎 → Provider 配置 → 完成。包含 i18n 字典、Kimi OAuth 设备码登录、多 Provider 预设。
- `settings/` 是 Settings 页面（~8,000 LOC，vanilla HTML/CSS/JS）。8 个 Tab：Channels（多渠道配对）、Provider（模型管理）、Search（Kimi Search）、Memory、Appearance、Advanced、Backup、About。
- `chat-ui/ui/src/styles.css` 是 Chat UI 的完整设计系统（~1,500 LOC，70+ CSS 变量）。
- `setup/setup.css` 和 `settings/settings.css` 是各自的样式文件。

上述部分是本次需要使用 React 重写的全部内容。

## 不变的部分（明确排除）

以下代码**不动**：

- `src/*.ts`（Electron Main Process 的全部 35 个 TypeScript 模块）——网关管理、IPC handler、preload bridge、config 逻辑、OAuth 逻辑、CLI 集成、自动更新、分析、日志等全部保持原样
- `src/preload.ts`（contextBridge IPC 白名单）——这是 Main 和 Renderer 之间的**契约**，99 个方法 + 5 个事件监听器的签名和行为必须完全兼容
- `scripts/`、`assets/`、`electron-builder.yml`、`tsconfig.json` 等构建和打包配置
- 网关子进程和通信协议

## 技术栈要求

重写后的 React 版本应采用：

- **React 19**（最新稳定版）+ **TypeScript**
- **Vite** 作为构建工具（保持现有构建管道兼容）
- **Tailwind CSS v4**（替代现有 CSS 变量体系，但必须保持完全一致的视觉效果）
- **Zustand** 做全局状态管理（替代 Lit 的 `@property` / `@state` 混杂模式）
- **React Router** 做页面/视图路由（替代现有的 JS 手动路由）
- **Lucide React** 做图标（替代现有的 SVG sprite 生成）
- 对于其他需要第三方库的情况，根据 React 社区的最佳实践选择合适的库
- 继续通过 `file://` 协议加载到 Electron BrowserWindow

## 重写后的 React 版本应

1. **三合一**：将 Chat UI、Setup、Settings 合并为一个统一的 React SPA（Setup 和 Settings 当前是独立的 BrowserWindow，重写后仍可以是独立窗口，但共享同一个 React 代码库和构建产物）
2. **视觉完全一致**：所有页面、组件、交互效果必须与现有版本视觉上完全一致（颜色、间距、字体、动画、深浅色主题）。**主题色是红色（#c0392b），不是蓝色或绿色**
3. **功能完全等价**：所有 99 个 IPC 方法的调用方式和时机必须与现有实现完全一致。Chat、Setup、Settings 的每一个交互流程都必须保持不变
4. **IPC 契约不变**：`window.oneclaw.*` 的所有方法签名和调用约定不变。这是与 Main Process 的唯一接口
5. **i18n 方式统一**：三个 UI 层当前各自有独立的 i18n 字典（内嵌 JS），重写后应合并为统一的 i18n 方案（推荐 `react-i18next` 或简单的 Context-based 方案），但所有翻译文本必须与现有版本完全一致
6. **组件化**：消除现有的代码重复（Setup 和 Settings 有大量相同的 Provider 配置表单逻辑）。提取共享组件：ProviderForm、ChannelConfigDialog、ToggleSwitch、ModelSelector 等
7. **状态管理清晰**：用 Zustand store 替代 Lit 组件上 150+ 个散乱的 `@state` 属性。按领域拆分 store：chatStore、settingsStore、channelStore、gatewayStore 等
8. **WebSocket 连接保持**：网关 WebSocket 连接和 60s 共享 ticker 的行为必须保持一致（参考 `docs/client-ticker.md`）
9. **构建产物兼容**：Vite 输出仍然到 `chat-ui/dist/`，`npm run build:chat` 命令保持不变，Electron 加载方式不变
10. **深浅色主题**：保持 `prefers-color-scheme` 媒体查询 + JS override 的双模式切换

## 再次强调

1. 尊重现有的模块划分——Controllers 的职责边界、Views 的组件粒度、IPC 方法的分组方式。React 重写应该 1:1 映射这些边界，而不是随意合并或拆分
2. 尊重现有的设计语言——红色主题、iOS 风格 Toggle、右对齐 Action 按钮、`data-tooltip` 替代原生 title、系统字体栈。参考 `docs/design-guidelines-zh.md`
3. 对于 Lit → React 的技术差异，可以做适当调整（模板字面量 → JSX、装饰器 → hooks、Shadow DOM → CSS Modules），但必须确保**功能和视觉效果保持完全一致**
4. 所有 IPC 调用的参数、返回值、调用时机**必须完全兼容**——Main Process 的代码不做任何修改
5. i18n 文本内容**必须完全一致**——从现有三套字典中提取所有翻译，合并去重后保持原样
6. 现有的设计 token（CSS 变量：颜色、间距、圆角、阴影、动画）必须在 Tailwind 配置中**完全对应**
7. 所有对外功能的行为以**当前运行版本**为准——如有疑问，运行 `npm run dev` 查看实际表现

## 工作方式

你应当非常仔细地理解现有 UI 代码，特别是：
- 每个 View 函数的渲染逻辑和交互行为
- 每个 Controller 调用的 IPC 方法和数据流
- 现有的 CSS 设计系统（变量、组件类、响应式断点）
- Setup 向导的多步骤状态机
- Settings 的多 Tab 路由和表单绑定
- Chat UI 的消息流、工具卡片流式渲染、Markdown 渲染

然后制定详尽的重写方案，写到 **PLAN.md**。PLAN 必须极为详尽，因为这个任务必然会消耗你的完整 context window，随后会压缩，你要确保压缩后能够继续工作。PLAN 应包含：

1. **Progress（滚动更新）**——已完成工作的密集记录，用于 context 压缩后恢复
2. **组件映射表**——现有 Lit/vanilla 组件 → React 组件的 1:1 映射
3. **路由设计**——SPA 路由结构
4. **Store 设计**——Zustand store 的领域划分和接口定义
5. **共享组件清单**——从 Setup/Settings 重复代码中提取的共享组件
6. **CSS 迁移方案**——CSS 变量 → Tailwind tokens 的映射表
7. **i18n 合并方案**——三套字典的合并策略
8. **IPC 调用清单**——每个 IPC 方法在哪些组件中被调用
9. **测试计划**——如何验证视觉和功能等价性
10. **实施阶段**——分阶段的执行顺序（依赖关系排序）

完成方案制定后，开始工作。在过程中应时刻遵守我的要求，并常常回顾 PLAN.md，确保 on track。

React 版本写在 `chat-ui/` 目录下（替换现有 Lit 代码），代码风格应符合 React 社区最佳实践。使用函数组件 + Hooks，合理拆分组件粒度，关键组件编写 JSDoc 注释。
