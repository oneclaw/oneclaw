# Codex OAuth + Claude Setup Token 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 OneClaw 的 Setup 和 Settings 页面新增 OpenAI Codex OAuth 登录和 Claude Setup Token 认证。

**Architecture:** 新增 `codex-oauth.ts`（Authorization Code + PKCE 完整流程，模仿 `kimi-oauth.ts`）和 `claude-auth.ts`（纯格式校验）。通过 IPC 桥接暴露给 Setup/Settings 前端。Codex token 以 sidecar 文件存储并定时刷新；Claude token 直接作为 API Key 写入 provider config。

**Tech Stack:** TypeScript (CJS), Node.js `crypto` + `http` + `https`, Electron IPC, vanilla HTML/CSS/JS (Setup/Settings)

---

### Task 1: 创建 `src/codex-oauth.ts` — 核心 OAuth 模块

**Files:**
- Create: `src/codex-oauth.ts`
- Reference: `src/kimi-oauth.ts` (完整模板)

**Step 1: 创建 codex-oauth.ts 核心模块**

参考 `src/kimi-oauth.ts` 的整体结构，创建 `src/codex-oauth.ts`，包含：

```typescript
// 常量
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const REFRESH_CHECK_INTERVAL_MS = 60_000;
const REFRESH_THRESHOLD_S = 300;

// Token 文件路径: ~/.openclaw/credentials/codex-oauth-token.json (0o600)
```

关键函数：

1. **PKCE 生成** — `generatePkce()`: `crypto.randomBytes(32)` → verifier, `sha256(verifier).base64url` → challenge
2. **本地 HTTP server** — `startCallbackServer(state)`: 监听 `127.0.0.1:1455`，只处理 `GET /auth/callback`，校验 state，提取 code，返回 HTML 成功页，返回 `Promise<string>` (code)
3. **Token 交换** — `exchangeCode(code, verifier)`: POST `TOKEN_URL`，body `grant_type=authorization_code&client_id=...&code=...&code_verifier=...&redirect_uri=...`，返回 `{access_token, refresh_token, expires_in}`
4. **Token 持久化** — `loadCodexOAuthToken()` / `saveCodexOAuthToken(token)` / `deleteCodexOAuthToken()`: 参照 kimi-oauth.ts 的 sidecar 文件模式
5. **Token 刷新** — `refreshCodexOAuthToken(token)`: POST `TOKEN_URL`，`grant_type=refresh_token`
6. **定时刷新** — `startCodexTokenRefresh(cb?)` / `stopCodexTokenRefresh()`: 60s 间隔，300s 阈值
7. **完整登录** — `codexOAuthLogin()`: PKCE → 启动 server → `shell.openExternal(authorizeUrl)` → 等待 code → 交换 token → 保存 → 返回 `{success, accessToken?, message?}`
8. **取消/登出/状态** — `codexOAuthCancel()` / `codexOAuthLogout()` / `getCodexOAuthStatus()`

关键差异（vs kimi-oauth.ts）：
- Kimi 是 Device Code Flow（轮询），Codex 是 Authorization Code Flow（本地 server 回调）
- Codex 需要 PKCE（S256 challenge）
- Codex 的 HTTP 通信用 `https`（token endpoint），回调 server 用 `http`
- Token 文件路径不同：`codex-oauth-token.json`

取消机制：用 `abortController` 或关闭 server 来中止等待。

错误处理：
- 端口 1455 被占用 → `{ success: false, message: "Port 1455 is in use" }`
- state 不匹配 → 返回 400，关闭 server
- token 交换失败 → 返回 HTTP 错误
- refresh 401/403 → 删除 token 文件

**Step 2: 验证模块编译**

Run: `npx tsc --noEmit src/codex-oauth.ts`
Expected: 无编译错误

**Step 3: Commit**

```bash
git add src/codex-oauth.ts
git commit -m "feat: add Codex OAuth module (Authorization Code + PKCE)"
```

---

### Task 2: 创建 `src/claude-auth.ts` — Setup Token 校验

**Files:**
- Create: `src/claude-auth.ts`
- Reference: openclaw `extensions/anthropic/index.ts` (setup token 验证逻辑)

**Step 1: 创建 claude-auth.ts**

```typescript
// 常量
const SETUP_TOKEN_PREFIX = "sk-ant-oat01-";
const SETUP_TOKEN_MIN_LENGTH = 80;
const CONSOLE_URL = "https://console.anthropic.com";

// 格式校验：返回错误消息字符串，合法返回 undefined
export function validateClaudeSetupToken(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed.startsWith(SETUP_TOKEN_PREFIX)) {
    return `Expected token starting with ${SETUP_TOKEN_PREFIX}`;
  }
  if (trimmed.length < SETUP_TOKEN_MIN_LENGTH) {
    return "Token looks too short; paste the full setup-token";
  }
  return undefined;
}

export { CONSOLE_URL };
```

注意：`verifyClaudeSetupToken()` 不需要单独实现，直接复用 `provider-config.ts` 的 `verifyAnthropic()`。

**Step 2: 验证模块编译**

Run: `npx tsc --noEmit src/claude-auth.ts`
Expected: 无编译错误

**Step 3: Commit**

```bash
git add src/claude-auth.ts
git commit -m "feat: add Claude Setup Token validation module"
```

---

### Task 3: 注册 IPC + Preload 桥接

**Files:**
- Modify: `src/preload.ts:32-37` (在 kimiOAuth 方法后插入)
- Modify: `src/setup-ipc.ts:151-181` (在 kimi-oauth handler 后插入)

**Step 1: 修改 preload.ts**

在 `kimiOAuthStatus` 之后（约第 37 行），插入：

```typescript
// Codex OAuth
codexOAuthLogin: () => ipcRenderer.invoke("codex-oauth:login"),
codexOAuthCancel: () => ipcRenderer.invoke("codex-oauth:cancel"),
codexOAuthLogout: () => ipcRenderer.invoke("codex-oauth:logout"),
codexOAuthStatus: () => ipcRenderer.invoke("codex-oauth:status"),
```

**Step 2: 修改 setup-ipc.ts**

在 kimi-oauth handler 注册块之后（约第 181 行），插入 Codex OAuth 的 4 个 handler：

```typescript
// --- Codex OAuth ---
ipcMain.handle("codex-oauth:login", async (event) => {
  const { codexOAuthLogin } = await import("./codex-oauth");
  const result = await codexOAuthLogin();
  if (result.success) {
    deps.onOAuthLoginSuccess?.();
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  }
  return result;
});

ipcMain.handle("codex-oauth:cancel", async () => {
  const { codexOAuthCancel } = await import("./codex-oauth");
  codexOAuthCancel();
});

ipcMain.handle("codex-oauth:logout", async () => {
  const { codexOAuthLogout } = await import("./codex-oauth");
  codexOAuthLogout();
});

ipcMain.handle("codex-oauth:status", async () => {
  const { getCodexOAuthStatus } = await import("./codex-oauth");
  return getCodexOAuthStatus();
});
```

**Step 3: 验证编译**

Run: `npm run build`
Expected: 编译通过

**Step 4: Commit**

```bash
git add src/preload.ts src/setup-ipc.ts
git commit -m "feat: register Codex OAuth IPC handlers and preload bridge"
```

---

### Task 4: 更新 main.ts — Codex Token 刷新生命周期

**Files:**
- Modify: `src/main.ts:46` (导入)
- Modify: `src/main.ts:382-385` (gateway 启动后刷新检查)
- Modify: `src/main.ts:408-422` (刷新回调)

**Step 1: 修改 main.ts**

1. 在第 46 行附近添加 codex-oauth 导入：

```typescript
import {
  startCodexTokenRefresh,
  stopCodexTokenRefresh,
  loadCodexOAuthToken,
} from "./codex-oauth";
```

2. 在 gateway 启动后的 Kimi token 刷新检查（约第 382-385 行）旁，添加：

```typescript
if (running && loadCodexOAuthToken()) {
  ensureCodexOAuthTokenRefresh();
}
```

3. 在 `ensureOAuthTokenRefresh()` 附近，添加类似的 `ensureCodexOAuthTokenRefresh()` 函数：

```typescript
// Codex OAuth token 刷新成功后，将新 access_token 同步到 openclaw.json
function ensureCodexOAuthTokenRefresh(): void {
  startCodexTokenRefresh((token) => {
    // 刷新成功 → 更新配置文件中的 apiKey
    try {
      const config = readUserConfig();
      const prov = config?.models?.providers?.["openai"];
      if (prov) {
        prov.apiKey = token.access_token;
        writeUserConfig(config);
      }
    } catch (err) {
      log.warn("Failed to sync refreshed Codex token to config", err);
    }
  });
}
```

4. 在 Setup 完成回调中（约第 501-525 行），如果用户选了 Codex provider，也启动 token 刷新。

**Step 2: 验证编译**

Run: `npm run build`
Expected: 编译通过

**Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: add Codex OAuth token refresh lifecycle to main process"
```

---

### Task 5: 更新 provider-config.ts — 新增 provider preset

**Files:**
- Modify: `src/provider-config.ts:7-18` (PROVIDER_PRESETS)
- Modify: `src/provider-config.ts:426-490` (verifyProvider)

**Step 1: 确认现有 preset**

检查 `PROVIDER_PRESETS` 是否已有 `anthropic` 和 `openai` 条目。根据探索结果，这两个已经存在：
- Anthropic: baseUrl `https://api.anthropic.com/v1`, api `anthropic-messages`
- OpenAI: baseUrl `https://api.openai.com/v1`, api `openai-completions`

验证 `verifyProvider()` 的 switch 分支是否已覆盖 `anthropic` 和 `openai`。

如果已有，这个 Task 只需确认现有配置兼容，可能不需要改动。

如果需要区分 "openai"（API Key）和 "openai-codex"（OAuth），则需要在 `saveMoonshotConfig` 模式基础上增加 Codex 的特殊写法（OAuth token 作为 apiKey + 标记来源）。

**Step 2: 在 setup-ipc.ts 的 `setup:save-config` handler 中**

确认当 provider 为 `openai`（Codex OAuth 场景）或 `anthropic`（Claude 场景）时，`buildProviderConfig()` 能正确生成配置并写入 `openclaw.json`。

预期：现有的 `buildProviderConfig()` + `writeUserConfig()` 路径已经能处理这两个 provider，无需新增特殊逻辑。

**Step 3: Commit（如有改动）**

```bash
git add src/provider-config.ts
git commit -m "feat: ensure provider presets support Codex and Claude auth flows"
```

---

### Task 6: Setup 页面 — HTML 结构

**Files:**
- Modify: `setup/index.html:111-117` (provider tab 按钮)
- Modify: `setup/index.html:160-198` (OAuth 区域)

**Step 1: 修改 setup/index.html**

Provider tab 按钮区域已经有 Anthropic 和 OpenAI 标签。确认其 `data-provider` 属性值（应为 `anthropic` 和 `openai`）。

在现有的 OAuth 区域（`#oauthGroup`）基础上，需要支持多个 OAuth provider 复用同一组 UI 元素，或者为 Codex 和 Claude 各建独立区域。

推荐：**复用同一组 OAuth 按钮**，通过 JS 动态切换文案和行为（和 Kimi OAuth 共用 `#oauthGroup`）。

新增 Claude Setup Token 专属区域（在 `#oauthGroup` 之后）：

```html
<!-- Claude Setup Token 输入区 -->
<div class="field-group hidden" id="claudeTokenGroup">
  <label data-i18n="config.claudeSetupToken">Setup Token</label>
  <div class="input-row">
    <input type="password" id="claudeTokenInput"
           placeholder="sk-ant-oat01-..."
           autocomplete="off" spellcheck="false" />
    <a href="#" id="linkGetClaudeToken" class="link-get-key"
       data-i18n="config.getClaudeToken">获取 Token</a>
  </div>
  <div class="field-error hidden" id="claudeTokenError"></div>
</div>
```

**Step 2: Commit**

```bash
git add setup/index.html
git commit -m "feat: add Codex OAuth and Claude Token UI elements to setup page"
```

---

### Task 7: Setup 页面 — JS 逻辑

**Files:**
- Modify: `setup/setup.js:9-40` (PROVIDERS 对象)
- Modify: `setup/setup.js:106-246` (i18n 文案)
- Modify: `setup/setup.js:456-489` (switchProvider)
- Modify: `setup/setup.js:598-613` (updateOAuthVisibility)
- Modify: `setup/setup.js:638-692` (handleOAuthLogin)

**Step 1: 更新 PROVIDERS 对象**

在 `PROVIDERS` 中确认 `openai` 和 `anthropic` 条目的配置正确。

**Step 2: 添加 i18n 文案**

在 en/zh 字典中新增：

```javascript
// en
"config.codexOAuthLogin": "Log in with OpenAI",
"config.codexOAuthWaiting": "Waiting for browser authorization…",
"config.codexOAuthSuccess": "Login successful!",
"config.claudeSetupToken": "Setup Token",
"config.getClaudeToken": "Get Token",
"config.claudeTokenInvalid": "Invalid token format (expected sk-ant-oat01-…)",

// zh
"config.codexOAuthLogin": "OpenAI 登录",
"config.codexOAuthWaiting": "等待浏览器授权…",
"config.codexOAuthSuccess": "登录成功！",
"config.claudeSetupToken": "Setup Token",
"config.getClaudeToken": "获取 Token",
"config.claudeTokenInvalid": "Token 格式无效（需以 sk-ant-oat01- 开头）",
```

**Step 3: 更新 updateOAuthVisibility()**

扩展条件：

```javascript
function updateOAuthVisibility() {
  // Kimi OAuth
  var isKimiOAuth = currentProvider === "moonshot" && getSubPlatform() === "kimi-code";
  // Codex OAuth
  var isCodexOAuth = currentProvider === "openai";
  // Claude Token
  var isClaudeToken = currentProvider === "anthropic";

  toggleEl(els.oauthGroup, isKimiOAuth || isCodexOAuth);
  toggleEl(els.claudeTokenGroup, isClaudeToken);

  // 更新 OAuth 按钮文案
  if (isCodexOAuth) {
    els.btnOAuthText.textContent = t("config.codexOAuthLogin");
  } else if (isKimiOAuth) {
    els.btnOAuthText.textContent = t("config.oauthLogin");
  }
}
```

**Step 4: 更新 handleOAuthLogin()**

区分 Codex 和 Kimi 的 OAuth 调用：

```javascript
async function handleOAuthLogin() {
  setOAuthLoading(true);
  try {
    var result;
    if (currentProvider === "openai") {
      result = await window.oneclaw.codexOAuthLogin();
    } else {
      result = await window.oneclaw.kimiOAuthLogin();
    }

    if (!result.success) {
      showError(result.message);
      setOAuthLoading(false);
      return;
    }

    // Codex: 直接保存（无需会员验证）
    if (currentProvider === "openai") {
      await window.oneclaw.saveConfig({
        provider: "openai",
        apiKey: result.accessToken,
        modelID: els.modelSelect.value || "o4-mini",
        baseURL: "",
        api: "",
      });
      showOAuthSuccess();
      setTimeout(function () { goToStep(3); }, 600);
      return;
    }

    // Kimi: 原有的会员验证流程...
    // (保持不变)
  } catch (err) {
    showError("Connection error: " + err.message);
    setOAuthLoading(false);
  }
}
```

**Step 5: 添加 Claude Token 处理**

```javascript
// Claude Token 获取链接点击
els.linkGetClaudeToken.addEventListener("click", function (e) {
  e.preventDefault();
  window.oneclaw.openExternal("https://console.anthropic.com");
});

// Claude Token 输入即时校验
els.claudeTokenInput.addEventListener("input", function () {
  var val = els.claudeTokenInput.value.trim();
  if (!val) {
    toggleEl(els.claudeTokenError, false);
    return;
  }
  // 前端校验：前缀 + 长度
  var prefix = "sk-ant-oat01-";
  if (!val.startsWith(prefix) || val.length < 80) {
    els.claudeTokenError.textContent = t("config.claudeTokenInvalid");
    toggleEl(els.claudeTokenError, true);
  } else {
    toggleEl(els.claudeTokenError, false);
  }
});
```

在 `handleVerify()` 中，当 provider 为 `anthropic` 时，优先从 `#claudeTokenInput` 取值。

**Step 6: 更新 handleOAuthCancel()**

```javascript
function handleOAuthCancel() {
  if (currentProvider === "openai") {
    window.oneclaw.codexOAuthCancel?.();
  } else {
    window.oneclaw.kimiOAuthCancel?.();
  }
  setOAuthLoading(false);
  els.oauthStatus.classList.add("hidden");
}
```

**Step 7: Commit**

```bash
git add setup/setup.js
git commit -m "feat: add Codex OAuth and Claude Token logic to setup page"
```

---

### Task 8: Settings 页面 — Codex OAuth 状态展示

**Files:**
- Modify: `settings/index.html` (provider tab 区域)
- Modify: `settings/settings.js` (provider 保存/状态逻辑)
- Modify: `src/settings-ipc.ts` (Codex OAuth 状态查询)

**Step 1: 修改 settings-ipc.ts**

在 settings IPC handler 中添加 Codex OAuth 状态查询和登出：

```typescript
ipcMain.handle("codex-oauth:status", async () => {
  const { getCodexOAuthStatus } = await import("./codex-oauth");
  return getCodexOAuthStatus();
});

ipcMain.handle("codex-oauth:logout", async () => {
  const { codexOAuthLogout } = await import("./codex-oauth");
  codexOAuthLogout();
});
```

注意：这些 channel 可能已在 setup-ipc.ts 注册过。如果 setup 和 settings 窗口共存，需要避免重复注册。检查是否需要用 `ipcMain.handle` 的去重逻辑或在统一入口注册。

**Step 2: 修改 settings/index.html**

在 provider tab 中，添加 Codex OAuth 状态展示区域：

```html
<div class="oauth-status-row hidden" id="codexOAuthStatusRow">
  <span data-i18n="settings.codexOAuthLoggedIn">已通过 OAuth 登录</span>
  <button class="btn-sm btn-danger" id="btnCodexOAuthLogout"
          data-i18n="settings.oauthLogout">退出登录</button>
</div>
```

**Step 3: 修改 settings/settings.js**

Provider tab 加载时检查 Codex OAuth 状态：

```javascript
// 加载 provider 配置后，检查 OAuth 状态
async function checkCodexOAuthStatus() {
  var status = await window.oneclaw.codexOAuthStatus();
  var row = document.getElementById("codexOAuthStatusRow");
  if (row) {
    row.classList.toggle("hidden", !status.loggedIn);
  }
}

// 退出登录按钮
document.getElementById("btnCodexOAuthLogout")?.addEventListener("click", async function () {
  await window.oneclaw.codexOAuthLogout();
  checkCodexOAuthStatus();
});
```

**Step 4: 添加 i18n 文案**

```javascript
// settings i18n
"settings.codexOAuthLoggedIn": "Logged in via OAuth" / "已通过 OAuth 登录",
"settings.oauthLogout": "Sign Out" / "退出登录",
```

**Step 5: Commit**

```bash
git add settings/index.html settings/settings.js src/settings-ipc.ts
git commit -m "feat: add Codex OAuth status display to settings page"
```

---

### Task 9: 集成测试 — 手动验证

**Step 1: 启动开发模式**

Run: `npm run dev`

**Step 2: 验证 Setup 页面**

1. 打开 Setup 向导
2. 切换到 OpenAI tab → 应看到「OpenAI 登录」按钮
3. 点击登录 → 浏览器应打开 `auth.openai.com/oauth/authorize?...`
4. 完成授权 → Setup 窗口应回到前台并显示「登录成功！」
5. 切换到 Anthropic tab → 应看到 Setup Token 输入框 + 「获取 Token」链接
6. 输入无效 token → 应显示格式错误提示
7. 输入有效 token → 验证通过 → 跳转 Step 3

**Step 3: 验证 Settings 页面**

1. 打开 Settings → Provider tab
2. 如果已登录 Codex → 应显示 OAuth 状态 + 退出按钮
3. 点击退出 → 状态消失

**Step 4: 验证 Token 刷新**

1. 登录 Codex OAuth 后等待几分钟
2. 检查 `~/.openclaw/credentials/codex-oauth-token.json` 是否存在
3. 检查 `~/.openclaw/app.log` 中是否有刷新日志

**Step 5: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: integration fixes for Codex OAuth and Claude Token"
```

---

### Task 10: 最终构建验证

**Step 1: 完整构建**

Run: `npm run build`
Expected: 零错误

**Step 2: 检查 TypeScript 类型**

Run: `npx tsc --noEmit`
Expected: 零错误

**Step 3: 最终 Commit**

```bash
git add -A
git commit -m "chore: final build verification for Codex OAuth + Claude Token"
```
