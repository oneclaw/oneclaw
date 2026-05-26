import * as fs from "fs";
import * as path from "path";
import { Unzip, UnzipInflate } from "fflate";
import {
  asUint8Array,
  createPathRegistry,
  type EntryKind,
  validatePortablePath,
} from "./openclaw-state-archive-paths";

type ZipCentralEntry = {
  name: string;
  kind: EntryKind;
  segments: string[];
  compression: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  mode: number | null;
  mtime: Date;
  seen: boolean;
};

type ZipCentralDirectory = {
  entries: Map<string, ZipCentralEntry>;
};

type ZipArchiveSummary = {
  entryNames: string[];
  entryContents: Map<string, Buffer>;
};

type StreamEntryState = {
  entry: ZipCentralEntry;
  crc: number;
  size: number;
  fd?: number;
  targetPath?: string;
  capture?: {
    chunks: Buffer[];
    contents: Map<string, Buffer>;
  };
};

const ZIP_CHUNK_SIZE = 64 * 1024;
const MAX_CAPTURED_ENTRY_BYTES = 5 * 1024 * 1024;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP64_SENTINEL_16 = 0xffff;
const ZIP64_SENTINEL_32 = 0xffffffff;
const ZIP_COMPRESSION_STORE = 0;
const ZIP_COMPRESSION_DEFLATE = 8;
const ZIP_FLAG_ENCRYPTED = 1;
const ZIP_FLAG_DATA_DESCRIPTOR = 1 << 3;
const ZIP_FLAG_UTF8 = 1 << 11;
const ZIP_DOS_ATTR_DIRECTORY = 0x10;
const ZIP_UNIX_TYPE_MASK = 0o170000;
const ZIP_UNIX_TYPE_FILE = 0o100000;
const ZIP_UNIX_TYPE_DIR = 0o040000;
const ZIP_UNIX_TYPE_SYMLINK = 0o120000;
const ZIP_INITIAL_CRC = 0xffffffff;

export async function readArchive(
  zipPath: string,
  rootDir: string,
  outputDir?: string,
  captureEntryNames: ReadonlySet<string> = new Set(),
): Promise<ZipArchiveSummary> {
  if (!fs.existsSync(zipPath)) {
    throw new Error("ZIP 文件不存在");
  }

  // Treat the central directory as the manifest, then require every streamed
  // local entry to match it. This keeps validation identical for dry-run and write.
  const centralDirectory = readCentralDirectory(zipPath, rootDir);
  const entryContents = new Map<string, Buffer>();
  const openFiles = new Set<number>();
  if (outputDir) ensureOutputRootDir(outputDir);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let input: fs.ReadStream | null = null;

    const closeOpenFiles = () => {
      // A validation error can arrive while a file entry is mid-stream.
      // Closing descriptors here keeps failed imports from pinning files.
      for (const fd of openFiles) {
        try { fs.closeSync(fd); } catch {}
      }
      openFiles.clear();
    };

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      closeOpenFiles();
      input?.destroy();
      reject(normalizeZipError(err));
    };

    const unzip = new Unzip((file) => {
      try {
        const entry = centralDirectory.entries.get(file.name);
        if (!entry) {
          throw new Error(`不是有效的 ZIP 数据包: local entry 缺少 central directory 记录: ${file.name}`);
        }
        if (entry.seen) {
          throw new Error(`重复 entry: ${file.name}`);
        }
        entry.seen = true;

        if (file.compression !== entry.compression) {
          throw new Error(`不是有效的 ZIP 数据包: local/central entry 不一致: ${file.name}`);
        }
        if (file.compression !== ZIP_COMPRESSION_STORE && file.compression !== ZIP_COMPRESSION_DEFLATE) {
          throw new Error(`ZIP 压缩方式不受支持: ${file.name}`);
        }
        if (typeof file.originalSize === "number" && file.originalSize !== entry.uncompressedSize) {
          throw new Error(`不是有效的 ZIP 数据包: entry 长度不一致: ${file.name}`);
        }
        if (typeof file.size === "number" && file.size !== entry.compressedSize) {
          throw new Error(`不是有效的 ZIP 数据包: entry 压缩长度不一致: ${file.name}`);
        }
        if (entry.kind === "dir" && (file.originalSize ?? 0) > 0) {
          throw new Error(`目录 entry 不能包含数据: ${file.name}`);
        }

        const streamState: StreamEntryState = { entry, crc: ZIP_INITIAL_CRC, size: 0 };
        if (captureEntryNames.has(entry.name)) {
          streamState.capture = { chunks: [], contents: entryContents };
        }
        if (outputDir) {
          const targetPath = path.join(outputDir, ...entry.segments);
          streamState.targetPath = targetPath;
          ensureOutputParentDirs(outputDir, entry.segments.slice(0, -1));
          if (entry.kind === "dir") {
            ensureDirectoryOutputTarget(targetPath);
          } else {
            ensureFileOutputTarget(targetPath);
            const fd = fs.openSync(targetPath, "w");
            openFiles.add(fd);
            streamState.fd = fd;
          }
        }

        file.ondata = (err, chunk, final) => {
          if (err) { fail(err); return; }
          try { handleArchiveChunk(streamState, chunk, final, openFiles); }
          catch (chunkErr) { fail(chunkErr); }
        };

        file.start();
      } catch (err) {
        file.terminate();
        fail(err);
      }
    });
    unzip.register(UnzipInflate);

    input = fs.createReadStream(zipPath, { highWaterMark: ZIP_CHUNK_SIZE });
    input.on("data", (chunk) => {
      if (settled) return;
      try { unzip.push(asUint8Array(chunk)); }
      catch (err) { fail(err); }
    });
    input.on("error", fail);
    input.on("end", () => {
      if (settled) return;
      try {
        unzip.push(new Uint8Array(), true);
        verifyAllCentralEntriesWereSeen(centralDirectory);
        settled = true;
        closeOpenFiles();
        resolve();
      } catch (err) { fail(err); }
    });
  });

  if (outputDir) {
    restoreDirectoryMetadata(centralDirectory, outputDir);
  }

  return { entryNames: [...centralDirectory.entries.keys()], entryContents };
}

function readCentralDirectory(zipPath: string, rootDir: string): ZipCentralDirectory {
  const stat = fs.statSync(zipPath);
  if (!stat.isFile() || stat.size < 22) throw new Error("不是有效的 ZIP 数据包");

  // OneClaw only accepts the simple ZIP subset it can restore consistently:
  // single-disk, non-ZIP64 archives with the central directory at EOF.
  const tailLength = Math.min(stat.size, 22 + 65535);
  const tailOffset = stat.size - tailLength;
  const tail = readFileSlice(zipPath, tailOffset, tailLength);
  const eocdTailOffset = findEndOfCentralDirectory(tail);
  if (eocdTailOffset < 0) throw new Error("不是有效的 ZIP 数据包");

  const eocdOffset = tailOffset + eocdTailOffset;
  const diskNumber = tail.readUInt16LE(eocdTailOffset + 4);
  const centralDisk = tail.readUInt16LE(eocdTailOffset + 6);
  const diskEntryCount = tail.readUInt16LE(eocdTailOffset + 8);
  const totalEntryCount = tail.readUInt16LE(eocdTailOffset + 10);
  const centralSize = tail.readUInt32LE(eocdTailOffset + 12);
  const centralOffset = tail.readUInt32LE(eocdTailOffset + 16);

  if (diskNumber !== 0 || centralDisk !== 0 || diskEntryCount !== totalEntryCount) {
    throw new Error("ZIP 分卷数据包不受支持");
  }
  if (totalEntryCount === ZIP64_SENTINEL_16 || centralSize === ZIP64_SENTINEL_32 || centralOffset === ZIP64_SENTINEL_32) {
    throw new Error("ZIP64 数据包不受支持");
  }
  if (centralOffset + centralSize !== eocdOffset || centralOffset > stat.size || centralSize > stat.size) {
    throw new Error("不是有效的 ZIP 数据包");
  }

  const central = readFileSlice(zipPath, centralOffset, centralSize);
  const registry = createPathRegistry(rootDir);
  const entries = new Map<string, ZipCentralEntry>();
  let offset = 0;

  for (let i = 0; i < totalEntryCount; i++) {
    if (offset + 46 > central.length || central.readUInt32LE(offset) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error("不是有效的 ZIP 数据包");
    }

    const versionMadeBy = central.readUInt16LE(offset + 4);
    const flags = central.readUInt16LE(offset + 8);
    const compression = central.readUInt16LE(offset + 10);
    const dosTime = central.readUInt16LE(offset + 12);
    const dosDate = central.readUInt16LE(offset + 14);
    const crc32 = central.readUInt32LE(offset + 16);
    const compressedSize = central.readUInt32LE(offset + 20);
    const uncompressedSize = central.readUInt32LE(offset + 24);
    const nameLength = central.readUInt16LE(offset + 28);
    const extraLength = central.readUInt16LE(offset + 30);
    const commentLength = central.readUInt16LE(offset + 32);
    const diskStart = central.readUInt16LE(offset + 34);
    const externalAttrs = central.readUInt32LE(offset + 38);
    const localHeaderOffset = central.readUInt32LE(offset + 42);
    const entryEnd = offset + 46 + nameLength + extraLength + commentLength;

    if (entryEnd > central.length) throw new Error("不是有效的 ZIP 数据包");
    if (diskStart !== 0) throw new Error("ZIP 分卷数据包不受支持");
    if (compressedSize === ZIP64_SENTINEL_32 || uncompressedSize === ZIP64_SENTINEL_32 || localHeaderOffset === ZIP64_SENTINEL_32) {
      throw new Error("ZIP64 数据包不受支持");
    }
    if (localHeaderOffset >= centralOffset) throw new Error("不是有效的 ZIP 数据包");
    if ((flags & ZIP_FLAG_ENCRYPTED) !== 0) throw new Error("ZIP 加密数据包不受支持");
    if (compression !== ZIP_COMPRESSION_STORE && compression !== ZIP_COMPRESSION_DEFLATE) {
      throw new Error("ZIP 压缩方式不受支持");
    }

    const name = decodeZipName(central.subarray(offset + 46, offset + 46 + nameLength), flags);
    const kind: EntryKind = name.endsWith("/") ? "dir" : "file";
    const portable = validatePortablePath(name, kind, registry);
    validateZipEntryType({ name, kind, versionMadeBy, externalAttrs, uncompressedSize });

    entries.set(name, {
      name, kind, segments: portable.segments, compression, crc32,
      compressedSize, uncompressedSize, localHeaderOffset,
      mode: extractUnixMode(versionMadeBy, externalAttrs),
      mtime: dateFromDos(dosDate, dosTime), seen: false,
    });
    offset = entryEnd;
  }

  if (offset !== central.length) throw new Error("不是有效的 ZIP 数据包");
  validateLocalHeaders(zipPath, [...entries.values()], centralOffset);
  return { entries };
}

function validateLocalHeaders(zipPath: string, entries: ZipCentralEntry[], centralOffset: number): void {
  // Local headers are not trusted on their own; they must agree with the
  // central directory and occupy exactly the byte range assigned to the entry.
  const sorted = [...entries].sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);
  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i];
    const nextOffset = sorted[i + 1]?.localHeaderOffset ?? centralOffset;
    if (nextOffset <= entry.localHeaderOffset) throw new Error("不是有效的 ZIP 数据包");

    const header = readFileSlice(zipPath, entry.localHeaderOffset, 30);
    if (header.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) throw new Error("不是有效的 ZIP 数据包");

    const flags = header.readUInt16LE(6);
    const compression = header.readUInt16LE(8);
    const localCrc32 = header.readUInt32LE(14);
    const localCompressedSize = header.readUInt32LE(18);
    const localUncompressedSize = header.readUInt32LE(22);
    const nameLength = header.readUInt16LE(26);
    const extraLength = header.readUInt16LE(28);
    const dataStart = entry.localHeaderOffset + 30 + nameLength + extraLength;

    if (dataStart > nextOffset || dataStart > centralOffset) throw new Error("不是有效的 ZIP 数据包");
    if ((flags & ZIP_FLAG_ENCRYPTED) !== 0) throw new Error("ZIP 加密数据包不受支持");
    if (compression !== entry.compression) throw new Error("不是有效的 ZIP 数据包");

    const nameBytes = readFileSlice(zipPath, entry.localHeaderOffset + 30, nameLength);
    if (decodeZipName(nameBytes, flags) !== entry.name) throw new Error("不是有效的 ZIP 数据包");

    if ((flags & ZIP_FLAG_DATA_DESCRIPTOR) === 0) {
      const dataEnd = dataStart + entry.compressedSize;
      if (
        localCrc32 !== entry.crc32 ||
        localCompressedSize !== entry.compressedSize ||
        localUncompressedSize !== entry.uncompressedSize ||
        nextOffset !== dataEnd
      ) {
        throw new Error("不是有效的 ZIP 数据包");
      }
      continue;
    }
    validateDataDescriptor(zipPath, dataStart, nextOffset, entry);
  }
}

function validateDataDescriptor(zipPath: string, dataStart: number, nextOffset: number, entry: ZipCentralEntry): void {
  // Streaming writers often store CRC/sizes after file data. Support both
  // descriptor forms, but require the descriptor to sit exactly after payload.
  if (nextOffset - dataStart >= 16) {
    const descriptorOffset = nextOffset - 16;
    const descriptor = readFileSlice(zipPath, descriptorOffset, 16);
    if (descriptor.readUInt32LE(0) === 0x08074b50) {
      validateDescriptorValues(entry, descriptor.readUInt32LE(4), descriptor.readUInt32LE(8), descriptor.readUInt32LE(12));
      if (descriptorOffset - dataStart !== entry.compressedSize) throw new Error("不是有效的 ZIP 数据包");
      return;
    }
  }

  if (nextOffset - dataStart >= 12) {
    const descriptorOffset = nextOffset - 12;
    const descriptor = readFileSlice(zipPath, descriptorOffset, 12);
    validateDescriptorValues(entry, descriptor.readUInt32LE(0), descriptor.readUInt32LE(4), descriptor.readUInt32LE(8));
    if (descriptorOffset - dataStart !== entry.compressedSize) throw new Error("不是有效的 ZIP 数据包");
    return;
  }

  throw new Error("不是有效的 ZIP 数据包");
}

function handleArchiveChunk(state: StreamEntryState, chunk: Uint8Array | null | undefined, final: boolean, openFiles: Set<number>): void {
  const data = chunk ?? new Uint8Array();
  if (data.length > 0) {
    if (state.entry.kind === "dir") throw new Error(`目录 entry 不能包含数据: ${state.entry.name}`);
    state.crc = updateCrc32(state.crc, data);
    state.size += data.length;
    if (state.capture) {
      if (state.size > MAX_CAPTURED_ENTRY_BYTES) throw new Error(`ZIP entry 过大: ${state.entry.name}`);
      state.capture.chunks.push(Buffer.from(data));
    }
    if (state.fd !== undefined) fs.writeSync(state.fd, data);
  }
  if (!final) return;

  // Verify length and CRC before the entry is considered restored; metadata is
  // applied only after the descriptor is closed.
  if (state.fd !== undefined) {
    fs.closeSync(state.fd);
    openFiles.delete(state.fd);
    state.fd = undefined;
  }
  if (state.size !== state.entry.uncompressedSize) throw new Error(`ZIP entry 长度校验失败: ${state.entry.name}`);
  const actualCrc = (state.crc ^ ZIP_INITIAL_CRC) >>> 0;
  if (actualCrc !== state.entry.crc32) throw new Error(`ZIP CRC 校验失败: ${state.entry.name}`);
  if (state.capture) state.capture.contents.set(state.entry.name, Buffer.concat(state.capture.chunks));
  if (state.targetPath && state.entry.kind === "file") applyPathMetadata(state.targetPath, state.entry);
}

function verifyAllCentralEntriesWereSeen(centralDirectory: ZipCentralDirectory): void {
  for (const entry of centralDirectory.entries.values()) {
    if (!entry.seen) throw new Error(`不是有效的 ZIP 数据包: central entry 缺少 local entry: ${entry.name}`);
  }
}

function restoreDirectoryMetadata(centralDirectory: ZipCentralDirectory, outputDir: string): void {
  const dirs = [...centralDirectory.entries.values()]
    .filter((entry) => entry.kind === "dir")
    .sort((a, b) => b.segments.length - a.segments.length);
  for (const entry of dirs) applyPathMetadata(path.join(outputDir, ...entry.segments), entry);
}

function ensureOutputRootDir(rootDir: string): void {
  const stat = lstatIfExists(rootDir);
  if (!stat) {
    fs.mkdirSync(rootDir, { recursive: true });
    return;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`.openclaw 不是目录: ${rootDir}`);
  }
}

function ensureOutputParentDirs(rootDir: string, segments: string[]): void {
  let current = rootDir;
  for (const segment of segments) {
    current = path.join(current, segment);
    ensureDirectoryOutputTarget(current);
  }
}

function ensureDirectoryOutputTarget(targetPath: string): void {
  const stat = lstatIfExists(targetPath);
  if (!stat) {
    fs.mkdirSync(targetPath, { recursive: true });
    return;
  }
  if (stat.isDirectory() && !stat.isSymbolicLink()) return;
  removeOutputPath(targetPath);
  fs.mkdirSync(targetPath, { recursive: true });
}

function ensureFileOutputTarget(targetPath: string): void {
  const stat = lstatIfExists(targetPath);
  if (!stat) return;
  if (stat.isFile() && !stat.isSymbolicLink()) return;
  removeOutputPath(targetPath);
}

function lstatIfExists(targetPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(targetPath);
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

function removeOutputPath(targetPath: string): void {
  fs.rmSync(targetPath, {
    recursive: true,
    force: true,
    maxRetries: process.platform === "win32" ? 5 : 0,
    retryDelay: 100,
  });
}

function validateZipEntryType(params: { name: string; kind: EntryKind; versionMadeBy: number; externalAttrs: number; uncompressedSize: number }): void {
  if (params.kind === "dir" && params.uncompressedSize !== 0) throw new Error(`目录 entry 不能包含数据: ${params.name}`);
  const dosAttrs = params.externalAttrs & 0xff;
  if (params.kind === "file" && (dosAttrs & ZIP_DOS_ATTR_DIRECTORY) !== 0) throw new Error(`文件目录冲突: ${params.name}`);

  // Unix-origin archives expose symlinks/devices via external attributes.
  // Reject anything that is not a plain file or directory.
  const originOs = params.versionMadeBy >>> 8;
  if (originOs !== 3 && originOs !== 19) return;
  const fileType = (params.externalAttrs >>> 16) & ZIP_UNIX_TYPE_MASK;
  if (fileType === 0) return;
  if (fileType === ZIP_UNIX_TYPE_SYMLINK) throw new Error(`不支持的 ZIP 条目: ${params.name}`);
  if (fileType !== ZIP_UNIX_TYPE_FILE && fileType !== ZIP_UNIX_TYPE_DIR) throw new Error(`不支持的 ZIP 条目: ${params.name}`);
  if (fileType === ZIP_UNIX_TYPE_DIR && params.kind !== "dir") throw new Error(`文件目录冲突: ${params.name}`);
  if (fileType === ZIP_UNIX_TYPE_FILE && params.kind !== "file") throw new Error(`文件目录冲突: ${params.name}`);
}

function validateDescriptorValues(entry: ZipCentralEntry, crc32: number, compressedSize: number, uncompressedSize: number): void {
  if (crc32 !== entry.crc32) throw new Error(`ZIP CRC 校验失败: ${entry.name}`);
  if (compressedSize !== entry.compressedSize || uncompressedSize !== entry.uncompressedSize) throw new Error("不是有效的 ZIP 数据包");
}

function extractUnixMode(versionMadeBy: number, externalAttrs: number): number | null {
  const originOs = versionMadeBy >>> 8;
  if (originOs !== 3 && originOs !== 19) return null;
  const mode = (externalAttrs >>> 16) & 0o777;
  return mode > 0 ? mode : null;
}

function applyPathMetadata(targetPath: string, entry: ZipCentralEntry): void {
  if (entry.mode !== null) {
    try { fs.chmodSync(targetPath, entry.mode); } catch {}
  }
  try { fs.utimesSync(targetPath, entry.mtime, entry.mtime); } catch {}
}

function decodeZipName(nameBytes: Buffer, flags: number): string {
  // Avoid CP437/locale-dependent decoding; non-ASCII names must be marked UTF-8.
  if ((flags & ZIP_FLAG_UTF8) === 0 && nameBytes.some((byte) => byte > 0x7f)) {
    throw new Error("ZIP 文件名编码不受支持");
  }
  return nameBytes.toString("utf-8");
}

function dateFromDos(dosDate: number, dosTime: number): Date {
  if (dosDate === 0) return new Date(0);
  const year = ((dosDate >>> 9) & 0x7f) + 1980;
  const month = (dosDate >>> 5) & 0x0f;
  const day = dosDate & 0x1f;
  const hour = (dosTime >>> 11) & 0x1f;
  const minute = (dosTime >>> 5) & 0x3f;
  const second = (dosTime & 0x1f) * 2;
  return new Date(year, Math.max(month - 1, 0), Math.max(day, 1), hour, minute, second);
}

function findEndOfCentralDirectory(tail: Buffer): number {
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tail.readUInt32LE(offset) !== EOCD_SIGNATURE) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === tail.length) return offset;
  }
  return -1;
}

function readFileSlice(filePath: string, offset: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  if (length === 0) return buf;
  const fd = fs.openSync(filePath, "r");
  try {
    const bytesRead = fs.readSync(fd, buf, 0, length, offset);
    if (bytesRead !== length) throw new Error("不是有效的 ZIP 数据包");
    return buf;
  } finally { fs.closeSync(fd); }
}

function normalizeZipError(err: unknown): Error {
  if (err instanceof Error) {
    if (
      err.message.startsWith("非法") || err.message.startsWith("不支持") ||
      err.message.startsWith("Windows") || err.message.startsWith("ZIP") ||
      err.message.startsWith("不是有效") || err.message.startsWith("重复") ||
      err.message.startsWith("大小写") || err.message.startsWith("文件目录") ||
      err.message.startsWith("目录 entry") || err.message.includes(".openclaw 不是目录")
    ) return err;
    return new Error(`不是有效的 ZIP 数据包: ${err.message}`);
  }
  return new Error(`不是有效的 ZIP 数据包: ${String(err)}`);
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function updateCrc32(crc: number, chunk: Uint8Array): number {
  let next = crc >>> 0;
  for (const byte of chunk) {
    next = (CRC32_TABLE[(next ^ byte) & 0xff] ^ (next >>> 8)) >>> 0;
  }
  return next;
}
