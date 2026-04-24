export const BROWSER_MODES = ["openclaw", "chrome", "webbridge"] as const;

export type BrowserMode = (typeof BROWSER_MODES)[number];

export function isBrowserMode(value: unknown): value is BrowserMode {
  return (
    typeof value === "string" &&
    (BROWSER_MODES as readonly string[]).includes(value)
  );
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
    case "chrome":
      return applyOpenclawOrChromeMode(config, mode);
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
  // 否则看 defaultProfile
  if (config?.browser?.defaultProfile === "chrome") {
    return "chrome";
  }
  // 其余（"openclaw" / "user" / 未设置 / 自定义）统一回落到 openclaw
  return "openclaw";
}

function applyOpenclawOrChromeMode(
  config: OneclawConfigShape,
  profile: "openclaw" | "chrome",
): any {
  return {
    ...config,
    browser: {
      ...(config.browser ?? {}),
      defaultProfile: profile,
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
}
