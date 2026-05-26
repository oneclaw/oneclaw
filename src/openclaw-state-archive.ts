import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import {
  asUint8Array,
  assertArchiveOutsideStateDir,
  buildOpenclawStateArchiveDefaultFileName,
  createPathRegistry,
  type EntryKind,
  toError,
  validatePortablePath,
} from "./openclaw-state-archive-paths";
import { readArchive } from "./openclaw-state-archive-zip";

export { buildOpenclawStateArchiveDefaultFileName };

type OpenclawStateEntry = {
  absPath: string;
  relPath: string;
  kind: EntryKind;
  mode: number;
  mtime: Date;
};

const ZIP_CHUNK_SIZE = 64 * 1024;
const ARCHIVE_MARKER_NAME = ".oneclaw-openclaw-state-archive";
const ARCHIVE_MARKER_CONTENT = "oneclaw-openclaw-state-archive/v1\n";
// Runtime-only locks/logs are host-specific; they are skipped on export and
// stripped again after import in case a third-party archive includes them.
const VOLATILE_RUNTIME_FILES = new Set(["app.log", "gateway.lock", "gateway.log"]);

export async function exportOpenclawStateToArchive(
  stateDir: string,
  targetZipPath: string,
): Promise<void> {
  assertArchiveOutsideStateDir(targetZipPath, stateDir);
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), "oneclaw-openclaw-export-"));
  const snapshotDir = path.join(snapshotRoot, "state");

  try {
    if (fs.existsSync(stateDir)) {
      const stateRoot = path.resolve(stateDir);
      fs.cpSync(stateDir, snapshotDir, {
        recursive: true,
        force: true,
        verbatimSymlinks: true,
        filter: (src) => {
          // Filter root runtime files before cp opens them; nested same-name
          // files can be user data and must remain exportable.
          const srcPath = path.resolve(src);
          if (path.dirname(srcPath) !== stateRoot) return true;
          const name = path.basename(srcPath);
          return !VOLATILE_RUNTIME_FILES.has(name) && name !== ARCHIVE_MARKER_NAME;
        },
      });
    }
    const entries = collectOpenclawStateEntries(snapshotDir);

    fs.mkdirSync(path.dirname(targetZipPath), { recursive: true });
    const fd = fs.openSync(targetZipPath, "w");
    try {
      await writeZip(entries, fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (err) {
    throw toError(err);
  } finally {
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
  }
}

export async function validateOpenclawStateArchive(
  zipPath: string,
  stateDir: string,
): Promise<void> {
  assertArchiveOutsideStateDir(zipPath, stateDir);
  const archive = await readArchive(
    zipPath,
    stateDir,
    undefined,
    new Set([ARCHIVE_MARKER_NAME, "openclaw.json"]),
  );
  validateArchiveMarker(archive.entryNames, archive.entryContents);
}

export async function importOpenclawStateFromArchive(
  zipPath: string,
  stateDir: string,
): Promise<void> {
  assertArchiveOutsideStateDir(zipPath, stateDir);
  // Revalidate at the destructive boundary: the selected ZIP path can change
  // while the gateway is stopping, and clearing the current state is irreversible.
  await validateOpenclawStateArchive(zipPath, stateDir);
  clearStateDirForImport(stateDir);
  await readArchive(zipPath, stateDir, stateDir);
  removeVolatileRuntimeFiles(stateDir);
  removeArchiveMarker(stateDir);
}

function clearStateDirForImport(stateDir: string): void {
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
    return;
  }

  const stat = fs.lstatSync(stateDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`.openclaw 不是目录: ${stateDir}`);
  }

  for (const name of fs.readdirSync(stateDir)) {
    fs.rmSync(path.join(stateDir, name), {
      recursive: true,
      force: true,
      maxRetries: process.platform === "win32" ? 5 : 0,
      retryDelay: 100,
    });
  }
}

function collectOpenclawStateEntries(stateDir: string): OpenclawStateEntry[] {
  if (!fs.existsSync(stateDir)) return [];

  const rootStat = fs.lstatSync(stateDir);
  if (!rootStat.isDirectory()) {
    throw new Error(`.openclaw 不是目录: ${stateDir}`);
  }

  const entries: OpenclawStateEntry[] = [];
  const registry = createPathRegistry(stateDir);

  const walk = (dir: string, relSegments: string[]) => {
    // Stable traversal makes archive contents deterministic for tests and
    // avoids platform-specific readdir ordering.
    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const child of children) {
      const childSegments = [...relSegments, child.name];
      const relPath = childSegments.join("/");

      if (
        relSegments.length === 0 &&
        (VOLATILE_RUNTIME_FILES.has(child.name) || child.name === ARCHIVE_MARKER_NAME)
      ) {
        continue;
      }

      const absPath = path.join(dir, child.name);
      const stat = fs.lstatSync(absPath);

      if (stat.isSymbolicLink()) {
        throw new Error(`不支持的 .openclaw 条目: ${relPath}`);
      }

      if (stat.isDirectory()) {
        const dirRelPath = `${relPath}/`;
        validatePortablePath(dirRelPath, "dir", registry);
        entries.push({ absPath, relPath: dirRelPath, kind: "dir", mode: stat.mode, mtime: stat.mtime });
        walk(absPath, childSegments);
        continue;
      }

      if (stat.isFile()) {
        validatePortablePath(relPath, "file", registry);
        entries.push({ absPath, relPath, kind: "file", mode: stat.mode, mtime: stat.mtime });
        continue;
      }

      throw new Error(`不支持的 .openclaw 条目: ${relPath}`);
    }
  };

  walk(stateDir, []);
  return entries;
}

function removeVolatileRuntimeFiles(stateDir: string): void {
  for (const fileName of VOLATILE_RUNTIME_FILES) {
    fs.rmSync(path.join(stateDir, fileName), { recursive: true, force: true });
  }
}

function removeArchiveMarker(stateDir: string): void {
  fs.rmSync(path.join(stateDir, ARCHIVE_MARKER_NAME), { force: true });
}

function validateArchiveMarker(entryNames: string[], entryContents: Map<string, Buffer>): void {
  if (!entryNames.includes(ARCHIVE_MARKER_NAME)) {
    throw new Error("不是 OneClaw .openclaw 数据包");
  }
  if (entryNames.some((name) => name === ".openclaw" || name === ".openclaw/" || name.startsWith(".openclaw/"))) {
    throw new Error("不是 OneClaw .openclaw 数据包");
  }
  if (!entryNames.includes("openclaw.json")) {
    throw new Error("不是 OneClaw .openclaw 数据包");
  }
  const markerContent = entryContents.get(ARCHIVE_MARKER_NAME);
  if (!markerContent?.equals(Buffer.from(ARCHIVE_MARKER_CONTENT, "utf8"))) {
    throw new Error("不是 OneClaw .openclaw 数据包");
  }
  const configContent = entryContents.get("openclaw.json");
  if (!configContent) {
    throw new Error("不是 OneClaw .openclaw 数据包");
  }
  try {
    const config = JSON.parse(configContent.toString("utf8"));
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error("root must be an object");
    }
  } catch {
    throw new Error("不是 OneClaw .openclaw 数据包");
  }
}

async function writeZip(entries: OpenclawStateEntry[], fd: number): Promise<void> {
  // fflate emits ZIP bytes through callbacks while file data is read
  // asynchronously; the Promise bridges those two lifecycles.
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (!settled) { settled = true; resolve(); }
    };
    const fail = (err: unknown) => {
      if (!settled) { settled = true; reject(err); }
    };

    const zip = new Zip((err, chunk, final) => {
      if (err) { fail(err); return; }
      if (chunk?.length) fs.writeSync(fd, chunk);
      if (final) finish();
    });

    (async () => {
      try {
        addArchiveMarker(zip);
        for (const entry of entries) {
          if (entry.kind === "dir") {
            const dirEntry = new ZipPassThrough(entry.relPath);
            applyZipAttributes(dirEntry, entry);
            zip.add(dirEntry);
            dirEntry.push(new Uint8Array(), true);
          } else {
            const fileEntry = new ZipDeflate(entry.relPath, { level: 6 });
            applyZipAttributes(fileEntry, entry);
            zip.add(fileEntry);
            await pushFileToZip(entry.absPath, fileEntry);
          }
        }
        zip.end();
      } catch (err) {
        zip.terminate();
        fail(err);
      }
    })();
  });
}

function addArchiveMarker(zip: Zip): void {
  const markerEntry = new ZipPassThrough(ARCHIVE_MARKER_NAME);
  markerEntry.os = 3;
  markerEntry.mtime = new Date(1980, 0, 1);
  markerEntry.attrs = 0o644 << 16;
  zip.add(markerEntry);
  markerEntry.push(Buffer.from(ARCHIVE_MARKER_CONTENT), true);
}

function applyZipAttributes(zipEntry: ZipPassThrough | ZipDeflate, entry: OpenclawStateEntry): void {
  // Mark entries as Unix-origin so permission bits survive round trips for
  // scripts and bundled skill files.
  zipEntry.os = 3;
  zipEntry.mtime = entry.mtime;
  const permissionBits = entry.mode & 0o777;
  const directoryFlag = entry.kind === "dir" ? 0x10 : 0;
  zipEntry.attrs = (permissionBits << 16) | directoryFlag;
}

async function pushFileToZip(absPath: string, zipEntry: ZipDeflate): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const input = fs.createReadStream(absPath, { highWaterMark: ZIP_CHUNK_SIZE });
    input.on("data", (chunk) => { zipEntry.push(asUint8Array(chunk)); });
    input.on("error", reject);
    input.on("end", () => {
      zipEntry.push(new Uint8Array(), true);
      resolve();
    });
  });
}
