import { contextBridge, ipcRenderer, webUtils } from "electron";

// 安全桥接 — 向渲染进程暴露有限 API
contextBridge.exposeInMainWorld("oneclaw", {
  // Gateway 控制
  restartGateway: () => ipcRenderer.send("gateway:restart"),
  startGateway: () => ipcRenderer.send("gateway:start"),
  stopGateway: () => ipcRenderer.send("gateway:stop"),
  getGatewayState: () => ipcRenderer.invoke("gateway:state"),

  // 自动更新
  checkForUpdates: () => ipcRenderer.send("app:check-updates"),
  getUpdateState: () => ipcRenderer.invoke("app:get-update-state"),
  downloadAndInstallUpdate: () => ipcRenderer.invoke("app:download-and-install-update"),
  getPairingState: () => ipcRenderer.invoke("app:get-pairing-state"),
  refreshPairingState: () => ipcRenderer.send("app:refresh-pairing-state"),
  getFeishuPairingState: () => ipcRenderer.invoke("app:get-feishu-pairing-state"),
  refreshFeishuPairingState: () => ipcRenderer.send("app:refresh-feishu-pairing-state"),

  // Setup 相关
  verifyKey: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("setup:verify-key", params),
  saveConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("setup:save-config", params),
  setupGetLaunchAtLogin: () => ipcRenderer.invoke("setup:get-launch-at-login"),
  completeSetup: (params?: Record<string, unknown>) => ipcRenderer.invoke("setup:complete", params),
  detectInstallation: () => ipcRenderer.invoke("setup:detect-installation"),
  resolveConflict: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("setup:resolve-conflict", params),

  // Kimi OAuth
  kimiOAuthLogin: () => ipcRenderer.invoke("kimi-oauth:login"),
  kimiOAuthCancel: () => ipcRenderer.invoke("kimi-oauth:cancel"),
  kimiOAuthLogout: () => ipcRenderer.invoke("kimi-oauth:logout"),
  kimiOAuthStatus: () => ipcRenderer.invoke("kimi-oauth:status"),
  kimiGetUsage: () => ipcRenderer.invoke("kimi:get-usage"),

  // Settings 相关
  settingsGetConfig: () => ipcRenderer.invoke("settings:get-config"),
  settingsVerifyKey: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:verify-key", params),
  settingsSaveProvider: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-provider", params),
  settingsGetChannelConfig: () => ipcRenderer.invoke("settings:get-channel-config"),
  settingsSaveChannel: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-channel", params),
  settingsGetQqbotConfig: () => ipcRenderer.invoke("settings:get-qqbot-config"),
  settingsSaveQqbotConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-qqbot-config", params),
  settingsGetWeixinConfig: () => ipcRenderer.invoke("settings:get-weixin-config"),
  settingsSaveWeixinConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-weixin-config", params),
  settingsWeixinLoginStart: () =>
    ipcRenderer.invoke("settings:weixin-login-start"),
  settingsWeixinLoginWait: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:weixin-login-wait", params),
  settingsWeixinClearAccounts: () =>
    ipcRenderer.invoke("settings:weixin-clear-accounts"),
  settingsGetDingtalkConfig: () => ipcRenderer.invoke("settings:get-dingtalk-config"),
  settingsSaveDingtalkConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-dingtalk-config", params),
  settingsGetWecomConfig: () => ipcRenderer.invoke("settings:get-wecom-config"),
  settingsSaveWecomConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-wecom-config", params),
  settingsListWecomPairing: () =>
    ipcRenderer.invoke("settings:list-wecom-pairing"),
  settingsListWecomApproved: () =>
    ipcRenderer.invoke("settings:list-wecom-approved"),
  settingsApproveWecomPairing: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:approve-wecom-pairing", params),
  settingsRejectWecomPairing: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:reject-wecom-pairing", params),
  settingsRemoveWecomApproved: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:remove-wecom-approved", params),
  settingsListFeishuPairing: () =>
    ipcRenderer.invoke("settings:list-feishu-pairing"),
  settingsListFeishuApproved: () =>
    ipcRenderer.invoke("settings:list-feishu-approved"),
  settingsApproveFeishuPairing: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:approve-feishu-pairing", params),
  settingsRejectFeishuPairing: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:reject-feishu-pairing", params),
  settingsAddFeishuGroupAllowFrom: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:add-feishu-group-allow-from", params),
  settingsRemoveFeishuApproved: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:remove-feishu-approved", params),
  settingsGetKimiConfig: () => ipcRenderer.invoke("settings:get-kimi-config"),
  settingsSaveKimiConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-kimi-config", params),
  settingsGetKimiSearchConfig: () => ipcRenderer.invoke("settings:get-kimi-search-config"),
  settingsSaveKimiSearchConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-kimi-search-config", params),
  settingsGetMemoryConfig: () => ipcRenderer.invoke("settings:get-memory-config"),
  settingsSaveMemoryConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-memory-config", params),
  settingsGetAboutInfo: () => ipcRenderer.invoke("settings:get-about-info"),
  settingsGetAdvanced: () => ipcRenderer.invoke("settings:get-advanced"),
  settingsSaveAdvanced: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-advanced", params),
  settingsGetCliStatus: () => ipcRenderer.invoke("settings:get-cli-status"),
  settingsInstallCli: () => ipcRenderer.invoke("settings:install-cli"),
  settingsUninstallCli: () => ipcRenderer.invoke("settings:uninstall-cli"),
  settingsListConfigBackups: () => ipcRenderer.invoke("settings:list-config-backups"),
  settingsRestoreConfigBackup: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:restore-config-backup", params),
  settingsRestoreLastKnownGood: () => ipcRenderer.invoke("settings:restore-last-known-good"),
  settingsResetConfigAndRelaunch: () => ipcRenderer.invoke("settings:reset-config-and-relaunch"),
  settingsGetShareCopy: () => ipcRenderer.invoke("settings:get-share-copy"),
  settingsGetUpdatePushConfig: () => ipcRenderer.invoke("settings:get-update-push-config"),
  settingsSaveUpdatePushConfig: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:save-update-push-config", params),
  settingsTestUpdatePush: () => ipcRenderer.invoke("settings:test-update-push"),

  // 多模型管理
  settingsGetConfiguredModels: () => ipcRenderer.invoke("settings:get-configured-models"),
  settingsDeleteModel: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:delete-model", params),
  settingsSetDefaultModel: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:set-default-model", params),
  settingsUpdateModelAlias: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("settings:update-model-alias", params),

  // 技能商店
  skillStoreList: (params?: Record<string, unknown>) =>
    ipcRenderer.invoke("skill-store:list", params),
  skillStoreSearch: (params?: Record<string, unknown>) =>
    ipcRenderer.invoke("skill-store:search", params),
  skillStoreDetail: (params?: Record<string, unknown>) =>
    ipcRenderer.invoke("skill-store:detail", params),
  skillStoreInstall: (params?: Record<string, unknown>) =>
    ipcRenderer.invoke("skill-store:install", params),
  skillStoreUninstall: (params?: Record<string, unknown>) =>
    ipcRenderer.invoke("skill-store:uninstall", params),
  skillStoreListInstalled: () =>
    ipcRenderer.invoke("skill-store:list-installed"),

  // 工作空间文件操作
  workspaceSetRoot: (root: string) =>
    ipcRenderer.invoke("workspace:set-root", root),
  workspaceOpenFile: (filePath: string) =>
    ipcRenderer.invoke("workspace:open-file", filePath),
  workspaceOpenFolder: (filePath: string) =>
    ipcRenderer.invoke("workspace:open-folder", filePath),
  workspaceListDir: (dirPath: string) =>
    ipcRenderer.invoke("workspace:list-dir", dirPath),
  workspaceReadFile: (filePath: string) =>
    ipcRenderer.invoke("workspace:read-file", filePath),

  onSettingsNavigate: (cb: (payload: { tab: string; notice: string }) => void) => {
    ipcRenderer.on("settings:navigate", (_e, payload) => cb(payload));
  },

  // 打开外部链接（走 IPC 到主进程，sandbox 下 shell 不可用）
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),
  // 打开本地文件/目录
  openPath: (path: string) => ipcRenderer.invoke("app:open-path", path),

  // 文件选择
  selectFiles: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke("dialog:select-files", options) as Promise<string[]>,
  // 读取剪贴板中的文件路径（Cmd+C / Ctrl+C 复制的文件）
  readClipboardFilePaths: () =>
    ipcRenderer.invoke("clipboard:read-file-paths") as Promise<string[]>,

  // Release Notes
  getReleaseNotes: () => ipcRenderer.invoke("app:get-release-notes"),
  dismissReleaseNotes: (version: string) => ipcRenderer.invoke("app:dismiss-release-notes", version),

  // Chat UI 侧边栏操作
  openSettings: () => ipcRenderer.send("app:open-settings"),
  openWebUI: () => ipcRenderer.send("app:open-webui"),
  getGatewayPort: () => ipcRenderer.invoke("gateway:port"),
  // 主进程通知 gateway 已就绪，Chat UI 可立即重连（跳过盲等指数退避）
  onGatewayReady: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("gateway:ready", listener);
    return () => ipcRenderer.removeListener("gateway:ready", listener);
  },

  // 截取当前窗口截图，返回 base64 PNG
  captureWindow: () => ipcRenderer.invoke("feedback:capture-window"),
  // 提交用户反馈
  submitFeedback: (params: { content: string; screenshots: string[]; fileNames?: string[]; includeLogs: boolean; email?: string }) =>
    ipcRenderer.invoke("feedback:submit", params),
  // 获取反馈 thread 列表
  feedbackThreads: () => ipcRenderer.invoke("feedback:threads"),
  // 获取单个反馈 thread 详情
  feedbackThread: (id: number) => ipcRenderer.invoke("feedback:thread", id),
  // 用户追问（支持附件）
  feedbackReply: (id: number, content: string, files?: Array<{name: string; base64: string}>) =>
    ipcRenderer.invoke("feedback:reply", id, content, files),
  // 从 .openclaw 目录选择文件
  feedbackPickFiles: () => ipcRenderer.invoke("feedback:pick-files"),
  onNavigate: (cb: (payload: { view: "settings" }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { view: "settings" }) => {
      cb(payload);
    };
    ipcRenderer.on("app:navigate", listener);
    return () => ipcRenderer.removeListener("app:navigate", listener);
  },
  onUpdateState: (
    cb: (payload: {
      status: "hidden" | "available" | "downloading";
      version: string | null;
      percent: number | null;
      showBadge: boolean;
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        status: "hidden" | "available" | "downloading";
        version: string | null;
        percent: number | null;
        showBadge: boolean;
      },
    ) => {
      cb(payload);
    };
    ipcRenderer.on("app:update-state", listener);
    return () => ipcRenderer.removeListener("app:update-state", listener);
  },
  onPairingState: (
    cb: (payload: {
      pendingCount: number;
      requests: Array<{
        channel: string;
        code: string;
        id: string;
        name: string;
        createdAt: string;
        lastSeenAt: string;
      }>;
      updatedAt: number;
      channels: Record<string, {
        channel: string;
        pendingCount: number;
        requests: Array<{
          code: string;
          id: string;
          name: string;
          createdAt: string;
          lastSeenAt: string;
        }>;
        updatedAt: number;
        lastAutoApprovedAt: number | null;
        lastAutoApprovedName: string | null;
      }>;
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        pendingCount: number;
        requests: Array<{
          channel: string;
          code: string;
          id: string;
          name: string;
          createdAt: string;
          lastSeenAt: string;
        }>;
        updatedAt: number;
        channels: Record<string, {
          channel: string;
          pendingCount: number;
          requests: Array<{
            code: string;
            id: string;
            name: string;
            createdAt: string;
            lastSeenAt: string;
          }>;
          updatedAt: number;
          lastAutoApprovedAt: number | null;
          lastAutoApprovedName: string | null;
        }>;
      },
    ) => {
      cb(payload);
    };
    ipcRenderer.on("app:pairing-state", listener);
    return () => ipcRenderer.removeListener("app:pairing-state", listener);
  },
  onFeishuPairingState: (
    cb: (payload: {
      pendingCount: number;
      requests: Array<{
        code: string;
        id: string;
        name: string;
        createdAt: string;
        lastSeenAt: string;
      }>;
      updatedAt: number;
      lastAutoApprovedAt: number | null;
      lastAutoApprovedName: string | null;
    }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        pendingCount: number;
        requests: Array<{
          code: string;
          id: string;
          name: string;
          createdAt: string;
          lastSeenAt: string;
        }>;
        updatedAt: number;
        lastAutoApprovedAt: number | null;
        lastAutoApprovedName: string | null;
      },
    ) => {
      cb(payload);
    };
    ipcRenderer.on("app:feishu-pairing-state", listener);
    return () => ipcRenderer.removeListener("app:feishu-pairing-state", listener);
  },
});

// 拖拽文件 → 提取路径并派发给渲染进程
// dragover 必须无条件 preventDefault，否则 drop 事件不会触发
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  const paths: string[] = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const p = webUtils.getPathForFile(files[i]);
      if (p) paths.push(p);
    } catch { /* 忽略无法获取路径的文件 */ }
  }
  if (paths.length > 0) {
    window.dispatchEvent(new CustomEvent("oneclaw:file-drop", { detail: { paths } }));
  }
});
