type LoginItemSettingsReader = {
  getLoginItemSettings: () => { openAtLogin?: boolean };
};

type LoginItemSettingsWriter = {
  setLoginItemSettings: (settings: { openAtLogin: boolean }) => void;
};

export type LaunchAtLoginState = {
  supported: boolean;
  enabled: boolean;
};

export type LaunchAtLoginSetResult = {
  supported: boolean;
};

// 仅在 macOS / Windows 暴露系统开机启动开关，避免在不支持平台做无效调用。
function isLaunchAtLoginSupported(platform: NodeJS.Platform): boolean {
  return platform === "darwin" || platform === "win32";
}

// 读取当前系统层面的开机启动状态，作为 Setup/Settings 的唯一数据源。
export function getLaunchAtLoginState(
  host: LoginItemSettingsReader,
  platform: NodeJS.Platform = process.platform,
): LaunchAtLoginState {
  if (!isLaunchAtLoginSupported(platform)) {
    return { supported: false, enabled: false };
  }
  const settings = host.getLoginItemSettings();
  return {
    supported: true,
    enabled: settings.openAtLogin === true,
  };
}

// 写入系统层面的开机启动开关；不支持平台直接 no-op，避免破坏主流程。
export function setLaunchAtLoginEnabled(
  host: LoginItemSettingsWriter,
  enabled: boolean,
  platform: NodeJS.Platform = process.platform,
): LaunchAtLoginSetResult {
  if (!isLaunchAtLoginSupported(platform)) {
    return { supported: false };
  }
  host.setLoginItemSettings({ openAtLogin: enabled });
  return { supported: true };
}
