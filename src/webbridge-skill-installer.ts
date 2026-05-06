import { execFile } from "child_process";
import { promisify } from "util";

export interface SkillInstallResult {
  success: boolean;
  output: string;
  error?: string;
}

export type ExecFileAsync = (
  cmd: string,
  args: string[],
  opts: { timeout: number; windowsHide: boolean },
) => Promise<{ stdout: string; stderr: string }>;

export interface SkillInstallerDeps {
  execFileAsync?: ExecFileAsync;
}

const DEFAULT_TIMEOUT_MS = 30_000;

const DEFAULT_EXEC_FILE: ExecFileAsync = (() => {
  const p = promisify(execFile);
  return async (cmd, args, opts) => {
    const res = await p(cmd, args, opts);
    return {
      stdout: String(res.stdout ?? ""),
      stderr: String(res.stderr ?? ""),
    };
  };
})();

export async function installWebbridgeSkill(
  binaryPath: string,
  deps: SkillInstallerDeps = {},
): Promise<SkillInstallResult> {
  const execFileAsync = deps.execFileAsync ?? DEFAULT_EXEC_FILE;
  try {
    const { stdout, stderr } = await execFileAsync(
      binaryPath,
      ["install-skill", "-y"],
      { timeout: DEFAULT_TIMEOUT_MS, windowsHide: true },
    );
    const output = (stdout || "") + (stderr ? "\n" + stderr : "");
    return { success: true, output };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, output: "", error: msg };
  }
}
