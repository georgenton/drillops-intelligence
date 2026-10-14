import { inflateRawSync } from "node:zlib";

const MAX_ARCHIVE = 32 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
export interface ZipExpansionBudget { remainingBytes: number }
export function createZipExpansionBudget(): ZipExpansionBudget { return { remainingBytes: MAX_TOTAL }; }
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Bounded, in-memory ZIP only: never extracts paths or executes content. */
export function readZip(input: Buffer, budget: ZipExpansionBudget = createZipExpansionBudget()): Map<string, Buffer> {
  if (input.length > MAX_ARCHIVE || input.length < 22) throw new Error("ZIP_SIZE_INVALID");
  let end = -1;
  for (let i = input.length - 22; i >= Math.max(0, input.length - 65557); i--) {
    if (input.readUInt32LE(i) === 0x06054b50 && i + 22 + input.readUInt16LE(i + 20) === input.length) { end = i; break; }
  }
  if (end < 0) throw new Error("ZIP_DIRECTORY_INVALID");
  const count = input.readUInt16LE(end + 10), size = input.readUInt32LE(end + 12), offset = input.readUInt32LE(end + 16);
  if (input.readUInt32LE(end + 4) !== 0 || count !== input.readUInt16LE(end + 8) || count > 2048 || offset + size !== end) throw new Error("ZIP_UNSUPPORTED_DIRECTORY");
  const result = new Map<string, Buffer>(); let cursor = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || input.readUInt32LE(cursor) !== 0x02014b50) throw new Error("ZIP_ENTRY_INVALID");
    const flags = input.readUInt16LE(cursor + 8), method = input.readUInt16LE(cursor + 10), crc = input.readUInt32LE(cursor + 16);
    const compressed = input.readUInt32LE(cursor + 20), expanded = input.readUInt32LE(cursor + 24);
    const nameLength = input.readUInt16LE(cursor + 28), extra = input.readUInt16LE(cursor + 30), comment = input.readUInt16LE(cursor + 32), local = input.readUInt32LE(cursor + 42);
    if (cursor + 46 + nameLength + extra + comment > end) throw new Error("ZIP_ENTRY_INVALID");
    const name = input.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    if (!name || name.includes("\0") || name.includes("\\") || name.startsWith("/") || /^[a-z]:/i.test(name) || name.split("/").includes("..") || result.has(name)) throw new Error("ZIP_PATH_INVALID");
    total += expanded;
    if (flags & 1 || ![0, 8].includes(method) || expanded > MAX_ENTRY || total > MAX_TOTAL || expanded / Math.max(1, compressed) > 500 || local + 30 > offset) throw new Error("ZIP_LIMIT_OR_FORMAT");
    // This budget is shared by the containing upload and every nested workbook.
    // Charge before decompression; rejecting later never permits budget reuse.
    if (!Number.isFinite(budget.remainingBytes) || expanded > budget.remainingBytes) throw new Error("ZIP_EXPANSION_BUDGET_EXCEEDED");
    budget.remainingBytes -= expanded;
    if (input.readUInt32LE(local) !== 0x04034b50) throw new Error("ZIP_LOCAL_INVALID");
    const start = local + 30 + input.readUInt16LE(local + 26) + input.readUInt16LE(local + 28);
    if (start + compressed > offset) throw new Error("ZIP_ENTRY_BOUNDS");
    const packed = input.subarray(start, start + compressed);
    const unpacked = method === 0 ? packed : inflateRawSync(packed, { maxOutputLength: MAX_ENTRY });
    if (unpacked.length !== expanded || crc32(unpacked) !== crc) throw new Error("ZIP_CHECKSUM_INVALID");
    result.set(name, unpacked); cursor += 46 + nameLength + extra + comment;
  }
  if (cursor !== end) throw new Error("ZIP_DIRECTORY_INVALID");
  return result;
}
