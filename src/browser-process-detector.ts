import { execFile } from "child_process";
import { promisify } from "util";
import type { BrowserTarget } from "./browser-detector";

export type ProcessExecutor = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; code: number }>;

export interface ProcessDetectorDeps {
  exec?: ProcessExecutor;
  platform?: NodeJS.Platform | string;
}

const execFileAsync = promisify(execFile);

export const DEFAULT_PROCESS_EXEC: ProcessExecutor = async (cmd, args) => {
  try {
    const { stdout } = await execFileAsync(cmd, args);
    return { stdout: String(stdout ?? ""), code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ? String(err.stdout) : "",
      code: typeof err.code === "number" ? err.code : 1,
    };
  }
};

export async function isBrowserProcessRunning(
  target: BrowserTarget,
  deps: ProcessDetectorDeps = {},
): Promise<boolean> {
  const exec = deps.exec ?? DEFAULT_PROCESS_EXEC;
  const platform = deps.platform ?? process.platform;
  try {
    if (platform === "win32") {
      const r = await exec("tasklist", [
        "/FI",
        `IMAGENAME eq ${target.processNameWin}`,
        "/FO",
        "CSV",
        "/NH",
      ]);
      return (
        r.code === 0 &&
        r.stdout.toLowerCase().includes(target.processNameWin.toLowerCase())
      );
    }
    const r = await exec("pgrep", ["-f", target.processNameMac]);
    return r.code === 0 && r.stdout.trim().length > 0;
  } catch {
    return false;
  }
}
