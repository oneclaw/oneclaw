// 工作空间文件系统操作 — 目录浏览、文件读取、系统打开
// 所有路径操作均验证在 workspace 根目录内，防止路径穿越
import { ipcMain, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as log from "./logger";

// workspace 根路径由渲染进程首次调用 workspace:set-root 设定
let workspaceRoot: string | null = null;

// 路径穿越校验：确保 target 在 root 内
function isInsideRoot(target: string, root: string): boolean {
  const resolved = path.resolve(target);
  const resolvedRoot = path.resolve(root);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
}

// 公共守卫：检查 workspace root 和路径合法性
function guardPath(filePath: string): { ok: true } | { ok: false; error: { success: false; message: string } } {
  if (!workspaceRoot) {
    return { ok: false, error: { success: false, message: "Workspace root not set" } };
  }
  if (!isInsideRoot(filePath, workspaceRoot)) {
    log.error(`workspace: path traversal blocked: ${filePath}`);
    return { ok: false, error: { success: false, message: "Access denied" } };
  }
  return { ok: true };
}

export function registerWorkspaceIpc(): void {
  // 设置 workspace 根路径（渲染进程从 gateway 获取后传入）
  ipcMain.handle("workspace:set-root", (_e, root: string) => {
    const resolved = path.resolve(root);
    workspaceRoot = resolved;
    log.info(`workspace root set: ${resolved}`);
    return { success: true };
  });

  // 用系统默认应用打开文件
  ipcMain.handle("workspace:open-file", async (_e, filePath: string) => {
    const check = guardPath(filePath);
    if (!check.ok) return check.error;
    try {
      await shell.openPath(filePath);
      return { success: true };
    } catch (err: any) {
      log.error(`workspace:open-file failed: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  // 在 Finder/Explorer 中显示文件所在目录
  ipcMain.handle("workspace:open-folder", (_e, filePath: string) => {
    const check = guardPath(filePath);
    if (!check.ok) return check.error;
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err: any) {
      log.error(`workspace:open-folder failed: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  // 列出目录内容（支持子目录浏览）
  ipcMain.handle("workspace:list-dir", async (_e, dirPath: string) => {
    const check = guardPath(dirPath);
    if (!check.ok) return check.error;
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
      const items = entries
        .filter((e) => !e.name.startsWith("."))
        .map((e) => ({
          name: e.name,
          isDir: e.isDirectory(),
          path: path.join(dirPath, e.name),
        }))
        .sort((a, b) => {
          // 文件夹在前，文件在后；同类型按名称排序
          if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      return { success: true, data: { items, root: dirPath } };
    } catch (err: any) {
      log.error(`workspace:list-dir failed: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });

  // 读取文件内容（纯文本，限制 1MB）
  ipcMain.handle("workspace:read-file", async (_e, filePath: string) => {
    const check = guardPath(filePath);
    if (!check.ok) return check.error;
    try {
      const stat = await fs.promises.stat(filePath);
      if (stat.size > 1024 * 1024) {
        return { success: false, message: "File too large (>1MB)" };
      }
      const content = await fs.promises.readFile(filePath, "utf-8");
      return { success: true, data: { content, name: path.basename(filePath), path: filePath } };
    } catch (err: any) {
      log.error(`workspace:read-file failed: ${err?.message}`);
      return { success: false, message: err?.message ?? String(err) };
    }
  });
}
