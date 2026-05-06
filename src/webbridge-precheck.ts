import * as path from "path";
import * as os from "os";
import type { BrowserState } from "./browser-extension-installer";

function home(): string {
  return process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
}

// OneClaw 只关心自己的 OpenClaw runtime（~/.agents/skills/kimi-webbridge）。
// install-skill -y 会顺手装到检测到的其它 AI runtime（Claude / Codex / Kimi CLI），
// 但那些不属于 OneClaw 必须保证的能力，所以 precheck 只看这一处。
export const KIMI_WEBBRIDGE_SKILL_PATHS: string[] = [
  path.join(home(), ".agents/skills/kimi-webbridge"),
];

export interface WebbridgePrecheckResult {
  ok: boolean;
  missing: {
    binary: boolean;
    skill: boolean;
    extension: boolean;
  };
  defaultBrowser: { id: string; name: string } | null;
  defaultUnsupported: boolean;
}

export interface WebbridgePrecheckDeps {
  binaryPath: string;
  extensionId: string;
  fileExists: (p: string) => boolean;
  readExtensionStates: (extId: string) => Promise<BrowserState[]>;
  getDefaultBrowser: () => { target: { id: string; name: string } } | null;
  /**
   * 读 openclaw.json 里 `skills.entries["kimi-webbridge"].enabled`：
   * - undefined → 视为已启用（缺省即启用）
   * - true → 已启用
   * - false → 配合 currentBrowserMode 一起判断是漂移还是正常状态
   * 不注入 → 默认 true（向后兼容旧调用方）。
   */
  readSkillEnabled?: () => boolean | undefined;
  /**
   * 用户当前实际所处的浏览器模式（来自 detectBrowserMode(config)）。
   * 用来区分 enabled=false 是"漂移"还是"当前模式的预期值"：
   *   - "webbridge" + enabled=false → 漂移（用户从 chat-ui 关掉了），算 missing.skill
   *   - 其他模式 + enabled=false   → 当前模式的预期（applyBrowserModeConfig 写的就是 false），
   *                                  切换到 webbridge 时会被翻回 true，不算 missing
   * 不注入 → 当 webbridge 处理（保留旧行为，向后兼容）。
   */
  currentBrowserMode?: "webbridge" | "openclaw" | "user";
  skillPaths?: string[];
}

export async function getWebbridgePrecheck(
  deps: WebbridgePrecheckDeps,
): Promise<WebbridgePrecheckResult> {
  const skillPaths = deps.skillPaths ?? KIMI_WEBBRIDGE_SKILL_PATHS;

  const binaryMissing = !deps.fileExists(deps.binaryPath);
  const fileMissing = !skillPaths.some((p) => deps.fileExists(p));
  // 文件在但被 disable 才算 missing 的前提：用户当前已处于 webbridge 模式
  // （否则 enabled=false 是 openclaw/chrome 模式的正常配置，模式切换会自动翻回 true）。
  const skillEnabled = deps.readSkillEnabled?.() ?? true;
  const currentMode = deps.currentBrowserMode ?? "webbridge";
  const skillDisabledDrift =
    currentMode === "webbridge" && skillEnabled === false;
  const skillMissing = fileMissing || skillDisabledDrift;

  const def = deps.getDefaultBrowser();
  const defaultUnsupported = !def;
  const defaultBrowser = def
    ? { id: def.target.id, name: def.target.name }
    : null;

  let extMissing: boolean;
  if (!deps.extensionId || defaultUnsupported) {
    extMissing = true;
  } else {
    try {
      const browsers = await deps.readExtensionStates(deps.extensionId);
      const targetState = browsers.find((b) => b.browserId === def!.target.id);
      // settings 高级页面只关心"OneClaw 这套组件是否真的坏了 / 缺了 / 被黑名单挡了"。
      // 不再判 presentInChrome：用户在 Chrome 里有没有点"启用"是用户行为，
      // 不是 OneClaw 能修的状态——左侧栏 pill 单独负责催用户去启用。
      extMissing = !(
        targetState?.installed &&
        targetState.configured &&
        !targetState.blocklisted
      );
    } catch {
      extMissing = true;
    }
  }

  return {
    ok: !binaryMissing && !skillMissing && !extMissing,
    missing: {
      binary: binaryMissing,
      skill: skillMissing,
      extension: extMissing,
    },
    defaultBrowser,
    defaultUnsupported,
  };
}
