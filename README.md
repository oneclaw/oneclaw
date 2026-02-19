# OneClaw

OneClaw is an AI desktop assistant built for everyday users.
You describe what you want, and it can automate browser tasks, organize information, and generate files.

OneClaw means **One-Click OpenClaw**.

中文文档: [README.zh.md](README.zh.md)

Its goal is simple: **AI that gets things done, not just chats.**

## Why OneClaw

- One-click install: double-click and run, no terminal needed
- Zero setup burden: no need to install Node.js, Git, or npm
- Simple onboarding: choose a model provider and enter your API key
- Real task execution: browser automation, data extraction, and file generation
- Cross-platform: supports macOS and Windows (x64 / arm64)
- China-friendly network defaults: smoother experience in restricted network environments
- Settings: change provider, model, and chat channel anytime
- Feishu integration: connect Feishu (Lark) as a chat channel
- Auto-update: always stay on the latest version
- System tray: runs in background, supports Chinese and English

## Typical Use Cases

- "Collect the top 20 posts from a website and export them to Excel"
- "Summarize a batch of webpages into a report"
- "Process text and spreadsheets in bulk based on my rules"

You define the goal, OneClaw executes.

## Download

- Releases: <https://github.com/nicepkg/oneclaw/releases>

## Which Installer Should I Choose?

Choose by your OS and CPU architecture:

- `OneClaw-<version>-arm64.dmg`: macOS on Apple Silicon (M1/M2/M3/M4)
- `OneClaw-<version>-x64.dmg`: macOS on Intel chips (2020 and earlier Intel Macs)
- `OneClaw-Setup-<version>-x64.exe`: most Windows PCs with Intel/AMD CPUs
- `OneClaw-Setup-<version>-arm64.exe`: Windows on ARM devices (for example Snapdragon X Elite)

Quick tips:

- On Apple Silicon Macs, prefer `arm64.dmg` (native and faster)
- On Intel Macs (2020 and earlier), use `x64.dmg`
- On most Windows laptops/desktops, use `x64.exe`
- Use `arm64.exe` only if your Windows device is ARM-based

## Get Started

1. Download and install OneClaw (macOS or Windows)
2. On first launch, choose your AI provider and enter your API key
3. Open the main window and start giving tasks in natural language

## Supported AI Providers

- Anthropic
- OpenAI
- Google
- Moonshot (moonshot.cn / moonshot.ai / Kimi Code)
- Custom OpenAI/Anthropic-compatible API

## FAQ

**Q: Can I use this if I don't code at all?**
A: Yes. OneClaw is designed for non-technical users.

**Q: Do I need to install Node.js or Git myself?**
A: No. The app includes everything it needs.

**Q: Is the initial setup complicated?**
A: Not really. Follow the setup flow, pick a provider, and enter your API key.

**Q: Can I change the provider after setup?**
A: Yes. Open Settings from the tray menu (or `Cmd+,` on macOS) to change provider, model, or channel config.

**Q: What is the Feishu channel?**
A: You can connect OneClaw to Feishu (Lark) so it works as a chat bot in your Feishu workspace.

## License

GNU Affero General Public License v3.0 (`AGPL-3.0-only`).

Commercial use is allowed, but if you modify and distribute this software, or provide a modified version over a network, you must provide the corresponding source code under AGPL v3.
