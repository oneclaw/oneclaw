import {
  CURRENT_CHROME_BROWSER_PROFILE,
  LEGACY_CHROME_BROWSER_PROFILES,
  migrateBrowserProfileForCurrentGateway,
  normalizeRequestedBrowserProfileForSave,
} from "./browser-profile-config";

export const BROWSER_MODES = ["openclaw", "user", "webbridge"] as const;

export type BrowserMode = (typeof BROWSER_MODES)[number];

// 老 IPC（feat/webbridge-on-main 早期版本）用的 alias —— 服务端宽容接受，落盘前归一化成 "user"。
const LEGACY_BROWSER_MODE_ALIASES: Record<string, BrowserMode> = {
  chrome: "user",
};

export function isBrowserMode(value: unknown): value is BrowserMode {
  return (
    typeof value === "string" &&
    (BROWSER_MODES as readonly string[]).includes(value)
  );
}

// 把传入字符串规范成现行 BrowserMode（吃下老 alias）
export function coerceBrowserMode(value: unknown): BrowserMode | null {
  if (typeof value !== "string") return null;
  if (isBrowserMode(value)) return value;
  return LEGACY_BROWSER_MODE_ALIASES[value] ?? null;
}

// openclaw.json 的最小形状——只列本模块会碰的字段；其他字段用 Record 兜底
interface OneclawConfigShape {
  browser?: {
    defaultProfile?: string;
    [key: string]: unknown;
  };
  plugins?: {
    entries?: {
      browser?: { enabled?: boolean; [key: string]: unknown };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  skills?: {
    entries?: {
      "kimi-webbridge"?: { enabled?: boolean; [key: string]: unknown };
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export function applyBrowserModeConfig(
  config: OneclawConfigShape,
  mode: BrowserMode,
): any {
  switch (mode) {
    case "openclaw":
    case "user":
      return applyOpenclawOrUserMode(config, mode);
    case "webbridge":
      return applyWebbridgeMode(config);
  }
}

function applyWebbridgeMode(config: OneclawConfigShape): any {
  return {
    ...config,
    plugins: {
      ...(config.plugins ?? {}),
      entries: {
        ...(config.plugins?.entries ?? {}),
        browser: {
          ...(config.plugins?.entries?.browser ?? {}),
          enabled: false,
        },
      },
    },
    skills: {
      ...(config.skills ?? {}),
      entries: {
        ...(config.skills?.entries ?? {}),
        "kimi-webbridge": {
          ...(config.skills?.entries?.["kimi-webbridge"] ?? {}),
          enabled: true,
        },
      },
    },
  };
}

export function detectBrowserMode(config: OneclawConfigShape): BrowserMode {
  // webbridge 优先：插件被显式关掉 → 用户在 webbridge 模式
  if (config?.plugins?.entries?.browser?.enabled === false) {
    return "webbridge";
  }
  const stored =
    typeof config?.browser?.defaultProfile === "string"
      ? config.browser.defaultProfile.trim()
      : "";
  // 现代 user profile + 老 chrome 名都识别成 user 模式（OpenClaw 当前会话）
  if (
    stored === CURRENT_CHROME_BROWSER_PROFILE ||
    LEGACY_CHROME_BROWSER_PROFILES.has(stored)
  ) {
    return "user";
  }
  return "openclaw";
}

function applyOpenclawOrUserMode(
  config: OneclawConfigShape,
  mode: "openclaw" | "user",
): any {
  // 复用 main 分支的 normalize 逻辑：
  //   "openclaw" → 内置 dedicated profile
  //   "user"     → CURRENT_CHROME_BROWSER_PROFILE，除非用户已显式创建同名自定义 profile
  const stored = normalizeRequestedBrowserProfileForSave(config, mode);
  const next = {
    ...config,
    browser: {
      ...(config.browser ?? {}),
      defaultProfile: stored,
    },
    plugins: {
      ...(config.plugins ?? {}),
      entries: {
        ...(config.plugins?.entries ?? {}),
        browser: {
          ...(config.plugins?.entries?.browser ?? {}),
          enabled: true,
        },
      },
    },
    skills: {
      ...(config.skills ?? {}),
      entries: {
        ...(config.skills?.entries ?? {}),
        "kimi-webbridge": {
          ...(config.skills?.entries?.["kimi-webbridge"] ?? {}),
          enabled: false,
        },
      },
    },
  };
  // 顺手清掉旧 driver:"extension" profile，让 gateway 不会回到旧 relay 路径
  migrateBrowserProfileForCurrentGateway(next);
  return next;
}
