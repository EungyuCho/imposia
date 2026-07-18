import { ImposiaError } from "./errors.js";

export interface StoredZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface StoredZipLimits {
  readonly maxEntries: number;
  readonly maxBytes: number;
}

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const VERSION_NEEDED = 10;
const VERSION_MADE_BY = 0x0314;
const DOS_TIME = 0;
const DOS_DATE = 33;
const MAX_ZIP_ENTRIES = 0xffff;
const MAX_ZIP_VALUE = 0xffffffff;
const MAX_PATH_BYTES = 1024;

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function archiveError(message: string): ImposiaError {
  return new ImposiaError("INVALID_EPUB_ARCHIVE", message);
}

function archiveLimitError(message: string): ImposiaError {
  return new ImposiaError("EPUB_ARCHIVE_LIMIT", message);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    const lookup = (crc ^ byte) & 0xff;
    crc = (CRC32_TABLE[lookup] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validArchivePath(name: string, encodedName: Uint8Array): boolean {
  const hasControlCharacter = [...name].some((character) => {
    const code = character.charCodeAt(0);
    return code < 0x20 || code === 0x7f;
  });
  if (
    name === "" ||
    name.startsWith("/") ||
    name.includes("\\") ||
    name.includes("?") ||
    name.includes("#") ||
    hasControlCharacter ||
    encodedName.byteLength > MAX_PATH_BYTES ||
    encodedName.byteLength > 0xffff
  ) {
    return false;
  }
  const segments = name.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

export function createStoredZip(
  entries: readonly StoredZipEntry[],
  limits: StoredZipLimits,
): Uint8Array<ArrayBuffer> {
  if (entries.length > limits.maxEntries || entries.length > MAX_ZIP_ENTRIES) {
    throw archiveLimitError("EPUB archive entry limit exceeded.");
  }

  const encoder = new TextEncoder();
  const names = new Set<string>();
  const records = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    if (!validArchivePath(entry.name, name)) {
      throw archiveError(`Invalid EPUB archive path: ${entry.name}`);
    }
    if (names.has(entry.name)) throw archiveError(`Duplicate EPUB archive path: ${entry.name}`);
    names.add(entry.name);
    if (entry.bytes.byteLength > MAX_ZIP_VALUE || entry.bytes.byteLength > limits.maxBytes) {
      throw archiveLimitError(`EPUB archive entry is too large: ${entry.name}`);
    }
    return Object.freeze({
      name,
      bytes: entry.bytes,
      crc: crc32(entry.bytes),
    });
  });

  const localSize = records.reduce(
    (total, record) => total + 30 + record.name.byteLength + record.bytes.byteLength,
    0,
  );
  const centralSize = records.reduce((total, record) => total + 46 + record.name.byteLength, 0);
  const totalSize = localSize + centralSize + 22;
  if (
    !Number.isSafeInteger(totalSize) ||
    localSize > MAX_ZIP_VALUE ||
    centralSize > MAX_ZIP_VALUE ||
    totalSize > limits.maxBytes
  ) {
    throw archiveLimitError("EPUB archive byte limit exceeded.");
  }

  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);
  const localOffsets: number[] = [];
  let cursor = 0;
  for (const record of records) {
    localOffsets.push(cursor);
    writeU32(view, cursor, LOCAL_SIGNATURE);
    writeU16(view, cursor + 4, VERSION_NEEDED);
    writeU16(view, cursor + 6, UTF8_FLAG);
    writeU16(view, cursor + 8, STORE_METHOD);
    writeU16(view, cursor + 10, DOS_TIME);
    writeU16(view, cursor + 12, DOS_DATE);
    writeU32(view, cursor + 14, record.crc);
    writeU32(view, cursor + 18, record.bytes.byteLength);
    writeU32(view, cursor + 22, record.bytes.byteLength);
    writeU16(view, cursor + 26, record.name.byteLength);
    writeU16(view, cursor + 28, 0);
    output.set(record.name, cursor + 30);
    output.set(record.bytes, cursor + 30 + record.name.byteLength);
    cursor += 30 + record.name.byteLength + record.bytes.byteLength;
  }

  const centralOffset = cursor;
  for (const [index, record] of records.entries()) {
    writeU32(view, cursor, CENTRAL_SIGNATURE);
    writeU16(view, cursor + 4, VERSION_MADE_BY);
    writeU16(view, cursor + 6, VERSION_NEEDED);
    writeU16(view, cursor + 8, UTF8_FLAG);
    writeU16(view, cursor + 10, STORE_METHOD);
    writeU16(view, cursor + 12, DOS_TIME);
    writeU16(view, cursor + 14, DOS_DATE);
    writeU32(view, cursor + 16, record.crc);
    writeU32(view, cursor + 20, record.bytes.byteLength);
    writeU32(view, cursor + 24, record.bytes.byteLength);
    writeU16(view, cursor + 28, record.name.byteLength);
    writeU16(view, cursor + 30, 0);
    writeU16(view, cursor + 32, 0);
    writeU16(view, cursor + 34, 0);
    writeU16(view, cursor + 36, 0);
    writeU32(view, cursor + 38, 0);
    writeU32(view, cursor + 42, localOffsets[index] ?? 0);
    output.set(record.name, cursor + 46);
    cursor += 46 + record.name.byteLength;
  }

  writeU32(view, cursor, END_SIGNATURE);
  writeU16(view, cursor + 4, 0);
  writeU16(view, cursor + 6, 0);
  writeU16(view, cursor + 8, records.length);
  writeU16(view, cursor + 10, records.length);
  writeU32(view, cursor + 12, centralSize);
  writeU32(view, cursor + 16, centralOffset);
  writeU16(view, cursor + 20, 0);
  return output;
}
