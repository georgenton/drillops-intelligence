import { describe, expect, it } from "vitest";
import { parseOperationalArchive } from "./may-2026";
import { crc32, readZip } from "./zip";
import { operationalSheets } from "./ooxml";
import {parseReportDetails} from "./report-details";
import {planOperationalBackfill} from "./backfill";
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
function workbook(options: { wide?: boolean; shifted?: boolean; end?: number; negativeBitCache?: boolean; extra?: Record<string, string>; dtd?: boolean; cells?:Record<string,string|number> } = {}): Buffer {
  const wide = options.wide, shifted = options.shifted, val = wide ? "G" : "F", total = wide ? "P" : "O", activity = shifted ? 29 : 28, bit = shifted ? 25 : 24;
  const values: Record<string, string | number> = { [`${wide ? "T" : "S"}6`]: 46160, [`${val}5`]: "SYNTHETIC", [`${val}8`]: "HOLE-TEST", [`${total}14`]: "TOTAL (m)", C15: 100, [`${val}15`]: options.end ?? 110, [`${total}15`]: (options.end ?? 110) - 100, C17: 110, [`${val}17`]: 110, [`${total}17`]: 0, [`B${activity - 2}`]: "MUDANZA", [`F${activity - 2}`]: 12, [`B${activity}`]: "PERFORACIÓN", [`C${activity}`]: 5, [`B${activity + 13}`]: "TOTAL HORAS", [`C${activity + 13}`]: 5, [`F${activity + 13}`]: 12, [`${total}${bit}`]: "BIT", [`${total}${bit + 2}`]: "HQ", [`${wide ? "T" : "S"}${bit + 2}`]: "TEST", [`${wide ? "U" : "T"}${bit + 2}`]: "SYN-001", [`${wide ? "X" : "W"}${bit + 2}`]: 10, [`${wide ? "AI" : "AH"}${bit + 2}`]: options.negativeBitCache ? -10 : 0, [`${total}${bit + 12}`]: "REAMING SHELL", B80: "PERSONAL_SECRET_DO_NOT_COPY" };
  const sheet = `${options.dtd ? '<!DOCTYPE worksheet [<!ENTITY x "bad">]>' : ""}<worksheet><sheetData>${Object.entries({...values,...options.cells}).map(([ref, value]) => cell(ref, value)).join("")}</sheetData></worksheet>`;
  return zip({ "xl/workbook.xml": '<workbook xmlns:r="r"><sheets><sheet name="RIG-TEST-001" r:id="rId1"/><sheet name="PERSONAL" state="hidden" r:id="rId2"/></sheets></workbook>', "xl/_rels/workbook.xml.rels": '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>', "xl/worksheets/sheet1.xml": sheet, "xl/worksheets/sheet2.xml": "PERSONAL_SECRET_DO_NOT_COPY", ...options.extra });
}
describe("operational import allowlist and reconciliation", () => {
  it("uses the unique wide night hours anchor, preserving zero and rejecting ambiguity",()=>{
   const shifted=parseOperationalArchive(workbook({wide:true,cells:{F26:"",G26:12}}));
   expect(shifted.shifts[1].activities[0]).toMatchObject({cell:"G26",hours:12});
   expect(shifted.shifts[1].warnings).not.toContain("ACTIVITY_TOTAL_MISMATCH");
   const zero=parseOperationalArchive(workbook({wide:true,cells:{F26:0}}));
   expect(zero.shifts[1].activities[0].hours).toBe(0);
   const ambiguous=parseOperationalArchive(workbook({wide:true,cells:{F26:2,G26:10}}));
   expect(ambiguous.shifts[1].activities[0].hours).toBeNull();
   expect(ambiguous.shifts[1].warnings).toContain("ACTIVITY_HOURS_AMBIGUOUS");
  });
  it("preserves report-grain survey and original fuel units, flags bad water and missing caches",()=>{
    const sheet={name:"RIG-SYN",cells:new Map(Object.entries({B20:"PROFUNDIDAD (m):",C20:21.25,I20:-42.5,T20:135,Y20:"MAGNÉTICO",AE20:"SYNTHETIC-INSTRUMENT",F11:100,O11:102,S11:2,T11:"m3",F12:102,S12:-102,T12:"m3",AK11:8,AL11:"gls",AF7:"100 PSI",B42:"EQUIPOS DE TRANSPORTE (HORAS)",B44:"SYN TOOL",L44:0}).map(([k,value])=>[k,{value,formula:null}]))};
    const report=parseReportDetails(sheet,{date:"2026-01-01",rigCode:"RIG-SYN",holeCode:"H-SYN",source:{file:"synthetic.xlsx",fileSha256:"s",sheet:sheet.name}},false);
    expect(report.survey[0]).toMatchObject({depthM:21.25,dip:-42.5,azimuth:135,reference:"MAGNÉTICO",equipment:"SYNTHETIC-INSTRUMENT",valid:true});
    expect(report.consumptions.find(x=>x.label==="Combustible"&&x.shiftType==="day")).toMatchObject({value:8,unit:"gls"});
    expect(report.consumptions.find(x=>x.label==="Agua"&&x.shiftType==="night")).toMatchObject({value:null,validity:"invalid"});
    expect(report.equipmentHours.find(x=>x.label==="SYN TOOL")).toMatchObject({value:null,validity:"invalid"});
    expect(report.fluidParameters.find(x=>x.label==="Presión")).toMatchObject({value:100,unit:"PSI",shiftType:null});
  });
  it("wide water keeps F anchor and displaced numeric units never become physical units",()=>{
    const base={date:"2026-01-01",rigCode:"RIG-SYN",holeCode:null,source:{file:"synthetic.xlsx",fileSha256:"s",sheet:"RIG-SYN"}};
    const sheet={name:"RIG-SYN",cells:new Map(Object.entries({F11:10,P11:12,T11:2,U11:"m3",F12:12,P12:13,T12:1,U12:100,AL11:0,AM11:"gls"}).map(([k,value])=>[k,{value,formula:null as string|null}]))};
    sheet.cells.get("AL11")!.formula="+AH11-AC11";
    const report=parseReportDetails(sheet,base,true);
    expect(report.consumptions[0]).toMatchObject({value:2,unit:"m3",validity:"observed"});
    expect(report.consumptions.find(x=>x.label==="Agua"&&x.shiftType==="night")).toMatchObject({value:null,unit:null,validity:"invalid"});
    expect(report.consumptions.find(x=>x.label==="Combustible"&&x.shiftType==="day")).toMatchObject({value:null,validity:"invalid"});
  });
  it("backfill preserves manual core corrections and is idempotent",()=>{
    const parsed=parseOperationalArchive(workbook());
    const current=parsed.shifts.map(s=>({...s,revision:2,diameter:undefined,advanceM:77,warnings:[...s.warnings,"MANUAL_CORRECTION"]}));
    parsed.shifts[0].diameter="HQ";
    const plan=planOperationalBackfill(current,parsed);
    expect(plan.conflicts).toEqual([]);expect(plan.changes[0].next.advanceM).toBe(77);
    expect(plan.changes[0].manualCorrectionPreserved).toBe(true);
    const after=current.map(s=>({...plan.changes.find(c=>c.logicalKey===s.logicalKey)?.next??s,revision:3}));
    expect(planOperationalBackfill(after,parsed).changes).toEqual([]);
    parsed.shifts[0].source={...parsed.shifts[0].source,fileSha256:"unexpected"};
    expect(planOperationalBackfill(current,parsed).conflicts[0]).toContain("SOURCE_CHANGED");
  });
  it("signs existing report values/revisions and exposes report changes before applying",()=>{
    const parsed=parseOperationalArchive(workbook());
    const shifts=parsed.shifts.map(s=>({...s,revision:1}));
    const report=parsed.operationalReports![0];
    const initial=planOperationalBackfill(shifts,parsed);
    expect(initial.reportCounts).toEqual({inserted:1,updated:0,unchanged:0});
    expect(initial.reportChanges[0]).toMatchObject({previous:null,next:report,revision:null});
    const current=[{payload:report,revision:1,adapterVersion:parsed.adapterVersion}];
    const same=planOperationalBackfill(shifts,parsed,current);
    expect(same.reportCounts).toEqual({inserted:0,updated:0,unchanged:1});
    expect(same.reportChanges).toEqual([]);
    const newer=planOperationalBackfill(shifts,parsed,[{...current[0],revision:2}]);
    expect(newer.digest).not.toBe(same.digest);
    const edited=[{...current[0],payload:{...report,holeCode:"CHANGED"}}];
    const changed=planOperationalBackfill(shifts,parsed,edited);
    expect(changed.digest).not.toBe(same.digest);
    expect(changed.reportCounts.updated).toBe(1);
    expect(changed.reportChanges[0].previous?.holeCode).toBe("CHANGED");
    expect(planOperationalBackfill(shifts,parsed,[{...edited[0],adapterVersion:"manual-v1"}]).conflicts[0]).toContain("MANUAL_REPORT_CONFLICT");
  });
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
