export interface SourceCell { cell: string; raw: string | number | null; formula: string | null; unit: string | null }
export interface ImportIssue { file: string; sheet: string; cell: string; code: string; severity: "warning" | "error" }
export interface CrownSnapshot {
  key: string; date: string; rigCode: string; holeCode: string | null;
  type: string | null; brand: string | null; serial: string | null;
  startDepthM: number | null; endDepthM: number | null; observedMetres: number | null;
  source: { file: string; fileSha256: string; sheet: string; row: number; cells: Record<string, SourceCell> };
  warnings: string[];
}
export interface OperationalShift {
  logicalKey: string; date: string; rigCode: string; holeCode: string | null;
  projectCode: string | null; shiftType: "day" | "night"; granularity: "shift";
  startDepthM: number | null; endDepthM: number | null; advanceM: number | null;
  drillingHours: number | null; totalHours: number | null;
  activities: { label: string; hours: number | null; cell: string }[];
  parameters: { rpm: number | null; torque: number | null; torqueUnit: null; pulldownPsi: number | null; holdbackPsi: number | null };
  source: { file: string; fileSha256: string; sheet: string; cells: Record<string, SourceCell> };
  warnings: string[];
}
export interface OperationalImport {
  adapterVersion: string; archiveSha256: string; shifts: OperationalShift[]; crownSnapshots: CrownSnapshot[]; issues: ImportIssue[];
  summary: { workbooks: number; operationalSheets: number; rigs: number; holes: number; shiftPositions: number; positiveAdvances: number; advanceM: number; drillingHoursWithAdvance: number; ropMPerHour: number | null; byRig: Record<string, number> };
}
