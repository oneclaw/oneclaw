import * as fs from "fs";

type OpenclawStateExportTarget = {
  filePath: string;
  overwriteExisting: boolean;
};

type OpenclawStateExportOverwriteWarning = {
  message: string;
  detail: string;
  confirmLabel: string;
  cancelLabel: string;
  defaultId: number;
  cancelId: number;
};

export function resolveOpenclawStateExportTarget(
  selectedPath: string,
  exists: (filePath: string) => boolean = fs.existsSync,
): OpenclawStateExportTarget {
  const filePath = ensureZipExtension(selectedPath);
  return {
    filePath,
    overwriteExisting: exists(filePath),
  };
}

export function buildOpenclawStateExportOverwriteWarning(
  filePath: string,
): OpenclawStateExportOverwriteWarning {
  return {
    message: "将覆盖现有 ZIP，导出失败可能导致该文件损坏或丢失，确定继续吗？",
    detail: filePath,
    confirmLabel: "继续覆盖",
    cancelLabel: "取消",
    defaultId: 1,
    cancelId: 1,
  };
}

function ensureZipExtension(filePath: string): string {
  // Native save panels can return a path without the filtered extension.
  return filePath.toLowerCase().endsWith(".zip") ? filePath : `${filePath}.zip`;
}
