type OpenclawStateImportLifecycleDeps = {
  // 排空在途 gateway 操作：取消待执行的 restart 定时器，并等待任何已触发的
  // start/restart 跑完，确保导入触碰文件系统前没有 spawn/启动仍在访问状态目录。
  quiesceGateway: () => Promise<void>;
  validateArchive: (filePath: string) => Promise<void>;
  stopGateway: () => Promise<void>;
  importArchive: (filePath: string) => Promise<void>;
  reconcileHostState: () => Promise<void>;
  syncImportedConfigState: () => void | Promise<void>;
  startGateway: () => Promise<void>;
};

export function createOpenclawStateImportLifecycle(deps: OpenclawStateImportLifecycleDeps) {
  let importActive = false;

  return {
    isImportActive: () => importActive,
    async importOpenclawState(filePath: string): Promise<void> {
      if (importActive) {
        throw new Error("正在导入 .openclaw 数据包，请稍后再试。");
      }

      importActive = true;
      try {
        await deps.quiesceGateway();
        await deps.validateArchive(filePath);
        await deps.stopGateway();
        await deps.importArchive(filePath);
        await deps.reconcileHostState();
        await deps.syncImportedConfigState();
        await deps.startGateway();
      } finally {
        importActive = false;
      }
    },
  };
}
