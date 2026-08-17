import { describe, expect, it } from "vitest";
import { consumableRecordSchema, crownRecordSchema, drillholeRecordSchema, intervalRecordSchema, inventoryMovementRecordSchema, reportAttachmentRecordSchema, shiftRecordSchema } from "./manual-records";

describe("validación de registros manuales", () => {
  it("rechaza un sondeo cuya profundidad actual supera el objetivo", () => {
    const result = drillholeRecordSchema.safeParse({ code:"SEC-99", project:"Secoya", rigId:"rig-1", targetDepth:100, currentDepth:101, diameter:"HQ", status:"drilling", startDate:"2026-08-08", eta:"2026-09-08" });
    expect(result.success).toBe(false);
  });

  it("rechaza horas de turno imposibles", () => {
    const result = shiftRecordSchema.safeParse({ drillholeId:"hole-1", rigId:"rig-1", date:"2026-08-08", type:"Día", crew:"Águila", supervisor:"Luis Paredes", driller:"Miguel Vera", depthStart:100, depthEnd:120, effectiveHours:10, totalHours:12, npt:{ Otros:3 } });
    expect(result.success).toBe(false);
  });

  it("exige supervisor y perforador en cada turno", () => {
    const result = shiftRecordSchema.safeParse({ drillholeId:"hole-1", rigId:"rig-1", date:"2026-08-08", type:"Día", crew:"Águila", depthStart:100, depthEnd:120, effectiveHours:9, totalHours:12, npt:{ Otros:2 } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["supervisor", "driller"]));
  });

  it("acepta un intervalo operacional válido", () => {
    const result = intervalRecordSchema.safeParse({ drillholeId:"hole-1", shiftId:"shift-1", rigId:"rig-1", startDepth:100, endDepth:103, minutes:48, bitCode:"GT-X7", waterReturn:"complete", recovery:96, hardness:4, fracturing:"medium", abrasivity:"medium", vibration:"low", stability:"stable", comment:"Registro manual", source:"manual" });
    expect(result.success).toBe(true);
  });

  it("rechaza una reserva inicial mayor que el stock de corona", () => {
    const result = crownRecordSchema.safeParse({ manufacturer:"GoldTech", product:"QA", matrix:"X9", diameter:"HQ", price:100, stock:2, reserved:3, reorder:1, historicalRop:3.2, historicalCost:20, historicalLife:150, observations:0, hardnessFit:[3,4,5], fracturingFit:["medium","high"] });
    expect(result.success).toBe(false);
  });

  it("valida movimientos positivos y consumos completos", () => {
    expect(inventoryMovementRecordSchema.safeParse({ crownId:"crown-1", type:"entrada", quantity:3, date:"2026-08-08", note:"Ingreso" }).success).toBe(true);
    expect(consumableRecordSchema.safeParse({ date:"2026-08-08", type:"Agua", quantity:1200, unit:"L", cost:42, drillhole:"SEC-42D", rig:"MP-07", metresDrilled:60 }).success).toBe(true);
    expect(reportAttachmentRecordSchema.safeParse({ fileName:"frente.webp", mimeType:"image/webp", dataUrl:"data:image/webp;base64,AA==", caption:"Frente", capturedAt:"2026-08-08" }).success).toBe(true);
  });
});
