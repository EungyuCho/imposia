import { describe, expect, it } from "vitest";

const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;

type InspectedZipEntry = Readonly<{
  name: string;
  method: number;
  bytes: Uint8Array;
  localOffset: number;
  centralOffset: number;
}>;

function requireBounds(bytes: Uint8Array, offset: number, length: number): void {
  if (offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    throw new Error("ZIP record is outside the archive.");
  }
}

function findEndRecord(view: DataView): number {
  for (let offset = view.byteLength - 22; offset >= 0; offset -= 1) {
    if (view.getUint32(offset, true) === END_SIGNATURE) return offset;
  }
  throw new Error("ZIP end record is missing.");
}

function readUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function inspectStoredZip(bytes: Uint8Array): readonly InspectedZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndRecord(view);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  requireBounds(bytes, centralOffset, centralSize);

  const entries: InspectedZipEntry[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    requireBounds(bytes, cursor, 46);
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) {
      throw new Error("ZIP central-directory signature is invalid.");
    }
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    requireBounds(bytes, cursor + 46, nameLength + extraLength + commentLength);
    const name = readUtf8(bytes.slice(cursor + 46, cursor + 46 + nameLength));

    requireBounds(bytes, localOffset, 30);
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
      throw new Error(`ZIP local-file signature is invalid for ${name}.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const localNameOffset = localOffset + 30;
    requireBounds(bytes, localNameOffset, localNameLength + localExtraLength);
    const localName = readUtf8(bytes.slice(localNameOffset, localNameOffset + localNameLength));
    if (localName !== name) throw new Error(`ZIP local/central name mismatch for ${name}.`);
    const dataOffset = localNameOffset + localNameLength + localExtraLength;
    requireBounds(bytes, dataOffset, compressedSize);
    if (method !== 0 || compressedSize !== uncompressedSize) {
      throw new Error(`Expected an uncompressed EPUB entry: ${name}.`);
    }
    entries.push({
      name,
      method,
      bytes: bytes.slice(dataOffset, dataOffset + compressedSize),
      localOffset,
      centralOffset: cursor,
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralOffset + centralSize) {
    throw new Error("ZIP central-directory size is inconsistent.");
  }
  return entries;
}

function writeU16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, true);
}

function writeU32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value, true);
}

function storedZip(entries: readonly { name: string; text: string }[]): Uint8Array {
  const encoder = new TextEncoder();
  const records = entries.map(({ name, text }) => ({
    name: encoder.encode(name),
    bytes: encoder.encode(text),
  }));
  const localSize = records.reduce(
    (sum, record) => sum + 30 + record.name.length + record.bytes.length,
    0,
  );
  const centralSize = records.reduce((sum, record) => sum + 46 + record.name.length, 0);
  const result = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(result.buffer);
  let localOffset = 0;
  const localOffsets: number[] = [];
  for (const record of records) {
    localOffsets.push(localOffset);
    writeU32(view, localOffset, LOCAL_SIGNATURE);
    writeU16(view, localOffset + 8, 0);
    writeU32(view, localOffset + 18, record.bytes.length);
    writeU32(view, localOffset + 22, record.bytes.length);
    writeU16(view, localOffset + 26, record.name.length);
    result.set(record.name, localOffset + 30);
    result.set(record.bytes, localOffset + 30 + record.name.length);
    localOffset += 30 + record.name.length + record.bytes.length;
  }

  const centralOffset = localOffset;
  let centralCursor = centralOffset;
  records.forEach((record, index) => {
    writeU32(view, centralCursor, CENTRAL_SIGNATURE);
    writeU16(view, centralCursor + 10, 0);
    writeU32(view, centralCursor + 20, record.bytes.length);
    writeU32(view, centralCursor + 24, record.bytes.length);
    writeU16(view, centralCursor + 28, record.name.length);
    writeU32(view, centralCursor + 42, localOffsets[index] ?? 0);
    result.set(record.name, centralCursor + 46);
    centralCursor += 46 + record.name.length;
  });

  writeU32(view, centralCursor, END_SIGNATURE);
  writeU16(view, centralCursor + 8, records.length);
  writeU16(view, centralCursor + 10, records.length);
  writeU32(view, centralCursor + 12, centralCursor - centralOffset);
  writeU32(view, centralCursor + 16, centralOffset);
  return result;
}

describe("browser EPUB export archive contracts", () => {
  it("inspects central and local records and enforces the first-entry mimetype rule", () => {
    const archive = storedZip([
      { name: "mimetype", text: "application/epub+zip" },
      { name: "META-INF/container.xml", text: '<rootfile full-path="EPUB/package.opf"/>' },
    ]);
    const entries = inspectStoredZip(archive);

    expect(entries[0]?.name).toBe("mimetype");
    expect(entries[0]?.method).toBe(0);
    expect(readUtf8(entries[0]?.bytes ?? new Uint8Array())).toBe("application/epub+zip");
    expect(entries[0]?.localOffset).toBe(0);
    expect(entries[0]?.centralOffset).toBeGreaterThan(entries[0]?.localOffset ?? -1);
  });

  it("recognizes the complete reflowable EPUB package shape", () => {
    const archive = storedZip([
      { name: "mimetype", text: "application/epub+zip" },
      { name: "META-INF/container.xml", text: '<rootfile full-path="EPUB/package.opf"/>' },
      {
        name: "EPUB/package.opf",
        text: '<package><metadata><dc:title>Book</dc:title><dc:language>en</dc:language><dc:identifier>urn:test</dc:identifier><meta property="dcterms:modified">2026-07-18T00:00:00Z</meta></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="content" href="content.xhtml" media-type="application/xhtml+xml"/><item id="css" href="styles.css" media-type="text/css"/></manifest><spine><itemref idref="content"/></spine></package>',
      },
      {
        name: "EPUB/nav.xhtml",
        text: '<nav epub:type="toc"><a href="content.xhtml">Book</a></nav>',
      },
      { name: "EPUB/content.xhtml", text: '<article id="chapter">Semantic text</article>' },
      { name: "EPUB/styles.css", text: "article { color: black; }" },
    ]);
    const entries = inspectStoredZip(archive);
    const names = entries.map(({ name }) => name);
    expect(names).toEqual([
      "mimetype",
      "META-INF/container.xml",
      "EPUB/package.opf",
      "EPUB/nav.xhtml",
      "EPUB/content.xhtml",
      "EPUB/styles.css",
    ]);
    expect(readUtf8(entries[2]?.bytes ?? new Uint8Array())).toContain("dcterms:modified");
    expect(readUtf8(entries[3]?.bytes ?? new Uint8Array())).toContain('href="content.xhtml"');
    expect(readUtf8(entries[4]?.bytes ?? new Uint8Array())).toContain("Semantic text");
  });

  it("keeps duplicate archive names observable for duplicate-path assertions", () => {
    const archive = storedZip([
      { name: "mimetype", text: "application/epub+zip" },
      { name: "EPUB/content.xhtml", text: "one" },
      { name: "EPUB/content.xhtml", text: "two" },
    ]);
    const entries = inspectStoredZip(archive);
    expect(
      entries.map(({ name }) => name).filter((name) => name === "EPUB/content.xhtml"),
    ).toHaveLength(2);
  });
});
