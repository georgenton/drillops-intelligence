import { describe, expect, it } from "vitest";
import { getDemoBiDataset } from "@/lib/bi-data";
import { raulMarchConsumableItems, raulMonthlyConsumableCosts } from "@/lib/raul-data";
import { buildOperationalSnapshot } from "./analytics";
import { executeBiQuery, inferBiQuery } from "./query";

describe("consultas BI", () => {
  const dataset = getDemoBiDataset("extract");
  const snapshot = buildOperationalSnapshot(dataset, "sec-42d", 7);
  const context = { crowns: dataset.crowns.map((crown) => ({ product: crown.product, rop: crown.historicalRop, cost: crown.historicalCost, available: crown.stock - crown.reserved })), intervals: dataset.intervals };

  it("interpreta indicador, unidades y gráfica solicitada", () => {
    expect(inferBiQuery("¿Cuántos metros perforamos? Grafícalo en pies con columnas 3D"))
      .toEqual({ metric: "metres", chartType: "bar3d", units: "imperial" });
  });

  it("prioriza la fecha estimada cuando la pregunta también menciona rendimiento", () => {
    expect(inferBiQuery("¿Cuándo terminaríamos el sondeo al rendimiento actual?"))
      .toEqual({ metric: "eta", chartType: null, units: "metric" });
  });

  it("reconoce planificación, consumibles y MSE", () => {
    expect(inferBiQuery("Compara lo programado vs ejecutado").metric).toBe("planned");
    expect(inferBiQuery("Grafica los consumibles de marzo").metric).toBe("consumables");
    expect(inferBiQuery("Muestra la MSE por profundidad").metric).toBe("mse");
  });

  it("convierte el avance a pies sin cambiar los datos base", () => {
    const result = executeBiQuery(snapshot, { metric: "metres", chartType: "bar3d", units: "imperial" }, context);
    expect(result.chart?.type).toBe("bar3d");
    expect(result.chart?.unit).toBe("ft");
    const total = (result.chart?.series[0]?.data as number[]).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(498 * 3.28084, 1);
  });

  it("genera Pareto NPT y series por profundidad", () => {
    const npt = executeBiQuery(snapshot, { metric: "npt", chartType: "doughnut", units: "metric" }, context);
    const pressure = executeBiQuery(snapshot, { metric: "pressure", chartType: "line", units: "metric" }, context);
    expect(npt.chart?.categories?.[0]).toBe("Cambio de corona");
    expect(npt.chart?.series[0]?.data).toContain(4.6);
    expect(pressure.chart?.categories?.length).toBeGreaterThan(20);
    expect(pressure.answer).toContain("-0,9%");
  });

  it("responde con planificación, consumibles reconciliados y MSE", () => {
    const planned = executeBiQuery(snapshot, { metric: "planned", chartType: "bar", units: "metric" }, context);
    const consumables = executeBiQuery(snapshot, { metric: "consumables", chartType: "bar", units: "metric" }, {
      ...context,
      monthlyConsumables: raulMonthlyConsumableCosts,
      consumableItems: raulMarchConsumableItems,
    });
    const mse = executeBiQuery(snapshot, { metric: "mse", chartType: "line", units: "metric" }, {
      ...context,
      intervals: dataset.intervals.map((interval, index) => ({ ...interval, mse: 100 + index })),
    });

    expect(planned.chart?.series).toHaveLength(2);
    expect(planned.answer).toContain("programados");
    expect(consumables.answer).toContain("3.622,95 USD");
    expect(consumables.chart?.series[0]?.data).toHaveLength(4);
    expect(mse.answer).toContain("MSE media calculada");
    expect(mse.chart?.unit).toBe("MPa");
  });
});
