# OneClaw

OneClaw 是一个给普通用户使用的 AI 桌面助手。  
你只需要说一句话，它就可以帮你自动操作浏览器、整理信息、生成文件。

OneClaw 的含义是：**One-Click OpenClaw（一步打开 OpenClaw）**。

English version: [README.md](README.md)

它的目标很简单：**让 AI 真正替你动手做事，而不是只会聊天。**

## 为什么用 OneClaw

- 一键安装：双击安装包就能用，不需要命令行
- 零环境门槛：不需要自己安装 Node.js、Git、npm
- 配置简单：首次启动只要选择模型并填入 API Key
- 自动执行任务：支持浏览器操作、数据抓取、文件生成
- 跨平台：支持 macOS 和 Windows（x64 / arm64）
- 国内网络优化：预置镜像配置，国内网络环境也能顺畅使用

## 典型使用场景

- “帮我抓取某网站前 20 条内容，导出成 Excel”
- “整理这批网页信息，输出一份摘要报告”
- “按我给的规则批量处理表格和文本”

你负责提需求，OneClaw 负责执行。

## 三步上手

1. 下载并安装 OneClaw（macOS 或 Windows 版本）
2. 首次打开时，选择你的 AI 提供商并填写 API Key
3. 进入主界面后，直接用自然语言下达任务

## 支持的 AI 提供商

- Anthropic
- Moonshot（含 moonshot.ai / moonshot.cn / Kimi Code）
- OpenAI
- Google
- 自定义 OpenAI 兼容接口

## 下载

- Releases: <https://github.com/oneclaw/oneclaw/releases>

## 我该下载哪个安装包？

按你的系统和芯片架构选择：

- `OneClaw-<version>-arm64.dmg`：Apple Silicon Mac（M1/M2/M3/M4）
- `OneClaw-<version>-x64.dmg`：Intel 芯片 Mac（2020 年及更早 Intel 机型）
- `OneClaw-Setup-<version>-x64.exe`：绝大多数 Intel/AMD 的 Windows 电脑
- `OneClaw-Setup-<version>-arm64.exe`：Windows ARM 设备（例如 Snapdragon X Elite）

快速判断：

- 苹果 M 系列芯片，选 `arm64.dmg`（原生性能更好）
- Intel Mac（2020 年及更早），选 `x64.dmg`
- 大部分 Windows 台式机/笔记本，选 `x64.exe`
- 只有在 Windows ARM 设备上才选 `arm64.exe`

## 常见问题

**Q: 我完全不会编程，可以用吗？**  
A: 可以。OneClaw 就是为非技术用户设计的桌面应用。

**Q: 需要自己安装 Node.js 或 Git 吗？**  
A: 不需要。应用已内置运行环境。

**Q: 首次配置复杂吗？**  
A: 不复杂。按引导选择模型并填 API Key，一般几分钟内可完成。
