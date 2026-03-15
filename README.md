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
| 🤖 **多模型支持** | Anthropic / OpenAI / Google / Kimi / 自定义接口，随时切换 |
| 🎭 **Live2D 桌面宠物** | 透明悬浮窗 Live2D 角色，陪你聊天、帮你干活 |
| 🎤 **语音对话** | 按住 `C` 键说话，AI 语音回复 + 嘴型同步，解放双手 |
| 🔄 **自动更新** | 内置 CDN 更新，无需手动下载新版本 |
| 🧠 **会话记忆** | 自动保存对话上下文，新会话延续旧记忆 |
| 🔍 **Kimi 搜索** | 集成 Kimi Search 联网搜索能力 |
| 💬 **飞书集成** | 支持飞书机器人频道，团队共享 AI 助手 |
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

### 🎭 Live2D 桌面宠物 + 语音对话

OneClaw 内置一个 Live2D 桌面角色，悬浮在屏幕上，支持语音交互：

**语音对话操作：**

| 操作 | 说明 |
|---|---|
| **按住 `C` 键** | 开始录音（按住说话，松开发送） |
| **松开 `C` 键** | 停止录音，语音自动转文字 → 发送给 AI → AI 语音回复 |
| **点击麦克风按钮** | 切换持续录音模式（点击开始/再点击停止） |
| **长按麦克风按钮** | 按住说话模式（500ms 后开始录音） |

**语音对话流程：**
```
🎤 你说话 → 语音识别(ASR) → 文字发送到聊天 → AI 回复
   → 文字转语音(TTS) → Live2D 角色说话 + 嘴型同步 👄
```

> 💡 语音功能需要下载语音模型文件（约 200MB），首次使用前请参考 [语音模型配置](#-语音模型配置) 章节。

### 🔊 语音模型配置

语音功能依赖 sherpa-onnx 模型文件，需手动下载到 `resources/models/speech/` 目录：

| 模型 | 用途 | 下载 |
|---|---|---|
| `sherpa-onnx-streaming-paraformer-bilingual-zh-en/` | 语音识别 (ASR) | [sherpa-onnx 模型仓库](https://github.com/k2-fsa/sherpa-onnx/releases) |
| `vits-zh-hf-theresa/` | 语音合成 (TTS) | [sherpa-onnx 模型仓库](https://github.com/k2-fsa/sherpa-onnx/releases) |
| `silero_vad.onnx` | 语音活动检测 (VAD，可选) | [sherpa-onnx 模型仓库](https://github.com/k2-fsa/sherpa-onnx/releases) |

放置后的目录结构：
```
resources/models/speech/
  ├── silero_vad.onnx
  ├── sherpa-onnx-streaming-paraformer-bilingual-zh-en/
  │   ├── encoder.int8.onnx
  │   ├── decoder.int8.onnx
  │   └── tokens.txt
  └── vits-zh-hf-theresa/
      ├── theresa.onnx
      ├── tokens.txt
      └── lexicon.txt
```

> ⚠️ 语音模型文件较大，不包含在代码仓库中。没有模型文件时，语音功能自动禁用，其他功能不受影响。

### 🏗️ 架构

```
OneClaw (Electron)
  ├── 🔧 Gateway 子进程     (内置 Node.js 22 + OpenClaw)
  ├── 🗣️ TTS 子进程         (Node.js + sherpa-onnx 语音合成，按需启动)
  ├── 💬 聊天窗口            (Lit 3 SPA，本地 file:// 加载)
  └── 🎭 Live2D 窗口        (透明悬浮窗，语音对话 + 嘴型同步)
```

**语音对话流水线：**
```
麦克风 → ASR 语音识别 → 文字注入聊天 → AI 回复
  → TTS 语音合成(子进程) → WAV 文件 → Audio 播放 + 嘴型同步
```

### ❓ 常见问题

**Q: 我完全不会编程，可以用吗？**
A: 当然可以！OneClaw 就是为非技术用户设计的 😊

**Q: 需要自己安装 Node.js 或 Git 吗？**
A: 不需要。应用已内置所有运行环境。

**Q: Setup 之后可以换 Provider 吗？**
A: 可以。在托盘菜单点「设置」（或 macOS `Cmd+,`）即可修改。

**Q: 飞书频道是什么？**
A: 你可以把 OneClaw 连接到飞书，让它作为飞书工作区中的聊天机器人工作。

---

### ⭐ 觉得有用？给个 Star 吧！

如果 OneClaw 帮到了你，请给个 ⭐ Star 支持一下！你的每一颗 Star 都是我们持续改进的动力 💪❤️

[![Star History Chart](https://api.star-history.com/svg?repos=oneclaw/oneclaw&type=Date)](https://star-history.com/#oneclaw/oneclaw&Date)

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
| 🤖 **Multi-Provider** | Anthropic / OpenAI / Google / Kimi / Custom endpoints |
| 🎭 **Live2D Desktop Pet** | Transparent overlay Live2D character that chats and works with you |
| 🎤 **Voice Chat** | Hold `C` to talk, AI replies with voice + lip sync, hands-free interaction |
| 🔄 **Auto-Update** | Built-in CDN updates, no manual downloads needed |
| 🧠 **Session Memory** | Automatically saves conversation context across sessions |
| 🔍 **Kimi Search** | Integrated web search via Kimi Search |
| 💬 **Chat Integrations** | Built-in Feishu and QQ bot access for chatting with OneClaw from messaging apps |
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

### 🎭 Live2D Desktop Pet + Voice Chat

OneClaw includes a Live2D desktop character that floats on your screen and supports voice interaction:

**Voice Chat Controls:**

| Action | Description |
|---|---|
| **Hold `C` key** | Start recording (push-to-talk, release to send) |
| **Release `C` key** | Stop recording, speech auto-transcribed → sent to AI → AI voice reply |
| **Click mic button** | Toggle continuous recording mode (click to start/stop) |
| **Long-press mic button** | Push-to-talk via mouse hold (500ms activation) |

**Voice Pipeline:**
```
🎤 You speak → ASR transcription → text sent to chat → AI reply
   → Text-to-Speech (TTS) → Live2D character speaks + lip sync 👄
```

> 💡 Voice features require speech model files (~200MB). See [Speech Model Setup](#-speech-model-setup) below.

### 🔊 Speech Model Setup

Voice features depend on sherpa-onnx model files. Download them to `resources/models/speech/`:

| Model | Purpose | Source |
|---|---|---|
| `sherpa-onnx-streaming-paraformer-bilingual-zh-en/` | Speech Recognition (ASR) | [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) |
| `vits-zh-hf-theresa/` | Speech Synthesis (TTS) | [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) |
| `silero_vad.onnx` | Voice Activity Detection (optional) | [sherpa-onnx releases](https://github.com/k2-fsa/sherpa-onnx/releases) |

Expected directory structure:
```
resources/models/speech/
  ├── silero_vad.onnx
  ├── sherpa-onnx-streaming-paraformer-bilingual-zh-en/
  │   ├── encoder.int8.onnx
  │   ├── decoder.int8.onnx
  │   └── tokens.txt
  └── vits-zh-hf-theresa/
      ├── theresa.onnx
      ├── tokens.txt
      └── lexicon.txt
```

> ⚠️ Model files are large and not included in the repository. Without models, voice features are automatically disabled — all other features work normally.

### 🏗️ Architecture

```
OneClaw (Electron)
  ├── 🔧 Gateway subprocess    (bundled Node.js 22 + OpenClaw)
  ├── 🗣️ TTS subprocess        (Node.js + sherpa-onnx speech synthesis, on-demand)
  ├── 💬 Chat window            (Lit 3 SPA, loaded via file://)
  └── 🎭 Live2D window         (transparent overlay, voice chat + lip sync)
```

**Voice Pipeline:**
```
Microphone → ASR recognition → text injected into chat → AI reply
  → TTS synthesis (subprocess) → WAV file → Audio playback + lip sync
```

### ❓ FAQ

**Q: Can I use this if I don't code at all?**
A: Absolutely! OneClaw is designed for non-technical users 😊

**Q: Do I need to install Node.js or Git myself?**
A: No. The app includes everything it needs.

**Q: Can I change the provider after setup?**
A: Yes. Open Settings from the tray menu (or `Cmd+,` on macOS) to change anytime.

**Q: What is the Feishu channel?**
A: You can connect OneClaw to Feishu (Lark) so it works as a chat bot in your Feishu workspace.

---

### ⭐ Like it? Give us a Star!

If OneClaw saves you time, drop a ⭐ Star — it means a lot and keeps us going! 💪❤️

---

## 📄 License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`).

Commercial use is allowed, but if you modify and distribute this software, or provide a modified version over a network, you must provide the corresponding source code under AGPL v3.
