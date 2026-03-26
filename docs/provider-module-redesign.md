# Provider/Model 配置模块重设计

## 问题总结

当前模块是"单模型→多模型"渐进改造，核心问题：
1. **覆写式保存**：每次保存整体替换 `providers[key]`，然后 mergeModels 补救，丢失其他模型的 metadata
2. **状态分裂**：前端 `currentEditingModelKey` + `formMode` 两个变量跟踪同一语义，易失同步
3. **Key 不可预测**：前端无法预知后端 configKey（随机 vs 确定性 vs 预设），导致各种 hack
4. **OAuth/API key 双路径**：OAuth 保存绕过正常 payload 构建，丢失 alias 等字段
5. **按钮语义混乱**：编辑已有模型时显示"新增"，新增时有时显示"保存"

## 设计原则

1. **openclaw.json 是 source of truth**——只做精确的局部修改（patch），不做整体覆写
2. **configKey 由后端统一管理**——前端传意图（"给这个 provider 加/改模型"），不管 key 如何生成
3. **单一状态机**——用一个 discriminated union 替代双变量
4. **统一保存路径**——OAuth 和 API key 走同一个 save pipeline

## 新架构

### 后端 IPC 接口

#### `settings:save-provider`（重设计）

```typescript
interface SaveProviderParams {
  // === 意图 ===
  action: "add" | "update";  // 明确语义，不靠前端状态推断

  // === Provider 标识 ===
  provider: string;            // UI tab: "moonshot" | "anthropic" | "openai" | "google" | "custom"
  subPlatform?: string;        // moonshot 子平台
  customPreset?: string;       // custom tab 预设 key

  // === 编辑模式必填 ===
  modelKey?: string;           // "providerKey/modelId"，update 模式必填

  // === 配置内容 ===
  apiKey: string;
  modelID: string;
  baseURL?: string;
  api?: string;
  supportImage?: boolean;
  modelAlias?: string;
  setAsDefault?: boolean;      // 明确 boolean，不靠 undefined 推断
}
```

**后端处理逻辑**：

```
action === "add":
  1. 解析 configKey（预设 → presetKey，手动 custom → deriveFromURL，内置 → provider）
  2. 如果 providers[configKey] 已存在 → 追加模型到 models 数组（不覆写 provider）
  3. 如果不存在 → 创建新 provider entry
  4. setAsDefault === true 时才设默认

action === "update":
  1. 从 modelKey 解析 providerKey（确定性，不需要推断）
  2. 更新 providers[providerKey] 的 apiKey/baseUrl（如果变了）
  3. 更新 models 数组中对应 modelId 的 entry（原地更新，不覆写）
  4. 应用 alias
```

**核心改变**：不再 `providers[key] = buildProviderConfig()`（整体覆写），而是：
- add → 向已有 provider 追加模型 or 创建新 provider
- update → 只 patch 变更的字段

#### `settings:delete-model`（不变）

#### `settings:set-default-model`（不变）

### 前端状态机

```javascript
// 替代 currentEditingModelKey + formMode 双变量
// 单一 discriminated union
var editorState = { mode: "idle" };
// | { mode: "add" }
// | { mode: "edit", modelKey: string, providerKey: string }

function enterAddMode() {
  editorState = { mode: "add" };
  unlockProviderTabs();
  clearForm();
  setBtnText(t("settings.addModelSave"));  // "新增"
}

function enterEditMode(modelKey) {
  var slash = modelKey.indexOf("/");
  editorState = {
    mode: "edit",
    modelKey: modelKey,
    providerKey: modelKey.slice(0, slash),
  };
  lockProviderTabs(resolveUiProvider(editorState.providerKey));
  fillForm(editorState);
  setBtnText(t("provider.save"));  // "保存"
}

function handleSave() {
  var params = buildParams();
  if (!params) return;

  var payload = {
    ...buildSavePayload(params),
    action: editorState.mode === "edit" ? "update" : "add",
    modelKey: editorState.mode === "edit" ? editorState.modelKey : undefined,
    setAsDefault: editorState.mode === "edit",  // 编辑保持默认，新增不设
  };

  // OAuth 也走这里，只是 apiKey 来源不同
  save(payload);
}
```

### 后端 save 实现（伪代码）

```typescript
// settings-ipc.ts
if (action === "update") {
  // === 精确更新，不覆写 ===
  const [providerKey, modelId] = parseModelKey(modelKey);
  const prov = config.models.providers[providerKey];
  if (!prov) throw new Error("provider not found");

  // 只更新变更的 provider 级字段
  if (apiKey && apiKey !== prov.apiKey) prov.apiKey = apiKey;
  if (baseURL && baseURL !== prov.baseUrl) prov.baseUrl = baseURL;
  if (api && api !== prov.api) prov.api = api;

  // 原地更新模型 entry
  const modelIdx = prov.models.findIndex(m => m.id === modelId);
  if (modelIdx >= 0) {
    if (supportImage !== undefined) {
      prov.models[modelIdx].input = supportImage ? ["text", "image"] : ["text"];
    }
    applyModelAlias(prov, modelId, modelAlias);
  }

  if (setAsDefault) {
    config.agents.defaults.model.primary = modelKey;
  }
} else {
  // === 新增模型 ===
  const configKey = resolveConfigKey(provider, customPreset, baseURL);

  if (config.models.providers[configKey]) {
    // provider 已存在 → 追加模型
    const prov = config.models.providers[configKey];
    // 更新 apiKey（用户可能换了 key）
    prov.apiKey = apiKey;
    // 追加模型（如果不存在）
    if (!prov.models.some(m => m.id === modelID)) {
      prov.models.push(buildModelEntry(modelID, supportImage));
    }
  } else {
    // provider 不存在 → 创建
    config.models.providers[configKey] = {
      apiKey,
      baseUrl: resolveBaseUrl(provider, customPreset, baseURL),
      api: resolveApi(provider, customPreset, api),
      models: [buildModelEntry(modelID, supportImage)],
    };
  }

  applyModelAlias(config.models.providers[configKey], modelID, modelAlias);

  if (setAsDefault) {
    config.agents.defaults.model.primary = `${configKey}/${modelID}`;
  }
}
```

### OAuth 统一

```javascript
// OAuth 登录成功后，构造和普通保存一样的 payload
async function handleOAuthSave(accessToken, modelID) {
  var alias = (els.modelAlias.value || "").trim();
  var payload = {
    action: editorState.mode === "edit" ? "update" : "add",
    modelKey: editorState.mode === "edit" ? editorState.modelKey : undefined,
    provider: "moonshot",
    apiKey: accessToken,
    modelID: modelID,
    subPlatform: "kimi-code",
    supportImage: true,
    modelAlias: alias,  // 不再丢失
    setAsDefault: editorState.mode === "edit",
  };
  await window.oneclaw.settingsSaveProvider(payload);
}
```

## 迁移计划

1. **后端先行**：改造 `settings:save-provider` 支持 `action` 字段，同时兼容旧调用（无 action 时走旧逻辑）
2. **前端跟进**：用 `editorState` 替代双变量，统一 OAuth 路径
3. **清理**：移除 `buildProviderConfig` 的整体覆写用法，移除 `mergeModels` hack

## 不变的部分

- `CUSTOM_PROVIDER_PRESETS` / `MOONSHOT_SUB_PLATFORMS` 预设表
- `deriveCustomConfigKey()` URL→key 派生（已修复为确定性）
- `settings:get-configured-models` 返回格式
- `settings:delete-model`、`settings:set-default-model`
- 前端 provider tab 切换、模型列表渲染
