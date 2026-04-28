export const DEDICATED_BROWSER_PROFILE = "openclaw";
export const CURRENT_CHROME_BROWSER_PROFILE = "user";
export const LEGACY_CHROME_BROWSER_PROFILES = new Set(["chrome", "chrome-relay"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProfileName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// 内置 profile 不一定会落盘；只有用户自定义 profile 才通常出现在 browser.profiles。
function resolveProfiles(config: Record<string, unknown>): Record<string, unknown> | null {
  const browser = isRecord(config.browser) ? config.browser : null;
  if (!browser) return null;
  return isRecord(browser.profiles) ? browser.profiles : null;
}

function isUnsupportedLegacyExtensionProfile(profile: unknown): boolean {
  return isRecord(profile) && normalizeProfileName(profile.driver) === "extension";
}

export function normalizeRequestedBrowserProfileForSave(config: Record<string, unknown>, requested: unknown): string {
  const profile = normalizeProfileName(requested);
  if (!profile || profile === DEDICATED_BROWSER_PROFILE) return DEDICATED_BROWSER_PROFILE;
  if (profile === CURRENT_CHROME_BROWSER_PROFILE) return CURRENT_CHROME_BROWSER_PROFILE;

  if (LEGACY_CHROME_BROWSER_PROFILES.has(profile)) {
    const profiles = resolveProfiles(config);
    const configuredProfile = profiles?.[profile];
    // 保留用户显式创建的同名自定义 profile；只迁移缺失或旧 extension relay 配置。
    if (configuredProfile && !isUnsupportedLegacyExtensionProfile(configuredProfile)) {
      return profile;
    }
    return CURRENT_CHROME_BROWSER_PROFILE;
  }

  return profile;
}

// OpenClaw 2026.4.x 移除了旧 Chrome extension relay driver/profile。
// 启动时修复旧版 OneClaw 写入的配置，让 gateway 回落到内置 existing-session profile。
export function migrateBrowserProfileForCurrentGateway(config: unknown): boolean {
  if (!isRecord(config)) return false;
  const browser = isRecord(config.browser) ? config.browser : null;
  if (!browser) return false;

  let changed = false;
  const profiles = isRecord(browser.profiles) ? browser.profiles : null;

  if (profiles) {
    for (const profileName of LEGACY_CHROME_BROWSER_PROFILES) {
      if (isUnsupportedLegacyExtensionProfile(profiles[profileName])) {
        delete profiles[profileName];
        changed = true;
      }
    }
    if (changed && Object.keys(profiles).length === 0) {
      delete browser.profiles;
    }
  }

  const currentDefault = normalizeProfileName(browser.defaultProfile);
  const normalizedDefault = normalizeRequestedBrowserProfileForSave(config, currentDefault);
  if (currentDefault && normalizedDefault !== currentDefault) {
    browser.defaultProfile = normalizedDefault;
    changed = true;
  }

  return changed;
}
