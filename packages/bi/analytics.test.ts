import { describe, expect, it } from "vitest";
import { getDemoBiDataset } from "@/lib/bi-data";
import { buildOperationalSnapshot } from "./analytics";

describe("snapshot operacional único", () => {
  it("reconcilia dashboard, profundidad, NPT y corona activa con el mismo dataset", () => {
    const snapshot = buildOperationalSnapshot(getDemoBiDataset("extract"), "sec-42d", 7);

    expect(snapshot.kpis.metres).toBe(498);
    expect(snapshot.kpis.rop).toBe(4.11);
    expect(snapshot.kpis.utilization).toBe(72.1);
    expect(snapshot.daily).toHaveLength(7);
    expect(snapshot.nptTotal).toBe(28.1);
    expect(snapshot.npt[0]).toMatchObject({ cause: "Cambio de corona", hours: 4.6 });
    expect(snapshot.depth).toMatchObject({ rangeMetres: 288, weightedRop: 3.63, averageRecovery: 89.7, anomalyCount: 6, crownRuns: 4 });
    expect(snapshot.anomaly).toMatchObject({ from: 321, to: 339, ropChangePct: -40, pressureChangePct: -0.9 });
    expect(snapshot.activeCrown).toMatchObject({ code: "TORQ-A9", runMetres: 72, lifeUsedPct: 29.3, available: 3 });
    expect(snapshot.kpis.operationalCostPerMetre).toBe(73);
  });

  it("mantiene el aislamiento cuando el tenant no tiene turnos de Extract", () => {
    const snapshot = buildOperationalSnapshot(getDemoBiDataset("minera-a"), "con-12", 7);
    expect(snapshot.kpis.metres).toBe(0);
    expect(snapshot.daily).toHaveLength(0);
    expect(snapshot.nptTotal).toBe(0);
    expect(snapshot.hole?.code).toBe("CON-12");
  });
});
