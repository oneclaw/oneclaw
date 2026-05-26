import * as fs from "fs";
import * as path from "path";

export type EntryKind = "file" | "dir";

export type PathRegistry = {
  rootDir: string;
  nodes: Map<string, PathNode>;
  caseSegments: Map<string, Map<string, string>>;
};

type PathNode = {
  kind: EntryKind;
  explicit: boolean;
};

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const WINDOWS_ILLEGAL_CHARS = /[<>:"|?*]/;
const CASE_INSENSITIVE_PLATFORM = process.platform === "win32" || process.platform === "darwin";

export function buildOpenclawStateArchiveDefaultFileName(date: Date = new Date()): string {
  return `oneclaw-${formatTimestamp(date)}.zip`;
}

export function createPathRegistry(rootDir: string): PathRegistry {
  return {
    rootDir: path.resolve(rootDir),
    nodes: new Map(),
    caseSegments: new Map(),
  };
}

export function validatePortablePath(
  rawName: string,
  kind: EntryKind,
  registry: PathRegistry,
): { normalizedPath: string; segments: string[] } {
  // ZIP entry names must stay portable across macOS/Windows and must never
  // resolve outside the target .openclaw directory.
  if (!rawName) {
    throw new Error("非法路径: entry 不能为空");
  }
  if (rawName.includes("\0")) {
    throw new Error(`非法路径: ${rawName}`);
  }
  if (rawName.includes("\\")) {
    throw new Error(`非法路径包含反斜杠: ${rawName}`);
  }
  if (rawName.startsWith("/") || rawName.startsWith("//")) {
    throw new Error(`非法绝对路径: ${rawName}`);
  }
  if (/^[A-Za-z]:\//.test(rawName) || /^[A-Za-z]:$/.test(rawName)) {
    throw new Error(`非法 Windows 盘符路径: ${rawName}`);
  }

  const normalizedName = kind === "dir" ? rawName.replace(/\/+$/, "") : rawName;
  if (!normalizedName) {
    throw new Error("非法路径: entry 不能为空");
  }

  const segments = normalizedName.split("/");
  for (const segment of segments) {
    validatePathSegment(segment, rawName);
  }

  const resolved = path.resolve(registry.rootDir, ...segments);
  if (!isSamePathOrInside(resolved, registry.rootDir)) {
    throw new Error(`非法越界路径: ${rawName}`);
  }

  recordCaseSegments(segments, registry, rawName);
  recordPathNode(segments, kind, registry, rawName);

  return {
    normalizedPath: segments.join("/"),
    segments,
  };
}

export function assertArchiveOutsideStateDir(zipPath: string, stateDir: string): void {
  // Import streams entries into .openclaw and may overwrite same-name files, so
  // reject archives inside the target tree before any write begins.
  // The path check catches selections inside .openclaw; realpath also catches
  // external symlinks that resolve back into the state dir.
  const selectedPath = path.resolve(zipPath);
  const selectedRootDir = path.resolve(stateDir);
  if (isSamePathOrInside(selectedPath, selectedRootDir)) {
    throw new Error("ZIP 数据包不能位于当前 .openclaw 目录内，请先移动到桌面或下载目录后重试。");
  }

  const archivePath = resolveRealPathForContainment(zipPath);
  const rootDir = resolveRealPathIfExists(stateDir);
  if (isSamePathOrInside(archivePath, rootDir)) {
    throw new Error("ZIP 数据包不能位于当前 .openclaw 目录内，请先移动到桌面或下载目录后重试。");
  }
}

export function asUint8Array(chunk: string | Buffer): Uint8Array {
  return typeof chunk === "string" ? Buffer.from(chunk) : chunk;
}

export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function isSamePathOrInside(candidatePath: string, rootPath: string): boolean {
  const candidate = normalizeForContainment(candidatePath);
  const root = normalizeForContainment(rootPath);
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function normalizeForContainment(input: string): string {
  const resolved = path.resolve(input);
  return CASE_INSENSITIVE_PLATFORM ? resolved.toLowerCase() : resolved;
}

function resolveRealPathIfExists(input: string): string {
  try {
    return fs.realpathSync.native(input);
  } catch {
    return path.resolve(input);
  }
}

function resolveRealPathForContainment(input: string): string {
  const resolved = path.resolve(input);
  const missingSegments: string[] = [];
  let existingAncestor = resolved;

  while (!fs.existsSync(existingAncestor)) {
    const parent = path.dirname(existingAncestor);
    if (parent === existingAncestor) return resolved;
    missingSegments.unshift(path.basename(existingAncestor));
    existingAncestor = parent;
  }

  try {
    return path.resolve(fs.realpathSync.native(existingAncestor), ...missingSegments);
  } catch {
    return resolved;
  }
}

function validatePathSegment(segment: string, rawName: string): void {
  if (!segment || segment === "." || segment === "..") {
    throw new Error(`非法路径段: ${rawName}`);
  }
  if (segment.includes("\0")) {
    throw new Error(`非法路径段: ${rawName}`);
  }
  if (WINDOWS_RESERVED_NAME.test(segment)) {
    throw new Error(`Windows 保留名不可导入或导出: ${rawName}`);
  }
  if (WINDOWS_ILLEGAL_CHARS.test(segment)) {
    throw new Error(`Windows 非法文件名: ${rawName}`);
  }
  if (/[. ]$/.test(segment)) {
    throw new Error(`Windows 非法尾随空格或点: ${rawName}`);
  }
}

function recordCaseSegments(segments: string[], registry: PathRegistry, rawName: string): void {
  // Case-insensitive filesystems would collapse `Dir/a` and `dir/b`; fail
  // early instead of producing archives that only restore on some platforms.
  let parentKey = "";
  for (const segment of segments) {
    let siblings = registry.caseSegments.get(parentKey);
    if (!siblings) {
      siblings = new Map();
      registry.caseSegments.set(parentKey, siblings);
    }

    const lower = segment.toLowerCase();
    const previous = siblings.get(lower);
    if (previous && previous !== segment) {
      throw new Error(`大小写冲突: ${rawName}`);
    }
    siblings.set(lower, segment);
    parentKey = parentKey ? `${parentKey}/${lower}` : lower;
  }
}

function recordPathNode(segments: string[], kind: EntryKind, registry: PathRegistry, rawName: string): void {
  // Child entries imply parent directories. Later explicit directory entries
  // may confirm them, but files and duplicate explicit entries still conflict.
  let current = "";
  for (let i = 0; i < segments.length - 1; i++) {
    current = current ? `${current}/${segments[i]}` : segments[i];
    const node = registry.nodes.get(current);
    if (node?.kind === "file") {
      throw new Error(`文件目录冲突: ${rawName}`);
    }
    if (!node) {
      registry.nodes.set(current, { kind: "dir", explicit: false });
    }
  }

  const normalizedPath = segments.join("/");
  const existing = registry.nodes.get(normalizedPath);
  if (kind === "file") {
    if (existing?.kind === "dir") {
      throw new Error(`文件目录冲突: ${rawName}`);
    }
    if (existing?.kind === "file") {
      throw new Error(`重复 entry: ${rawName}`);
    }
    registry.nodes.set(normalizedPath, { kind: "file", explicit: true });
    return;
  }

  if (existing?.kind === "file") {
    throw new Error(`文件目录冲突: ${rawName}`);
  }
  if (existing?.kind === "dir" && existing.explicit) {
    throw new Error(`重复 entry: ${rawName}`);
  }
  registry.nodes.set(normalizedPath, { kind: "dir", explicit: true });
}

function formatTimestamp(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}${m}${d}-${hh}${mm}${ss}`;
}
