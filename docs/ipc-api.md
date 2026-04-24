# OneClaw IPC API Reference

> Preload (`src/preload.ts`) 通过 `contextBridge.exposeInMainWorld("oneclaw", {...})` 暴露的完整 IPC 接口清单。
> Electron 40 默认 sandbox 模式，所有渲染进程与主进程的交互必须经过此桥接层。

## Gateway 控制

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `restartGateway()` | `gateway:restart` | send |
| `startGateway()` | `gateway:start` | send |
| `stopGateway()` | `gateway:stop` | send |
| `getGatewayState()` | `gateway:state` | invoke |

## 自动更新

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `checkForUpdates()` | `app:check-updates` | send |
| `getUpdateState()` | `app:get-update-state` | invoke |
| `downloadAndInstallUpdate()` | `app:download-and-install-update` | invoke |

## Setup

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `verifyKey(params)` | `setup:verify-key` | invoke |
| `saveConfig(params)` | `setup:save-config` | invoke |
| `setupGetLaunchAtLogin()` | `setup:get-launch-at-login` | invoke |
| `completeSetup(params?)` | `setup:complete` | invoke |
| `retryRandomPort()` | `setup:retry-random-port` | invoke |
| `detectInstallation()` | `setup:detect-installation` | invoke |
| `resolveConflict(params)` | `setup:resolve-conflict` | invoke |

## Kimi OAuth

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `kimiOAuthLogin()` | `kimi-oauth:login` | invoke |
| `kimiOAuthCancel()` | `kimi-oauth:cancel` | invoke |
| `kimiOAuthLogout()` | `kimi-oauth:logout` | invoke |
| `kimiOAuthStatus()` | `kimi-oauth:status` | invoke |
| `kimiGetUsage()` | `kimi:get-usage` | invoke |

## Settings — Provider

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetConfig()` | `settings:get-config` | invoke |
| `settingsVerifyKey(params)` | `settings:verify-key` | invoke |
| `settingsSaveProvider(params)` | `settings:save-provider` | invoke |

## Settings — Channels (Feishu)

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetChannelConfig()` | `settings:get-channel-config` | invoke |
| `settingsSaveChannel(params)` | `settings:save-channel` | invoke |
| `settingsListFeishuApproved()` | `settings:list-feishu-approved` | invoke |
| `settingsAddFeishuGroupAllowFrom(params)` | `settings:add-feishu-group-allow-from` | invoke |
| `settingsRemoveFeishuApproved(params)` | `settings:remove-feishu-approved` | invoke |

## Settings — Channels (WeCom)

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetWecomConfig()` | `settings:get-wecom-config` | invoke |
| `settingsSaveWecomConfig(params)` | `settings:save-wecom-config` | invoke |
| `settingsListWecomApproved()` | `settings:list-wecom-approved` | invoke |
| `settingsRemoveWecomApproved(params)` | `settings:remove-wecom-approved` | invoke |

## Settings — Channels (QQ Bot)

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetQqbotConfig()` | `settings:get-qqbot-config` | invoke |
| `settingsSaveQqbotConfig(params)` | `settings:save-qqbot-config` | invoke |

## Settings — Channels (DingTalk)

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetDingtalkConfig()` | `settings:get-dingtalk-config` | invoke |
| `settingsSaveDingtalkConfig(params)` | `settings:save-dingtalk-config` | invoke |

## Settings — Channels (WeChat 微信)

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetWeixinConfig()` | `settings:get-weixin-config` | invoke |
| `settingsSaveWeixinConfig(params)` | `settings:save-weixin-config` | invoke |
| `settingsWeixinLoginStart()` | `settings:weixin-login-start` | invoke |
| `settingsWeixinLoginWait(params)` | `settings:weixin-login-wait` | invoke |

## Settings — Kimi

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetKimiConfig()` | `settings:get-kimi-config` | invoke |
| `settingsSaveKimiConfig(params)` | `settings:save-kimi-config` | invoke |
| `settingsGetKimiSearchConfig()` | `settings:get-kimi-search-config` | invoke |
| `settingsSaveKimiSearchConfig(params)` | `settings:save-kimi-search-config` | invoke |
| `settingsGetAboutInfo()` | `settings:get-about-info` | invoke |

## Settings — Advanced / CLI

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetAdvanced()` | `settings:get-advanced` | invoke |
| `settingsSaveAdvanced(params)` | `settings:save-advanced` | invoke |
| `settingsGetCliStatus()` | `settings:get-cli-status` | invoke |
| `settingsInstallCli()` | `settings:install-cli` | invoke |
| `settingsUninstallCli()` | `settings:uninstall-cli` | invoke |

## Settings — Backup

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsListConfigBackups()` | `settings:list-config-backups` | invoke |
| `settingsRestoreConfigBackup(params)` | `settings:restore-config-backup` | invoke |
| `settingsRestoreLastKnownGood()` | `settings:restore-last-known-good` | invoke |
| `settingsResetConfigAndRelaunch()` | `settings:reset-config-and-relaunch` | invoke |

## Settings — Share

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetShareCopy()` | `settings:get-share-copy` | invoke |

## 多模型管理

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `settingsGetConfiguredModels()` | `settings:get-configured-models` | invoke |
| `settingsDeleteModel(params)` | `settings:delete-model` | invoke |
| `settingsSetDefaultModel(params)` | `settings:set-default-model` | invoke |
| `settingsUpdateModelAlias(params)` | `settings:update-model-alias` | invoke |

## 技能商店

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `skillStoreList(params?)` | `skill-store:list` | invoke |
| `skillStoreSearch(params?)` | `skill-store:search` | invoke |
| `skillStoreDetail(params?)` | `skill-store:detail` | invoke |
| `skillStoreInstall(params?)` | `skill-store:install` | invoke |
| `skillStoreUninstall(params?)` | `skill-store:uninstall` | invoke |
| `skillStoreListInstalled()` | `skill-store:list-installed` | invoke |

## Chat UI

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `openSettings()` | `app:open-settings` | send |
| `openWebUI()` | `app:open-webui` | send |
| `getGatewayPort()` | `gateway:port` | invoke |

## 文件操作

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `selectFiles(options?)` | `dialog:select-files` | invoke |

## 工具

| 方法 | IPC 通道 | 方向 |
|---|---|---|
| `openExternal(url)` | `app:open-external` | invoke |

> `openExternal` 存在的原因：sandbox 模式下 `shell.openExternal` 不可用，必须走 IPC 到主进程。

## 事件监听器

| 方法 | IPC 通道 | 说明 |
|---|---|---|
| `onSettingsNavigate(cb)` | `settings:navigate` | Settings tab 导航（含 notice） |
| `onNavigate(cb)` | `app:navigate` | Chat UI 视图切换（返回 unsubscribe 函数） |
| `onUpdateState(cb)` | `app:update-state` | 更新状态推送（返回 unsubscribe 函数） |
