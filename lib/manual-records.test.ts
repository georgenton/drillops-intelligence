import { describe, expect, it } from "vitest";
import { drillholeRecordSchema, intervalRecordSchema, shiftRecordSchema } from "./manual-records";

describe("validación de registros manuales", () => {
  it("rechaza un sondeo cuya profundidad actual supera el objetivo", () => {
    const result = drillholeRecordSchema.safeParse({ code:"SEC-99", project:"Secoya", rigId:"rig-1", targetDepth:100, currentDepth:101, diameter:"HQ", status:"drilling", startDate:"2026-08-08", eta:"2026-09-08" });
    expect(result.success).toBe(false);
  });

  it("rechaza horas de turno imposibles", () => {
    const result = shiftRecordSchema.safeParse({ drillholeId:"hole-1", rigId:"rig-1", date:"2026-08-08", type:"Día", crew:"Águila", depthStart:100, depthEnd:120, effectiveHours:10, totalHours:12, npt:{ Otros:3 } });
    expect(result.success).toBe(false);
  });

  it("acepta un intervalo operacional válido", () => {
    const result = intervalRecordSchema.safeParse({ drillholeId:"hole-1", shiftId:"shift-1", rigId:"rig-1", startDepth:100, endDepth:103, minutes:48, bitCode:"GT-X7", waterReturn:"complete", recovery:96, hardness:4, fracturing:"medium", abrasivity:"medium", vibration:"low", stability:"stable", comment:"Registro manual", source:"manual" });
    expect(result.success).toBe(true);
  });
});
