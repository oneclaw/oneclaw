import { reconcileCliOnAppLaunch } from "./cli-integration";
import { reconcileExtensionsOnAppLaunch } from "./extension-mirror";
import * as log from "./logger";

type OpenclawStateImportHostReconcileDeps = {
  reconcileExtensions: () => Promise<void>;
  reconcileCli: () => Promise<void>;
  logError: (message: string) => void;
};

const defaultDeps: OpenclawStateImportHostReconcileDeps = {
  reconcileExtensions: reconcileExtensionsOnAppLaunch,
  reconcileCli: reconcileCliOnAppLaunch,
  logError: log.error,
};

export async function reconcileHostStateAfterOpenclawImport(
  deps: OpenclawStateImportHostReconcileDeps = defaultDeps,
): Promise<void> {
  await deps.reconcileExtensions();
  try {
    await deps.reconcileCli();
  } catch (err) {
    deps.logError(`[import] CLI launch reconciliation failed after .openclaw import: ${err instanceof Error ? err.message : String(err)}`);
  }
}
