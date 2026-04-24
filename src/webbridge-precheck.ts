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
}

export interface WebbridgePrecheckDeps {
  binaryPath: string;
  extensionId: string;
  fileExists: (p: string) => boolean;
  readExtensionStates: (extId: string) => Promise<BrowserState[]>;
  skillPaths?: string[];
}

export async function getWebbridgePrecheck(
  deps: WebbridgePrecheckDeps,
): Promise<WebbridgePrecheckResult> {
  const skillPaths = deps.skillPaths ?? KIMI_WEBBRIDGE_SKILL_PATHS;

  const binaryMissing = !deps.fileExists(deps.binaryPath);
  const skillMissing = !skillPaths.some((p) => deps.fileExists(p));

  let extMissing: boolean;
  if (!deps.extensionId) {
    extMissing = true;
  } else {
    try {
      const browsers = await deps.readExtensionStates(deps.extensionId);
      // 混合策略：
      // 必要条件：installed && configured && !blocklisted
      // 浏览器在跑：还要求 presentInChrome=true（Chrome 在跑时 Secure Preferences 是新鲜的，
      //              presentInChrome=false 一定意味着扩展真没装；如 Web Store 装后从 UI 删，
      //              Chrome 不会填 external_uninstalls 黑名单，必须靠这个信号兜底）
      // 浏览器关着：不看 presentInChrome（Secure Preferences 可能是 stale 的，比如 OneClaw 刚
      //              写完 External Extensions JSON 但 Chrome 还没启动读到——这是合法中间态，
      //              不能误报"还需修复"）
      extMissing = !browsers.some(
        (b) =>
          b.installed &&
          b.configured &&
          !b.blocklisted &&
          (!b.running || b.presentInChrome),
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
  };
}
