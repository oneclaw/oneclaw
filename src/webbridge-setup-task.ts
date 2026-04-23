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
  // build-config.json 里的 ext ID；空字符串 → 跳过浏览器扩展安装
  extensionId: string;
  // 降级到 openclaw 模式重写 config 后，通知调用方（生产：gateway restart）
  onConfigRewritten?: () => void;
  logger?: WebbridgeSetupTaskLogger;
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

  // Step 1：下载 webbridge 二进制
  let installResult: WebbridgeInstallResult;
  try {
    installResult = await deps.installer();
    log.info(
      `[webbridge-setup] 二进制就绪: version=${installResult.version} skipped=${installResult.skipped} path=${installResult.binaryPath}`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(
      `[webbridge-setup] 二进制下载失败，降级到 openclaw 模式: ${msg}`,
    );
    // 降级：改写 config 到 openclaw 模式
    try {
      const current = deps.readConfig();
      const next = deps.applyMode(current, "openclaw");
      deps.writeConfig(next);
      deps.onConfigRewritten?.();
    } catch (rewriteErr) {
      const rewriteMsg =
        rewriteErr instanceof Error ? rewriteErr.message : String(rewriteErr);
      log.error(
        `[webbridge-setup] 降级改写 config 失败: ${rewriteMsg}`,
      );
    }
    return {
      outcome: "fell-back-to-openclaw",
      webbridgeInstalled: false,
      binaryPath: null,
      extensionSummary: null,
      error: msg,
    };
  }

  // Step 2：extensionId 空 → 跳过浏览器扩展安装
  if (!deps.extensionId) {
    log.info(
      "[webbridge-setup] 未注入 webbridgeExtensionId，跳过浏览器扩展安装（dev 构建常见）",
    );
    return {
      outcome: "extension-skipped",
      webbridgeInstalled: true,
      binaryPath: installResult.binaryPath,
      extensionSummary: null,
    };
  }

  // Step 3：安装浏览器扩展
  try {
    const extensionSummary = await deps.installExtensions(deps.extensionId);
    log.info(
      `[webbridge-setup] 浏览器扩展安装完成: ${extensionSummary
        .map((r) => `${r.browserId}=${r.result}`)
        .join(" ")}`,
    );
    return {
      outcome: "webbridge-ready",
      webbridgeInstalled: true,
      binaryPath: installResult.binaryPath,
      extensionSummary,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error(
      `[webbridge-setup] 浏览器扩展批量安装失败（不回退 config）: ${msg}`,
    );
    return {
      outcome: "webbridge-ready",
      webbridgeInstalled: true,
      binaryPath: installResult.binaryPath,
      extensionSummary: null,
      error: msg,
    };
  }
}
