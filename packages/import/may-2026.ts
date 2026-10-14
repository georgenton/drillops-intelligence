import { createHash } from "node:crypto";
import { operationalSheets, type Sheet } from "./ooxml";
import { createZipExpansionBudget, readZip } from "./zip";
import type { OperationalImport, OperationalShift, SourceCell } from "./types";
export type { OperationalImport, OperationalShift, CrownSnapshot } from "./types";
export const ADAPTER_VERSION = "rock-report-1.0.0";
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
function number(sheet: Sheet, cell: string): number | null { const value = sheet.cells.get(cell)?.value; return typeof value === "number" && Number.isFinite(value) ? value : null; }
function string(sheet: Sheet, cell: string): string | null { const value = sheet.cells.get(cell)?.value; return value === null || value === undefined || String(value).trim() === "" ? null : String(value).trim().slice(0, 120); }
function locate(sheet: Sheet, label: string, column?: string): string | undefined { return [...sheet.cells].find(([cell, val]) => (!column || cell.replace(/\d/g, "") === column) && normalize(val.value) === label)?.[0]; }
function row(ref: string): number { return Number(ref.replace(/\D/g, "")); }
function source(sheet: Sheet, cell: string, unit: string | null = null): SourceCell { const item = sheet.cells.get(cell); return { cell, raw: item?.value ?? null, formula: item?.formula ?? null, unit }; }
function dateAt(sheet: Sheet, cell: string): string {
  const value = number(sheet, cell);
  if (value === null || value < 45000 || value > 70000) throw new Error("REPORT_DATE_INVALID");
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000).toISOString().slice(0, 10);
}

export function parseOperationalArchive(input: Buffer): OperationalImport {
  const budget = createZipExpansionBudget();
  const archive = readZip(input, budget);
  const singleWorkbook = archive.has("xl/workbook.xml");
  const files = singleWorkbook ? [["report.xlsx", input] as const] : [...archive].filter(([name]) => /\.xlsx$/i.test(name) && !name.startsWith("__MACOSX/"));
  if (!files.length || files.length > 62) throw new Error("WORKBOOK_COUNT_INVALID");
  const result: OperationalImport = { adapterVersion: ADAPTER_VERSION, archiveSha256: sha(input), shifts: [], crownSnapshots: [], issues: [], summary: { workbooks: files.length, operationalSheets: 0, rigs: 0, holes: 0, shiftPositions: 0, positiveAdvances: 0, advanceM: 0, drillingHoursWithAdvance: 0, ropMPerHour: null, byRig: {} } };
  const logicalKeys = new Set<string>();
  for (const [path, data] of files.sort(([a], [b]) => a.localeCompare(b))) {
    // Keep only basename: archive folder names may contain private identities.
    const file = path.split("/").at(-1)!, fileSha256 = sha(data);
    const book = operationalSheets(data, budget, singleWorkbook ? archive : undefined);
    for (const sheet of book.sheets) {
      result.summary.operationalSheets++;
      const wide = locate(sheet, "TOTAL (M)", "P") !== undefined;
      const valueColumn = wide ? "G" : "F", dateCell = wide ? "T6" : "S6";
      const drillingCell = locate(sheet, "PERFORACION", "B"), totalCell = locate(sheet, "TOTAL HORAS", "B");
      if (!drillingCell || !totalCell) throw new Error(`REPORT_ACTIVITY_LAYOUT_INVALID:${file}:${sheet.name}`);
      const date = dateAt(sheet, dateCell), rigCode = sheet.name;
      const holeCode = string(sheet, `${valueColumn}8`), projectCode = string(sheet, `${valueColumn}5`);
      if (book.externalLinks) result.issues.push({ file, sheet: sheet.name, cell: "", code: "EXTERNAL_LINKS_NOT_REFRESHED", severity: "warning" });
      const namedDate = file.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (namedDate && `${namedDate[3]}-${namedDate[2]}-${namedDate[1]}` !== date) result.issues.push({ file, sheet: sheet.name, cell: dateCell, code: "FILENAME_DATE_MISMATCH", severity: "error" });
      for (const [shiftType, depthRow, hoursColumn, paramColumn] of [["day", 15, "C", wide ? "AJ" : "AI"], ["night", 17, "F", wide ? "AL" : "AK"]] as const) {
        const logicalKey = sha(`${date}|${rigCode}|${shiftType}`);
        if (logicalKeys.has(logicalKey)) throw new Error(`DUPLICATE_SHIFT_IN_UPLOAD:${file}:${sheet.name}`);
        logicalKeys.add(logicalKey);
        const startCell = `C${depthRow}`, endCell = `${valueColumn}${depthRow}`, advanceCell = `${wide ? "P" : "O"}${depthRow}`;
        const startDepthM = number(sheet, startCell), endDepthM = number(sheet, endCell), cachedAdvance = number(sheet, advanceCell);
        const warnings: string[] = [];
        let advanceM: number | null = startDepthM !== null && endDepthM !== null ? endDepthM - startDepthM : null;
        if (advanceM !== null && (advanceM < 0 || startDepthM! < 0)) { advanceM = null; warnings.push("DEPTH_RANGE_INVALID"); }
        if (advanceM === null) warnings.push("DEPTH_MISSING_OR_INVALID");
        if (advanceM !== null && cachedAdvance !== null && Math.abs(advanceM - cachedAdvance) > 0.01) warnings.push("ADVANCE_CACHE_MISMATCH");
        const activities: OperationalShift["activities"] = [];
        for (let activityRow = row(drillingCell) - 2; activityRow < row(totalCell); activityRow++) {
          const label = string(sheet, `B${activityRow}`);
          if (!label) continue;
          const cell = `${hoursColumn}${activityRow}`, hours = number(sheet, cell);
          if (hours !== null && (hours < 0 || hours > 12)) warnings.push("ACTIVITY_HOURS_INVALID");
          activities.push({ label, hours: hours !== null && hours >= 0 && hours <= 12 ? hours : null, cell });
        }
        const hoursCell = `${hoursColumn}${row(drillingCell)}`, totalHoursCell = `${hoursColumn}${row(totalCell)}`;
        const rawDrilling = number(sheet, hoursCell), rawTotal = number(sheet, totalHoursCell);
        const drillingHours = rawDrilling !== null && rawDrilling >= 0 && rawDrilling <= 12 ? rawDrilling : null;
        const totalHours = rawTotal !== null && rawTotal >= 0 && rawTotal <= 12 ? rawTotal : null;
        if (advanceM !== null && advanceM > 0 && (drillingHours === null || drillingHours === 0)) warnings.push("ADVANCE_WITHOUT_DRILLING_HOURS");
        if (rawTotal !== null && totalHours === null) warnings.push("TOTAL_HOURS_INVALID");
        const activitySum = activities.reduce((sum, item) => sum + (item.hours ?? 0), 0);
        if (totalHours !== null && Math.abs(totalHours - activitySum) > 0.01) warnings.push("ACTIVITY_TOTAL_MISMATCH");
        const cells: Record<string, SourceCell> = { date: source(sheet, dateCell), startDepth: source(sheet, startCell, "m"), endDepth: source(sheet, endCell, "m"), advance: source(sheet, advanceCell, "m"), drillingHours: source(sheet, hoursCell, "h"), totalHours: source(sheet, totalHoursCell, "h") };
        for (const activity of activities) cells[`activity_${activity.cell}`] = source(sheet, activity.cell, "h");
        const pressure = (r: number) => normalize(string(sheet, `${wide ? "AM" : "AL"}${r}`)) === "PSI" ? number(sheet, `${paramColumn}${r}`) : null;
        for (const [key, r, unit] of [["rpm", 15, "rpm"], ["torque", 16, null], ["pulldown", 17, string(sheet, `${wide ? "AM" : "AL"}17`)], ["holdback", 18, string(sheet, `${wide ? "AM" : "AL"}18`)]] as const) cells[key] = source(sheet, `${paramColumn}${r}`, unit);
        result.shifts.push({ logicalKey, date, rigCode, holeCode, projectCode, shiftType, granularity: "shift", startDepthM, endDepthM, advanceM, drillingHours, totalHours, activities, parameters: { rpm: number(sheet, `${paramColumn}15`), torque: number(sheet, `${paramColumn}16`), torqueUnit: null, pulldownPsi: pressure(17), holdbackPsi: pressure(18) }, source: { file, fileSha256, sheet: sheet.name, cells }, warnings });
        for (const code of warnings) result.issues.push({ file, sheet: sheet.name, cell: code.includes("HOURS") || code.includes("ACTIVITY") ? hoursCell : advanceCell, code, severity: "warning" });
      }
      const bitColumn = wide ? "P" : "O", bit = locate(sheet, "BIT", bitColumn), shell = locate(sheet, "REAMING SHELL", bitColumn);
      if (!bit || !shell) { result.issues.push({ file, sheet: sheet.name, cell: bitColumn, code: "BIT_LAYOUT_MISSING", severity: "warning" }); continue; }
      for (let r = row(bit) + 2; r < row(shell); r++) {
        const type = string(sheet, `${bitColumn}${r}`), brand = string(sheet, `${wide ? "T" : "S"}${r}`), serial = string(sheet, `${wide ? "U" : "T"}${r}`);
        // Observation prose is deliberately excluded: it is not a structured operational identity.
        if (!type && !brand && !serial) continue;
        const startCell = `${wide ? "X" : "W"}${r}`, endCell = `${wide ? "AF" : "AE"}${r}`, total = `${wide ? "AI" : "AH"}${r}`;
        const startDepthM = number(sheet, startCell), endDepthM = number(sheet, endCell);
        const observedMetres = startDepthM !== null && endDepthM !== null && endDepthM >= startDepthM ? endDepthM - startDepthM : null;
        const warnings = endDepthM === null ? ["OPEN_RUN_END_UNOBSERVED"] : observedMetres === null ? ["BIT_DEPTH_INVALID"] : [];
        if ((number(sheet, total) ?? 0) < 0) warnings.push("NEGATIVE_CACHED_BIT_TOTAL_IGNORED");
        const key = sha(`${rigCode}|${holeCode}|${serial}|${type}|${brand}|${startDepthM}|${endDepthM}`);
        result.crownSnapshots.push({ key, date, rigCode, holeCode, type, brand, serial, startDepthM, endDepthM, observedMetres, source: { file, fileSha256, sheet: sheet.name, row: r, cells: { start: source(sheet, startCell, "m"), end: source(sheet, endCell, "m"), total: source(sheet, total, "m") } }, warnings });
      }
    }
  }
  const summary = result.summary;
  summary.rigs = new Set(result.shifts.map(s => s.rigCode)).size;
  summary.holes = new Set(result.shifts.flatMap(s => s.holeCode ? [s.holeCode] : [])).size;
  summary.shiftPositions = result.shifts.length;
  for (const shift of result.shifts) {
    const advance = shift.advanceM ?? 0;
    summary.advanceM += advance; summary.byRig[shift.rigCode] = (summary.byRig[shift.rigCode] ?? 0) + advance;
    if (advance > 0) { summary.positiveAdvances++; summary.drillingHoursWithAdvance += shift.drillingHours ?? 0; }
  }
  summary.advanceM = Math.round(summary.advanceM * 1e6) / 1e6;
  for (const rig of Object.keys(summary.byRig)) summary.byRig[rig] = Math.round(summary.byRig[rig] * 1e6) / 1e6;
  summary.ropMPerHour = summary.drillingHoursWithAdvance > 0 && !result.shifts.some(shift => shift.warnings.includes("ADVANCE_WITHOUT_DRILLING_HOURS")) ? summary.advanceM / summary.drillingHoursWithAdvance : null;
  return result;
}
