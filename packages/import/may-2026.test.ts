import { describe, expect, it } from "vitest";
import { parseOperationalArchive } from "./may-2026";
import { crc32, readZip } from "./zip";
import { operationalSheets } from "./ooxml";
// Entirely synthetic OOXML fixtures: no customer strings or source bytes.
function zip(entries: Record<string, string | Buffer>): Buffer {
  const locals: Buffer[] = [], directories: Buffer[] = []; let offset = 0;
  for (const [name, value] of Object.entries(entries)) {
    const path = Buffer.from(name), data = Buffer.from(value), local = Buffer.alloc(30), central = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc32(data), 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(path.length, 26);
    central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc32(data), 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(path.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, path, data); directories.push(central, path); offset += local.length + path.length + data.length;
  }
  const end = Buffer.alloc(22), directory = Buffer.concat(directories);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
function cell(ref: string, value: string | number): string { return typeof value === "number" ? `<c r="${ref}"><v>${value}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${value}</t></is></c>`; }
function workbook(options: { wide?: boolean; shifted?: boolean; end?: number; negativeBitCache?: boolean; extra?: Record<string, string>; dtd?: boolean } = {}): Buffer {
  const wide = options.wide, shifted = options.shifted, val = wide ? "G" : "F", total = wide ? "P" : "O", activity = shifted ? 29 : 28, bit = shifted ? 25 : 24;
  const values: Record<string, string | number> = { [`${wide ? "T" : "S"}6`]: 46160, [`${val}5`]: "SYNTHETIC", [`${val}8`]: "HOLE-TEST", [`${total}14`]: "TOTAL (m)", C15: 100, [`${val}15`]: options.end ?? 110, [`${total}15`]: (options.end ?? 110) - 100, C17: 110, [`${val}17`]: 110, [`${total}17`]: 0, [`B${activity - 2}`]: "MUDANZA", [`F${activity - 2}`]: 12, [`B${activity}`]: "PERFORACIÓN", [`C${activity}`]: 5, [`B${activity + 13}`]: "TOTAL HORAS", [`C${activity + 13}`]: 5, [`F${activity + 13}`]: 12, [`${total}${bit}`]: "BIT", [`${total}${bit + 2}`]: "HQ", [`${wide ? "T" : "S"}${bit + 2}`]: "TEST", [`${wide ? "U" : "T"}${bit + 2}`]: "SYN-001", [`${wide ? "X" : "W"}${bit + 2}`]: 10, [`${wide ? "AI" : "AH"}${bit + 2}`]: options.negativeBitCache ? -10 : 0, [`${total}${bit + 12}`]: "REAMING SHELL", B80: "PERSONAL_SECRET_DO_NOT_COPY" };
  const sheet = `${options.dtd ? '<!DOCTYPE worksheet [<!ENTITY x "bad">]>' : ""}<worksheet><sheetData>${Object.entries(values).map(([ref, value]) => cell(ref, value)).join("")}</sheetData></worksheet>`;
  return zip({ "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="RIG-TEST-001" r:id="rId1"/><sheet name="PERSONAL" state="hidden" r:id="rId2"/></sheets></workbook>', "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>', "xl/worksheets/sheet1.xml": sheet, "xl/worksheets/sheet2.xml": "PERSONAL_SECRET_DO_NOT_COPY", ...options.extra });
}
describe("operational import allowlist and reconciliation", () => {
  it.each([false, true])("recognizes compact/wide layouts (%s)", wide => {
    const parsed = parseOperationalArchive(workbook({ wide }));
    expect(parsed.summary).toMatchObject({ workbooks: 1, operationalSheets: 1, shiftPositions: 2, positiveAdvances: 1, advanceM: 10, drillingHoursWithAdvance: 5, ropMPerHour: 2 });
    expect(parsed.shifts[1].advanceM).toBe(0);
    expect(parsed.shifts[1].drillingHours).toBeNull();
    expect(parsed.shifts[1].activities.find(a => a.label === "MUDANZA")?.hours).toBe(12);
    expect(JSON.stringify(parsed)).not.toContain("PERSONAL_SECRET");
    expect(parsed.shifts[0].parameters.torqueUnit).toBeNull();
  });
  it("anchors shifted activity/BIT labels and accepts double-dot filename", () => {
    const parsed = parseOperationalArchive(zip({ "21-05-2026..xlsx": workbook({ shifted: true }) }));
    expect(parsed.shifts[0].drillingHours).toBe(5);
    expect(parsed.shifts[0].source.cells.drillingHours.cell).toBe("C29");
    expect(parsed.crownSnapshots[0].source.row).toBe(27);
  });
  it("retains open crown as unknown, never negative life", () => {
    const crown = parseOperationalArchive(workbook({ negativeBitCache: true })).crownSnapshots[0];
    expect(crown.endDepthM).toBeNull(); expect(crown.observedMetres).toBeNull();
    expect(crown.warnings).toContain("NEGATIVE_CACHED_BIT_TOTAL_IGNORED");
  });
  it("keeps stable logical keys on correction but changes file hash", () => {
    const first = parseOperationalArchive(workbook()), changed = parseOperationalArchive(workbook({ end: 111 }));
    expect(first.shifts[0].logicalKey).toBe(changed.shifts[0].logicalKey);
    expect(first.shifts[0].source.fileSha256).not.toBe(changed.shifts[0].source.fileSha256);
    expect(changed.summary.advanceM).toBe(11);
    expect(parseOperationalArchive(workbook())).toEqual(first);
  });
  it("does not refresh external links or execute formulas", () => {
    const parsed = parseOperationalArchive(workbook({ extra: { "xl/externalLinks/link.xml": '<invalid never="parsed"' } }));
    expect(parsed.issues.some(i => i.code === "EXTERNAL_LINKS_NOT_REFRESHED")).toBe(true);
  });
  it("rejects duplicate logical shifts within a batch", () => expect(() => parseOperationalArchive(zip({ "a.xlsx": workbook(), "b.xlsx": workbook() }))).toThrow("DUPLICATE_SHIFT"));
  it("rejects macro payloads", () => expect(() => parseOperationalArchive(workbook({ extra: { "xl/vbaProject.bin": "bad" } }))).toThrow("MACROS_FORBIDDEN"));
  it("rejects DTD and entities", () => expect(() => parseOperationalArchive(workbook({ dtd: true }))).toThrow("XML_DTD_FORBIDDEN"));
  it("rejects traversal paths and corrupt payloads", () => {
    expect(() => readZip(zip({ "../evil": "x" }))).toThrow("ZIP_PATH_INVALID");
    const invalid = zip({ "ok": "test" }); invalid[32] ^= 1;
    expect(() => readZip(invalid)).toThrow("ZIP_CHECKSUM_INVALID");
  });
  it("bounds size and central-directory expansion", () => {
    expect(() => readZip(Buffer.alloc(33 * 1024 * 1024))).toThrow("ZIP_SIZE_INVALID");
    const invalid = zip({ "ok": "x" }), central = invalid.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); invalid.writeUInt32LE(32 * 1024 * 1024, central + 24);
    expect(() => readZip(invalid)).toThrow("ZIP_LIMIT_OR_FORMAT");
  });
  it("shares cumulative expansion budget across nested archives", () => {
    const inner = zip({ "payload": "12345678" });
    const outer = zip({ "nested.xlsx": inner });
    const budget = { remainingBytes: inner.length + 7 };
    const entries = readZip(outer, budget);
    expect(budget.remainingBytes).toBe(7);
    expect(() => readZip(entries.get("nested.xlsx")!, budget)).toThrow("ZIP_EXPANSION_BUDGET_EXCEEDED");
  });
  it("caps operational sheets per workbook before parsing sheet payloads", () => {
    const files = readZip(workbook());
    files.set("xl/workbook.xml", Buffer.from(`<workbook xmlns:r="r"><sheets>${Array.from({ length: 9 }, (_, i) => `<sheet name="RIG-TEST-${i}" r:id="rId1"/>`).join("")}</sheets></workbook>`));
    expect(() => operationalSheets(zip(Object.fromEntries(files)))).toThrow("OPERATIONAL_SHEET_LIMIT");
  });
});
