/**
 * 工作空间文件浏览器视图
 * 动态获取 workspace 路径，浏览文件，纯文本预览
 */
import { html, nothing } from "lit";
import type { AppViewState } from "../app-view-state.ts";
import { t } from "../i18n.ts";
import { icons } from "../icons.ts";

// 可预览的文本文件扩展名
const TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".yaml", ".yml", ".toml", ".xml", ".csv", ".log",
  ".ts", ".js", ".jsx", ".tsx", ".py", ".sh", ".bash", ".zsh",
  ".html", ".css", ".scss", ".less",
  ".go", ".rs", ".java", ".c", ".cpp", ".h", ".hpp",
  ".rb", ".php", ".sql",
  ".env", ".conf", ".cfg", ".ini", ".properties",
  ".gitignore", ".dockerignore", ".editorconfig",
]);

// 判断文件是否可预览（无扩展名的文件也视为文本，如 Makefile, Dockerfile）
function isTextFile(name: string): boolean {
  const ext = name.includes(".") ? "." + name.split(".").pop()!.toLowerCase() : "";
  return !ext || TEXT_EXTENSIONS.has(ext);
}

// 模块级状态
const workspaceState = {
  root: null as string | null,
  currentPath: null as string | null,
  items: [] as Array<{ name: string; isDir: boolean; path: string }>,
  loading: false,
  error: null as string | null,
  selectedFile: null as string | null,
  selectedFileName: null as string | null,
  fileContent: null as string | null,
  fileLoading: false,
  copySuccess: false,
};

// 列目录
async function loadDirectory(state: AppViewState, dirPath: string) {
  const w = window as any;
  if (!w.oneclaw?.workspaceListDir) return;

  workspaceState.loading = true;
  state.requestUpdate();

  try {
    const result = await w.oneclaw.workspaceListDir(dirPath);
    if (result?.success && result.data) {
      workspaceState.items = result.data.items;
      workspaceState.currentPath = dirPath;
    } else {
      workspaceState.error = result?.message ?? t("workspace.error");
    }
  } catch {
    workspaceState.error = t("workspace.error");
  } finally {
    workspaceState.loading = false;
    state.requestUpdate();
  }
}

// 初始化：从 gateway 获取 workspace 路径，设定 IPC root 守卫，然后列目录
export async function initWorkspace(state: AppViewState) {
  const w = window as any;
  workspaceState.loading = true;
  workspaceState.error = null;
  state.requestUpdate();

  try {
    // 从 gateway 动态获取 workspace 路径
    const s = state as any;
    if (s.client && s.connected) {
      const agentId = "main";
      const res = await s.client.request("agents.files.list", { agentId });
      if (res?.workspace) {
        const newRoot = res.workspace;
        // workspace 变化时重置状态
        if (workspaceState.root !== newRoot) {
          workspaceState.selectedFile = null;
          workspaceState.selectedFileName = null;
          workspaceState.fileContent = null;
          workspaceState.items = [];
        }
        workspaceState.root = newRoot;
        workspaceState.currentPath = newRoot;
        // 通知 main 进程设定路径穿越守卫
        await w.oneclaw?.workspaceSetRoot?.(newRoot);
      }
    }

    if (!workspaceState.root) {
      workspaceState.error = t("workspace.error");
      return;
    }

    await loadDirectory(state, workspaceState.root);
  } catch {
    workspaceState.error = t("workspace.error");
  } finally {
    workspaceState.loading = false;
    state.requestUpdate();
  }
}

// 读取文件内容
async function loadFileContent(state: AppViewState, filePath: string, fileName: string) {
  const w = window as any;
  if (!w.oneclaw?.workspaceReadFile) return;

  workspaceState.fileLoading = true;
  workspaceState.selectedFile = filePath;
  workspaceState.selectedFileName = fileName;
  workspaceState.fileContent = null;
  state.requestUpdate();

  try {
    const result = await w.oneclaw.workspaceReadFile(filePath);
    if (result?.success && result.data) {
      workspaceState.fileContent = result.data.content;
    } else {
      workspaceState.fileContent = null;
      workspaceState.error = result?.message ?? t("workspace.fileTooLarge");
    }
  } catch {
    workspaceState.fileContent = null;
  } finally {
    workspaceState.fileLoading = false;
    state.requestUpdate();
  }
}

// 文件/文件夹点击处理
function handleItemClick(state: AppViewState, item: { name: string; isDir: boolean; path: string }) {
  if (item.isDir) {
    // 进入子目录时清除选中的文件
    workspaceState.selectedFile = null;
    workspaceState.selectedFileName = null;
    workspaceState.fileContent = null;
    state.requestUpdate();
    void loadDirectory(state, item.path);
  } else if (isTextFile(item.name)) {
    void loadFileContent(state, item.path, item.name);
  } else {
    // 非文本文件：标记选中但不预览
    workspaceState.selectedFile = item.path;
    workspaceState.selectedFileName = item.name;
    workspaceState.fileContent = null;
    state.requestUpdate();
  }
}

// 返回上级目录
function navigateUp(state: AppViewState) {
  if (!workspaceState.currentPath || !workspaceState.root) return;
  if (workspaceState.currentPath === workspaceState.root) return;
  // 兼容 Windows 反斜杠和 Unix 正斜杠
  let parent = workspaceState.currentPath.replace(/[/\\][^/\\]+[/\\]?$/, "");
  // 防止越过 workspace 根目录
  if (!parent || parent.length < workspaceState.root.length) {
    parent = workspaceState.root;
  }
  void loadDirectory(state, parent);
}

// 系统打开文件
function openFile(filePath: string) {
  const w = window as any;
  w.oneclaw?.workspaceOpenFile?.(filePath);
}

// 系统打开文件夹
function openFolder(folderPath: string) {
  const w = window as any;
  w.oneclaw?.workspaceOpenFolder?.(folderPath);
}

// 复制文件内容到剪贴板
async function copyContent(state: AppViewState) {
  if (!workspaceState.fileContent) return;
  try {
    await navigator.clipboard.writeText(workspaceState.fileContent);
    workspaceState.copySuccess = true;
    state.requestUpdate();
    setTimeout(() => {
      workspaceState.copySuccess = false;
      state.requestUpdate();
    }, 2000);
  } catch {
    /* 剪贴板写入失败静默忽略 */
  }
}

// 计算相对路径（用于面包屑展示）
function relativePath(root: string, current: string): string {
  if (!current.startsWith(root)) return current;
  const rel = current.slice(root.length).replace(/^\//, "");
  return rel || "";
}

// 刷新当前目录
export function refreshWorkspace(state: AppViewState) {
  if (!workspaceState.currentPath) return;
  void loadDirectory(state, workspaceState.currentPath);
}

// 关闭回调类型
type CloseCallback = () => void;

// 渲染工作空间视图
export function renderWorkspaceView(state: AppViewState, onClose: CloseCallback) {
  const {
    root, currentPath, items, loading, error,
    selectedFile, selectedFileName, fileContent, fileLoading, copySuccess,
  } = workspaceState;

  const isAtRoot = !currentPath || !root || currentPath === root;
  const relPath = root && selectedFile ? relativePath(root, selectedFile) : "";
  const rootName = root?.split("/").pop() ?? "workspace";
  const breadcrumb = relPath ? `${rootName}/${relPath}` : rootName;
  const canPreview = selectedFileName ? isTextFile(selectedFileName) : false;

  return html`
    <div class="workspace-scroll">
      <section class="workspace">
        <!-- 顶栏 -->
        <div class="workspace__header">
          <h2 class="workspace__title">${t("workspace.title")}</h2>
          <div class="workspace__header-actions">
            <button
              class="workspace__header-btn"
              type="button"
              @click=${() => refreshWorkspace(state)}
              title=${t("workspace.refresh")}
              ?disabled=${loading}
            >${icons.refreshCw}</button>
            <button
              class="workspace__header-btn"
              type="button"
              @click=${() => root && openFolder(root)}
              title=${t("workspace.openRoot")}
              ?disabled=${!root}
            >${icons.folderOpen}</button>
            <button
              class="workspace__header-btn"
              type="button"
              @click=${onClose}
              title=${t("workspace.close")}
            >${icons.x}</button>
          </div>
        </div>

        <!-- 主体：左侧文件列表 + 右侧预览 -->
        <div class="workspace__body">
          <!-- 左侧文件列表 -->
          <div class="workspace__file-list">
            ${!isAtRoot ? html`
              <div
                class="workspace__file-item workspace__file-item--back"
                @click=${() => navigateUp(state)}
              >
                <span class="workspace__file-icon">..</span>
                <span class="workspace__file-name">..</span>
              </div>
            ` : nothing}
            ${loading && items.length === 0
              ? html`<div class="workspace__loading">${t("workspace.loading")}</div>`
              : error && items.length === 0
                ? html`<div class="workspace__error">${error}</div>`
                : items.length === 0
                  ? html`<div class="workspace__empty-list">${t("workspace.empty")}</div>`
                  : items.map((item) => html`
                      <div
                        class="workspace__file-item ${item.isDir ? "workspace__file-item--dir" : ""} ${selectedFile === item.path ? "active" : ""}"
                        @click=${() => handleItemClick(state, item)}
                      >
                        <span class="workspace__file-icon">
                          ${item.isDir ? icons.folder : icons.fileText}
                        </span>
                        <span class="workspace__file-name" title=${item.name}>${item.name}</span>
                        ${item.isDir ? html`
                          <button
                            class="workspace__file-action"
                            type="button"
                            @click=${(e: Event) => { e.stopPropagation(); openFolder(item.path); }}
                            title=${t("workspace.openFolder")}
                          >${icons.folderOpen}</button>
                        ` : html`
                          <button
                            class="workspace__file-action"
                            type="button"
                            @click=${(e: Event) => { e.stopPropagation(); openFile(item.path); }}
                            title=${t("workspace.open")}
                          >${icons.externalLink}</button>
                        `}
                      </div>
                    `)
            }
          </div>

          <!-- 右侧预览面板 -->
          <div class="workspace__preview">
            ${selectedFile ? html`
              <div class="workspace__preview-header">
                <span class="workspace__preview-path" title=${selectedFile}>${breadcrumb}</span>
                <div class="workspace__preview-actions">
                  ${fileContent != null ? html`
                    <button
                      class="workspace__preview-btn"
                      type="button"
                      @click=${() => void copyContent(state)}
                      title=${copySuccess ? t("workspace.copied") : t("workspace.copy")}
                    >${icons.copy}</button>
                  ` : nothing}
                  <button
                    class="workspace__preview-btn"
                    type="button"
                    @click=${() => openFile(selectedFile!)}
                    title=${t("workspace.open")}
                  >${icons.externalLink}</button>
                </div>
              </div>
              <div class="workspace__preview-content">
                ${fileLoading
                  ? html`<div class="workspace__preview-placeholder">${t("workspace.loading")}</div>`
                  : fileContent != null
                    ? html`<pre class="workspace__preview-text">${fileContent}</pre>`
                    : canPreview
                      ? html`<div class="workspace__preview-placeholder">${t("workspace.loading")}</div>`
                      : html`<div class="workspace__preview-placeholder">${t("workspace.noPreview")}</div>`
                }
              </div>
            ` : html`
              <div class="workspace__preview-empty">
                <span>${t("workspace.selectFile")}</span>
              </div>
            `}
          </div>
        </div>
      </section>
    </div>
  `;
}
