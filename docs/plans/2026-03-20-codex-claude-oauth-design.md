# Codex OAuth + Claude Setup Token 设计

日期: 2026-03-20

## 概述

在 OneClaw 的 Setup 和 Settings 页面新增两个 provider 的认证支持：

1. **OpenAI Codex** — Authorization Code + PKCE 流程（参考 openclaw 上游 `pi-ai` 实现）
2. **Claude (Anthropic)** — Setup Token 粘贴验证（参考 openclaw 上游 `provider-auth-token.ts`）

## 方案选择

**自实现（方案 A）**，不依赖 `pi-ai` 库或 gateway 子进程的 OAuth 能力。理由：

- OneClaw 已有 Kimi OAuth 完整模板，Codex OAuth 只是流程类型不同
- Claude Setup Token 极简，不值得引入额外依赖
- 自实现可完全控制 GUI 体验

## 架构

### 新增模块

| 文件 | 职责 |
|------|------|
| `src/codex-oauth.ts` | Codex Authorization Code + PKCE 全流程 |
| `src/claude-auth.ts` | Claude Setup Token 格式校验 |

### 修改模块

| 文件 | 变更 |
|------|------|
| `src/preload.ts` | 新增 4 个 Codex OAuth IPC 方法 |
| `src/setup-ipc.ts` | 注册 Codex OAuth IPC handlers |
| `src/settings-ipc.ts` | Codex OAuth 状态查询 + 登出 |
| `src/provider-config.ts` | 新增 openai-codex / claude provider preset |
| `setup/index.html` | 新增 provider 选项 + OAuth/Token UI 区域 |
| `setup/setup.js` | Codex OAuth 按钮逻辑 + Claude Token 校验 |
| `settings/index.html` | OAuth 状态展示区域 |
| `settings/settings.js` | Provider tab 显示 OAuth 状态 |

## 详细设计

### 1. `codex-oauth.ts`

**常量：**

```
CLIENT_ID        = "app_EMoamEEZ73f0CkXaXp7hrann"  // 复用 openclaw 上游
AUTHORIZE_URL    = "https://auth.openai.com/oauth/authorize"
TOKEN_URL        = "https://auth.openai.com/oauth/token"
REDIRECT_URI     = "http://localhost:1455/auth/callback"
SCOPE            = "openid profile email offline_access"
TOKEN_FILE       = ~/.openclaw/credentials/codex-oauth-token.json (0o600)
REFRESH_INTERVAL = 60s
REFRESH_THRESHOLD= 300s
```

**PKCE：**
- verifier: `crypto.randomBytes(32).toString('hex')`
- challenge: `crypto.createHash('sha256').update(verifier).digest('base64url')`
- state: `crypto.randomBytes(16).toString('hex')`

**本地 HTTP Server：**
- 监听 `127.0.0.1:1455`
- 只处理 `GET /auth/callback`
- 校验 state 参数（CSRF 防护）
- 提取 code，返回 HTML 成功页（"认证成功，请返回 OneClaw"）
- 提取后立即关闭 server

**Token 交换：**
- `POST auth.openai.com/oauth/token`
- body: `grant_type=authorization_code&client_id=...&code=...&code_verifier=...&redirect_uri=...`
- 响应: `{ access_token, refresh_token, expires_in }`

**导出函数：**

| 函数 | 说明 |
|------|------|
| `codexOAuthLogin()` | 完整流程：PKCE → 开浏览器 → 本地 server → 换 token → 保存 |
| `codexOAuthCancel()` | 关闭本地 server + 中止等待 |
| `codexOAuthLogout()` | 删除 token + 停止刷新 |
| `loadCodexOAuthToken()` | 读取 sidecar 文件 |
| `saveCodexOAuthToken(token)` | 写入 sidecar 文件 (0o600) |
| `refreshCodexOAuthToken(token)` | grant_type=refresh_token 换新 token |
| `startCodexTokenRefresh(cb?)` | 启动定时刷新（60s 间隔，300s 阈值） |
| `stopCodexTokenRefresh()` | 停止定时刷新 |
| `getCodexOAuthStatus()` | 返回 `{loggedIn, expiresAt?}` |

**错误处理：**
- 端口 1455 被占用 → 返回错误提示
- state 不匹配 → 400，登录失败
- token 交换失败 → 返回 HTTP 状态码
- refresh 401/403 → 删除 token，提示重新登录

### 2. `claude-auth.ts`

**常量：**

```
SETUP_TOKEN_PREFIX     = "sk-ant-oat01-"
SETUP_TOKEN_MIN_LENGTH = 80
CONSOLE_URL            = "https://console.anthropic.com"
```

**导出函数：**

| 函数 | 说明 |
|------|------|
| `validateClaudeSetupToken(raw)` | 格式校验：前缀 + 最小长度，返回错误消息或 undefined |
| `verifyClaudeSetupToken(token)` | 调用 verifyAnthropic(token) 验证可用性 |

**无 OAuth 流程、无 token 刷新、无 sidecar 文件。** Setup token 直接作为 apiKey 写入 provider config。

### 3. IPC

**新增 channels：**

```
codex-oauth:login   → codexOAuthLogin()
codex-oauth:cancel  → codexOAuthCancel()
codex-oauth:logout  → codexOAuthLogout()
codex-oauth:status  → getCodexOAuthStatus()
```

Claude 不需要专用 IPC — 格式校验在渲染进程，验证和保存走现有 `setup:verify-key` + `setup:save-config`。

**Preload 新增：**

```
codexOAuthLogin, codexOAuthCancel, codexOAuthLogout, codexOAuthStatus
```

### 4. Provider Config

`provider-config.ts` 新增 preset（verify 函数已有，无需新增）：

- `openai-codex`: providerKey=`openai`, baseUrl=`https://api.openai.com/v1`, api=`openai-completions`
- `claude`: providerKey=`anthropic`, baseUrl=`https://api.anthropic.com/v1`, api=`anthropic-messages`

### 5. Setup UI

**Provider 下拉新增：**
- `OpenAI (Codex)` — 选中后显示 OAuth 登录按钮
- `Claude (Anthropic)` — 选中后显示 Setup Token 输入 + 「获取 Token」链接

**Codex OAuth UI（复用 Kimi OAuth 模式）：**
- 「登录 OpenAI」按钮 + 加载动画 + 取消按钮
- 状态文字：「等待浏览器授权…」→「登录成功！」
- API Key 输入框收进 `<details>` 折叠

**Claude UI：**
- Setup Token 输入框（placeholder: `sk-ant-oat01-...`）
- 「获取 Token」链接 → `shell.openExternal(console.anthropic.com)`
- 前端即时格式校验
- API Key 输入框收进 `<details>` 折叠

### 6. Settings UI

**Codex 已登录时：**
- 显示「已通过 OAuth 登录」状态
- 「退出登录」按钮 → `codexOAuthLogout()`

**Claude：** 无特殊状态展示。

### 7. Config 写入

OAuth 登录成功 → `saveConfig` 写入 `openclaw.json` → gateway 自行感知变化。无需手动重启。

## 数据流

```
Codex OAuth:
  点击"登录" → shell.openExternal(auth.openai.com/authorize?pkce...)
  → localhost:1455 接收 callback → code + verifier
  → POST auth.openai.com/oauth/token → {access, refresh, expires}
  → 保存 ~/.openclaw/credentials/codex-oauth-token.json
  → access_token 写入 openclaw.json provider config
  → 启动定时刷新

Claude Auth:
  点击"获取 Token" → shell.openExternal(console.anthropic.com)
  → 用户粘贴 sk-ant-oat01-... token
  → 格式校验 + verifyAnthropic() 验证
  → apiKey 写入 openclaw.json provider config
```

## i18n

两套文案（en/zh），沿用 `data-i18n` 属性 + JS 字典模式。
