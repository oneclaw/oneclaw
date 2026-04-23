import type { BrowserState } from "./browser-extension-installer";
import type { CacheManifest } from "./webbridge-installer";

export interface WebbridgeInstallState {
  installed: boolean;
  version: string | null;
  binaryPath: string;
  etag: string | null;
  extensionId: string;
  browsers: BrowserState[];
}

export interface GetStateDeps {
  binaryPath: string;
  dataDir: string;
  fileExists: (p: string) => boolean;
  readManifest: (dataDir: string) => CacheManifest | null;
  readExtensionStates: (extId: string) => Promise<BrowserState[]>;
  extensionId: string;
}

export async function getWebbridgeInstallState(
  deps: GetStateDeps,
): Promise<WebbridgeInstallState> {
  const installed = deps.fileExists(deps.binaryPath);

  let version: string | null = null;
  let etag: string | null = null;
  if (installed) {
    try {
      const manifest = deps.readManifest(deps.dataDir);
      if (manifest) {
        version = manifest.version || null;
        etag = manifest.etag || null;
      }
    } catch {
      // disk IO 异常不传导
    }
  }

  let browsers: BrowserState[] = [];
  try {
    browsers = await deps.readExtensionStates(deps.extensionId);
  } catch {
    // reg/fs 异常不传导
  }

  return {
    installed,
    version,
    binaryPath: deps.binaryPath,
    etag,
    extensionId: deps.extensionId,
    browsers,
  };
}
