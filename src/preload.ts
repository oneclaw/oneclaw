import { contextBridge, ipcRenderer } from "electron";

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
  retryRandomPort: () => ipcRenderer.invoke("setup:retry-random-port"),
  detectInstallation: () => ipcRenderer.invoke("setup:detect-installation"),
  resolveConflict: (params: Record<string, unknown>) =>
    ipcRenderer.invoke("setup:resolve-conflict", params),

  // Kimi OAuth
  kimiOAuthLogin: () => ipcRenderer.invoke("kimi-oauth:login"),
  kimiOAuthCancel: () => ipcRenderer.invoke("kimi-oauth:cancel"),
  kimiOAuthLogout: () => ipcRenderer.invoke("kimi-oauth:logout"),
  kimiOAuthStatus: () => ipcRenderer.invoke("kimi-oauth:status"),

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

  onSettingsNavigate: (cb: (payload: { tab: string; notice: string }) => void) => {
    ipcRenderer.on("settings:navigate", (_e, payload) => cb(payload));
  },

  // 打开外部链接（走 IPC 到主进程，sandbox 下 shell 不可用）
  openExternal: (url: string) => ipcRenderer.invoke("app:open-external", url),

  // Chat UI 侧边栏操作
  openSettings: () => ipcRenderer.send("app:open-settings"),
  openWebUI: () => ipcRenderer.send("app:open-webui"),
  getGatewayPort: () => ipcRenderer.invoke("gateway:port"),
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
