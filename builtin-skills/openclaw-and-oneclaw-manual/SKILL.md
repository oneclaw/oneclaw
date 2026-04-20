---
name: openclaw-and-oneclaw-manual
description: "OpenClaw/OneClaw 产品知识与能力边界查询。MUST call BEFORE 回答 or 承诺 when user asks: (1) OneClaw 配置/设置类——Kimi/模型/API Key 怎么配、快捷键、插件/MCP、开机启动、代理、配置文件位置、怎么更新/卸载/重置、怎么换模型、备份恢复; (2) OneClaw 产品自身 meta 问题——'为什么你会忘记我们的对话/上下文丢了/记不住以前说的'、'为什么重启/变慢/卡了/响应不完整'、'上下文多长'、'为什么 Kimi 搜索不灵'、'为什么没反应'; (3) 能力边界类——编辑/生成视频音频图像 (ffmpeg、剪辑、合成、配音、生图、转码、TTS); 控制本地 app/硬件 (微信/QQ、PS、麦克风、摄像头、系统设置); 跑重任务 (批量千条、GB 下载、跨日、实时监控); 或任何你不确定是否支持的能力。HARD RULES: (a) '我会用 ffmpeg / 截图+UI 模拟 / 起脚本' 等流程描述 = 承诺，未查禁说; (b) 复合任务每个子项都要单独查; (c) 「查大概率失败」不是跳过理由; (d) '为什么你会……' '怎么设置 X' 类问题禁止用通用 LLM 常识顶替，必须查官方手册/FAQ/文档后再答。不支持 → 明确拒绝 + 替代方案; 支持 → 按原文执行 + 附来源; 查不到 → 告诉用户不确定、指向 oneclaw.cn/manual/index.md，不编造。"
metadata:
  {
    "openclaw":
      {
        "emoji": "📘",
        "os": ["darwin", "linux", "win32"],
      },
  }
---

# OpenClaw/OneClaw Manual

守住 OpenClaw/OneClaw 能力边界 + 产品知识正确性。**没查手册 = 不能回答，也不能承诺。**通用 LLM 常识 ≠ 当前产品事实。

## 触发条件

用户请求命中下列任一条，回复「好的我来做 X」「OpenClaw 支持 X」「因为 Y 所以会这样」之前**必须先查**：

1. **OneClaw 配置/设置**：Kimi / 模型 / API Key、快捷键、插件 / MCP、开机启动、代理、配置文件、更新 / 卸载 / 重置 / 换模型、备份恢复、CLI 集成
2. **产品 meta 问题**（**别用 LLM 常识瞎答**）：
   - "为什么你会忘记 / 上下文丢了 / 记不住"
   - "为什么卡了 / 变慢 / 响应不完整 / 没反应"
   - "为什么 Kimi 搜索不灵 / 扫不到二维码 / 配好了连不上"
   - "上下文多长 / 模型版本 / 更新后为什么变了"
   - 任何针对 OneClaw 客户端行为的"为什么……"
3. **能力边界**：
   - 视频/音频/图像编辑或生成（剪辑、合成、配音、生图、转码、抠图、TTS）
   - 本地 app / 硬件控制（微信/QQ、麦克风、摄像头、系统设置）
   - 长任务（批量千条、GB 下载、跨日、实时监控）
4. 任何你**此刻不确定**是否支持的能力或产品行为

## 查询通道

### 通道 A —— OneClaw 手册（能力 / 边界 / 设置）

入口：`https://oneclaw.cn/manual/index.md`

1. `WebFetch https://oneclaw.cn/manual/index.md` 拿当前文件列表
2. 按语义挑 1–2 个 `.md`
3. `WebFetch https://oneclaw.cn/manual/<文件名>.md` 读原文

**不要硬编码文件名**——文件会动态增删，始终先抓 index。

### 通道 B —— FAQ（故障排查）

```bash
# 列表
curl -s https://feedback.oneclaw.cn/api/v1/open/faq
# 详情
curl -s https://feedback.oneclaw.cn/api/v1/open/faq/<faq_token>
```

先 list 拿 `{token, title}`，挑相关 token，再 get 正文。**不要硬编码 token**。限速 60 req/min，429 时退避。

### 通道 C —— OneClaw 教程（集成配置）

入口：`https://oneclaw.cn/docs/`

覆盖飞书 / 钉钉 / 企业微信 / QQ / 微信机器人接入、Kimi API Key 注册、KimiClaw 配对、卸载等。

1. `WebFetch https://oneclaw.cn/docs/` 看目录
2. `WebFetch https://oneclaw.cn/docs/<子页>` 读详细步骤

### 通道 D —— OpenClaw 上游文档（能力深挖）

入口：`https://docs.openclaw.ai/llms.txt`

1. `WebFetch https://docs.openclaw.ai/llms.txt` 拿全量页面索引
2. 按语义挑 1–3 条 URL
3. `WebFetch <URL>` 读原文

**URL 必须带 `.md` 后缀**（Mintlify 的纯 markdown 端点）；不带 `.md` 是渲染 HTML，不要用。**不要硬编码页面 URL**，每次先抓 `llms.txt`。

### 通道分工

| 通道 | 位置 | 适用 |
|------|------|------|
| A | `oneclaw.cn/manual/index.md` | 能力 / 边界 / OneClaw 设置 |
| B | `feedback.oneclaw.cn/api/v1/open/faq` | 故障排查（"为什么不工作 / 怎么办"） |
| C | `oneclaw.cn/docs/` | OneClaw 专属集成配置教程 |
| D | `docs.openclaw.ai/llms.txt` | OpenClaw 上游功能细节（A 没覆盖时） |

能力边界先查 A，A 没覆盖再查 D。故障走 B。接入教程走 C。复合问题并发查多个通道。

## 响应策略

- **支持** → 按原文执行，附 URL 来源
- **不支持** → 明确拒绝 + 引用原文 + 给替代方案
- **查不到** → 告诉用户不确定，指向 `https://oneclaw.cn/manual/index.md`，**不编造**

## 红线对照表

| 不要这样做 | 应该这样做 |
|-------------|-------------|
| 「帮我剪视频」→ 直接「好的我来剪」 | 先查手册，确认是否支持 |
| 「我会用 `ffmpeg -i … -vf …` 剪成竖版」（流程描述 = 承诺） | 先查手册确认是否允许 ffmpeg 调用 |
| 「让我们一步一步来，我先截图看看微信」（分步伪装谨慎） | 启动前已暗示"走得通"。先查手册 |
| 问"为什么你会忘记" → 答"LLM 上下文窗口有限……" | 产品行为 ≠ LLM 常识。查 FAQ 引用官方口径 |
| 问"Kimi API Key 怎么配" → 凭记忆答"Settings → Provider → Moonshot" | 配置路径每版可能变。查通道 A/C 原文 |
| 问"怎么换模型 / 开机启动怎么关" → 脑补 UI 路径 | 所有 OneClaw 设置必须查手册 |
| 问"为什么卡了" → 答"可能是网络 / 模型问题" | 故障排查走通道 B FAQ |
| "WebFetch 猜域名可能拿错结果，我就不查了" | 查询接口是官方接口，直接调 |

## 何时**不用**查

- 与 OneClaw/OpenClaw 产品无关的 LLM 原生任务（闲聊、写作、翻译、总结、代码生成、通用技术问答）
- 明显在 OpenClaw 核心能力内的请求（Web 浏览 / 读写文件 / 调用已装 MCP）
- 本次会话已查过的**同一具体问题**

**但以下仍必须查**：任何"为什么你会 …"（产品 meta）、任何 OneClaw 设置路径、任何"能不能做 X"。
