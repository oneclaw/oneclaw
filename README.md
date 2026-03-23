<p align="center">
  <img src="assets/icon.png" width="120" alt="OneClaw Logo" />
</p>

<h1 align="center">🦀 OneClaw</h1>

<p align="center">
  <strong>One Minute Install, One OpenClaw.</strong><br/>
  一分钟装好，即刻开聊。零配置、零依赖的 <a href="https://github.com/anthropics/claude-code">OpenClaw</a> 桌面客户端。
</p>

<p align="center">
  <a href="https://github.com/oneclaw/oneclaw/releases/latest"><img src="https://img.shields.io/github/v/release/oneclaw/oneclaw?style=flat-square&color=c0392b" alt="Latest Release" /></a>
  <a href="https://github.com/oneclaw/oneclaw/releases"><img src="https://img.shields.io/github/downloads/oneclaw/oneclaw/total?style=flat-square&color=c0392b" alt="Downloads" /></a>
  <a href="https://github.com/oneclaw/oneclaw/blob/main/LICENSE"><img src="https://img.shields.io/github/license/oneclaw/oneclaw?style=flat-square" alt="License" /></a>
</p>

---

## 🇨🇳 中文

### ✨ 为什么选 OneClaw？

> **不装 Node.js，不跑 `npm install`，不配环境变量。**
> 双击安装包 → 输入 API Key → 开始对话。就这么简单。

OneClaw 把 [OpenClaw](https://github.com/anthropics/claude-code) 打包成一个**开箱即用**的桌面应用。内置 Node.js 运行时和完整的 OpenClaw Gateway，你不需要任何开发工具链。

它的目标很简单：**让 AI 真正替你动手做事，而不是只会聊天。** 🎯

| 🚀 特性 | 说明 |
|---|---|
| ⚡ **一分钟安装** | 下载 → 双击 → 输入 Key → 开聊，全程不超过 60 秒 |
| 🖥️ **跨平台** | macOS (Apple Silicon / Intel) + Windows (x64 / ARM64) |
| 🔒 **密钥本地存储** | API Key 只存在你的电脑上，绝不上传任何服务器 |
| 🤖 **多模型管理** | Anthropic / OpenAI / Google / Kimi / 自定义接口，对话中随时切换模型 |
| 🔄 **自动更新** | 内置 CDN 更新，升级后自动展示更新日志 |
| 🧠 **高级记忆** | 自动保存对话上下文，支持记忆搜索和定时任务查看 |
| 🔍 **Kimi 搜索** | 集成 Kimi Search 联网搜索能力 |
| 💬 **多渠道集成** | 飞书 / 企业微信 / 钉钉 / QQ Bot / 微信，一键连接团队 IM |
| 🧩 **技能商店** | 内置 clawhub 技能市场，一键安装扩展能力 |
| 📎 **文件拖拽** | 支持拖入文件或 Cmd+V 粘贴图片，直接在对话中使用 |
| 🛡️ **安装冲突检测** | 自动检测已有的 OpenClaw 安装，避免端口冲突 |
| 🖋️ **终端命令** | 自动安装 `openclaw` 命令到 PATH，终端也能用 |
| 🌐 **国内网络优化** | 预置镜像配置，国内网络环境也能顺畅使用 |

### 📦 下载安装

前往 [Releases 页面](https://github.com/oneclaw/oneclaw/releases/latest) 下载对应平台的安装包：

| 平台 | 架构 | 下载 |
|---|---|---|
| 🍎 macOS | Apple Silicon (M1/M2/M3/M4) | `OneClaw-x.x.x-arm64.dmg` |
| 🍎 macOS | Intel | `OneClaw-x.x.x-x64.dmg` |
| 🪟 Windows | x64 | `OneClaw-Setup-x.x.x-x64.exe` |
| 🪟 Windows | ARM64 | `OneClaw-Setup-x.x.x-arm64.exe` |

> 💡 **快速判断**：苹果 M 系列选 arm64，Intel Mac 选 x64，绝大多数 Windows 电脑选 x64。

### 🚀 三步上手

```
1️⃣  双击安装包，拖入 Applications / 点击安装
2️⃣  选择服务商，输入 API Key
3️⃣  开始对话！ 🎉
```

就这样。不需要装 Node.js，不需要 `npm`，不需要配置任何环境变量。

### 🤖 支持的 AI 提供商

- Anthropic (Claude)
- OpenAI (GPT / Codex)
- Google (Gemini)
- Moonshot (moonshot.cn / moonshot.ai / Kimi Code)
- 自定义 OpenAI / Anthropic 兼容接口

### 💡 典型使用场景

- 🗂️ "帮我抓取某网站前 20 条内容，导出成 Excel"
- 📊 "整理这批网页信息，输出一份摘要报告"
- 📝 "按我给的规则批量处理表格和文本"

你负责提需求，OneClaw 负责执行。

### 🏗️ 架构

```
OneClaw (Electron)
  ├── 🔧 Gateway 子进程  (内置 Node.js 22 + OpenClaw)
  └── 💬 聊天窗口        (Lit 3 SPA，本地 file:// 加载)
```

### ❓ 常见问题

**Q: 我完全不会编程，可以用吗？**
A: 当然可以！OneClaw 就是为非技术用户设计的 😊

**Q: 需要自己安装 Node.js 或 Git 吗？**
A: 不需要。应用已内置所有运行环境。

**Q: Setup 之后可以换 Provider 吗？**
A: 可以。在托盘菜单点「设置」（或 macOS `Cmd+,`）即可修改。

**Q: 支持哪些聊天渠道？**
A: 飞书、企业微信、钉钉、QQ Bot、微信。在设置 → 渠道 中扫码绑定即可。

---

### ⭐ 觉得有用？给个 Star 吧！

如果 OneClaw 帮到了你，请给个 ⭐ Star 支持一下！你的每一颗 Star 都是我们持续改进的动力 💪❤️

[![Star History Chart](https://api.star-history.com/svg?repos=oneclaw/oneclaw&type=Date)](https://star-history.com/#oneclaw/oneclaw&Date)

### 🤝 参与贡献

想参与开发？请先阅读 **[CONTRIBUTING.md](CONTRIBUTING.md)**。

---

## 🇬🇧 English

### ✨ Why OneClaw?

> **No Node.js. No `npm install`. No environment variables.**
> Download → double-click → enter API Key → start chatting. That's it.

OneClaw wraps [OpenClaw](https://github.com/anthropics/claude-code) into a **ready-to-use** desktop app. It bundles a Node.js runtime and the full OpenClaw Gateway — zero dev tooling required.

Its goal is simple: **AI that gets things done, not just chats.** 🎯

| 🚀 Feature | Description |
|---|---|
| ⚡ **One-Minute Install** | Download → install → enter Key → chat, under 60 seconds |
| 🖥️ **Cross-Platform** | macOS (Apple Silicon / Intel) + Windows (x64 / ARM64) |
| 🔒 **Keys Stay Local** | API keys are stored on your machine, never uploaded anywhere |
| 🤖 **Multi-Model** | Anthropic / OpenAI / Google / Kimi / Custom endpoints, switch models mid-chat |
| 🔄 **Auto-Update** | Built-in CDN updates with "What's New" changelog after each upgrade |
| 🧠 **Advanced Memory** | Saves conversation context across sessions, with memory search and scheduled tasks |
| 🔍 **Kimi Search** | Integrated web search via Kimi Search |
| 💬 **Multi-Channel** | Feishu / WeCom / DingTalk / QQ Bot / WeChat — connect your team IM in one click |
| 🧩 **Skill Store** | Built-in clawhub marketplace for installing extension skills |
| 📎 **File Attachments** | Drag-and-drop files or Cmd+V paste images directly into chat |
| 🛡️ **Conflict Detection** | Auto-detects existing OpenClaw installations to avoid port conflicts |
| 🖋️ **Terminal Command** | Auto-installs `openclaw` command to PATH |
| 🌐 **China-Friendly** | Pre-configured mirror defaults for smoother experience in China |

### 📦 Download

Head to the [Releases page](https://github.com/oneclaw/oneclaw/releases/latest) and grab the installer for your platform:

| Platform | Architecture | File |
|---|---|---|
| 🍎 macOS | Apple Silicon (M1/M2/M3/M4) | `OneClaw-x.x.x-arm64.dmg` |
| 🍎 macOS | Intel | `OneClaw-x.x.x-x64.dmg` |
| 🪟 Windows | x64 | `OneClaw-Setup-x.x.x-x64.exe` |
| 🪟 Windows | ARM64 | `OneClaw-Setup-x.x.x-arm64.exe` |

> 💡 **Quick tip**: Apple M-series → arm64, Intel Mac → x64, most Windows PCs → x64.

### 🚀 Get Started in 3 Steps

```
1️⃣  Install — drag to Applications / click the installer
2️⃣  Configure — pick a provider, enter your API Key
3️⃣  Chat! 🎉
```

No Node.js, no `npm`, no environment setup. Just works.

### 🤖 Supported AI Providers

- Anthropic (Claude)
- OpenAI (GPT / Codex)
- Google (Gemini)
- Moonshot (moonshot.cn / moonshot.ai / Kimi Code)
- Custom OpenAI / Anthropic-compatible API

### 💡 Typical Use Cases

- 🗂️ "Scrape the top 20 posts from a website and export to Excel"
- 📊 "Summarize a batch of webpages into a report"
- 📝 "Process text and spreadsheets in bulk with my rules"

You define the goal, OneClaw executes.

### 🏗️ Architecture

```
OneClaw (Electron)
  ├── 🔧 Gateway subprocess  (bundled Node.js 22 + OpenClaw)
  └── 💬 Chat window         (Lit 3 SPA, loaded via file://)
```

### ❓ FAQ

**Q: Can I use this if I don't code at all?**
A: Absolutely! OneClaw is designed for non-technical users 😊

**Q: Do I need to install Node.js or Git myself?**
A: No. The app includes everything it needs.

**Q: Can I change the provider after setup?**
A: Yes. Open Settings from the tray menu (or `Cmd+,` on macOS) to change anytime.

**Q: Which chat channels are supported?**
A: Feishu (Lark), WeCom, DingTalk, QQ Bot, and WeChat. Go to Settings → Channels and scan to connect.

---

### ⭐ Like it? Give us a Star!

If OneClaw saves you time, drop a ⭐ Star — it means a lot and keeps us going! 💪❤️

---

### 🤝 Contributing

Want to contribute? Please read **[CONTRIBUTING.md](CONTRIBUTING.md)** first.

---

## 📄 License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`).

Commercial use is allowed, but if you modify and distribute this software, or provide a modified version over a network, you must provide the corresponding source code under AGPL v3.
