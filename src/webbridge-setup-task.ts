import type { InstallResult as WebbridgeInstallResult } from "./webbridge-installer";
import type { BrowserInstallSummary } from "./browser-extension-installer";
import type { BrowserMode } from "./browser-mode-config";

export interface WebbridgeSetupTaskLogger {
  info: (msg: string) => void;
  error: (msg: string) => void;
}

export interface WebbridgeSetupTaskDeps {
  // Phase 1：下载 webbridge 二进制。语义同 installWebbridge()。
  installer: () => Promise<WebbridgeInstallResult>;
  // Phase 3：批量装浏览器扩展。语义同 installForAllDetectedBrowsers(extId)。
  installExtensions: (extId: string) => Promise<BrowserInstallSummary[]>;
  // openclaw.json 读写；DI 供测试替换
  readConfig: () => any;
  writeConfig: (config: any) => void;
  // Phase 2：applyBrowserModeConfig 的直接注入
  applyMode: (config: any, mode: BrowserMode) => any;
  // build-config.json 里的 ext ID；空字符串 → 严格判失败（走降级）
  extensionId: string;
  // 降级到 openclaw 模式重写 config 后，通知调用方（生产：gateway restart）
  onConfigRewritten?: () => void;
  // binary 就绪后安装 skill 到各 AI runtime
  installSkill?: (
    binaryPath: string,
  ) => Promise<{ success: boolean; output: string; error?: string }>;
  logger?: WebbridgeSetupTaskLogger;
  /**
   * true（默认）= 任何步骤失败时自动改写 config 到 openclaw 模式 + onConfigRewritten 通知。
   *               适合 Setup 完成后的 fire-and-forget 路径。
   * false = 失败只返回 outcome=fell-back-to-openclaw + error，不动 config 不通知。
   *         适合 Settings repair-and-enable 路径，由调用方决定是否写 config。
   */
  fallbackOnFailure?: boolean;
  /**
   * 选择性修复：跳过对应步骤（precheck 已确认在位时）。
   * Setup 路径默认全 false（跑完整流程）；Settings repair 路径按 precheck 缺啥跑啥。
   */
  skipBinaryInstall?: boolean;
  skipSkillInstall?: boolean;
  skipExtensionInstall?: boolean;
  /**
   * 当 skipBinaryInstall=true 时，跳过 installer() 调用，
   * 由调用方提供已存在的 binary 路径填入 summary。
   */
  existingBinaryPath?: string;
}

export type SetupTaskOutcome =
  | "webbridge-ready"
  | "fell-back-to-openclaw"
  | "extension-skipped";

export interface SetupTaskSummary {
  outcome: SetupTaskOutcome;
  webbridgeInstalled: boolean;
  binaryPath: string | null;
  extensionSummary: BrowserInstallSummary[] | null;
  error?: string;
}

const NOOP_LOGGER: WebbridgeSetupTaskLogger = {
  info: () => {},
  error: () => {},
};

export async function runWebbridgeSetupTask(
  deps: WebbridgeSetupTaskDeps,
): Promise<SetupTaskSummary> {
  const log = deps.logger ?? NOOP_LOGGER;
  const shouldFallback = deps.fallbackOnFailure !== false;

  const fail = (
    reason: string,
    error: string,
    binaryPath: string | null,
  ): SetupTaskSummary => {
    log.error(`[webbridge-setup] ${reason}: ${error}`);
    if (shouldFallback) {
      try {
        const current = deps.readConfig();
        const next = deps.applyMode(current, "openclaw");
        deps.writeConfig(next);
        deps.onConfigRewritten?.();
      } catch (rewriteErr) {
        const m =
          rewriteErr instanceof Error ? rewriteErr.message : String(rewriteErr);
        log.error(`[webbridge-setup] 降级改写 config 失败: ${m}`);
      }
    }
    return {
      outcome: "fell-back-to-openclaw",
      webbridgeInstalled: false,
      binaryPath,
      extensionSummary: null,
      error,
    };
  };

  // Step 1：下载 webbridge 二进制（precheck 已就绪时跳过）
  let binaryPath: string | null;
  if (deps.skipBinaryInstall) {
    binaryPath = deps.existingBinaryPath ?? null;
    log.info(`[webbridge-setup] 跳过 binary 下载（已就绪）: path=${binaryPath ?? "(unknown)"}`);
  } else {
    try {
      const installResult = await deps.installer();
      binaryPath = installResult.binaryPath;
      log.info(
        `[webbridge-setup] 二进制就绪: version=${installResult.version} skipped=${installResult.skipped} path=${installResult.binaryPath}`,
      );
    } catch (err) {
      return fail(
        "二进制下载失败",
        err instanceof Error ? err.message : String(err),
        null,
      );
    }
  }

  // Step 1.5：安装 skill（严格：失败/抛错都降级；precheck 已就绪时跳过）
  if (!deps.skipSkillInstall && deps.installSkill) {
    try {
      const skillResult = await deps.installSkill(binaryPath ?? "");
      if (!skillResult.success) {
        return fail(
          "skill 安装失败",
          skillResult.error ?? "(unknown)",
          binaryPath,
        );
      }
      log.info(
        `[webbridge-setup] skill 安装完成${
          skillResult.output ? `\n${skillResult.output.trimEnd()}` : ""
        }`,
      );
    } catch (err) {
      return fail(
        "skill 安装异常",
        err instanceof Error ? err.message : String(err),
        binaryPath,
      );
    }
  } else if (deps.skipSkillInstall) {
    log.info("[webbridge-setup] 跳过 skill 安装（已就绪）");
  }

  // Step 2 + 3：浏览器扩展（precheck 已就绪时整段跳过——extId 也不再校验）
  let extensionSummary: BrowserInstallSummary[] | null = null;
  if (!deps.skipExtensionInstall) {
    if (!deps.extensionId) {
      return fail(
        "未读到 WebBridge 扩展 ID（resources/webbridge/kimi-webbridge.json 缺失或损坏，严格判失败）",
        "no extension id",
        binaryPath,
      );
    }
    try {
      extensionSummary = await deps.installExtensions(deps.extensionId);
      log.info(
        `[webbridge-setup] 浏览器扩展安装完成: ${extensionSummary
          .map((r) => `${r.browserId}=${r.result}`)
          .join(" ")}`,
      );
    } catch (err) {
      return fail(
        "浏览器扩展批量安装失败",
        err instanceof Error ? err.message : String(err),
        binaryPath,
      );
    }
  } else {
    log.info("[webbridge-setup] 跳过浏览器扩展安装（已就绪）");
  }

  return {
    outcome: "webbridge-ready",
    webbridgeInstalled: true,
    binaryPath,
    extensionSummary,
  };
}
