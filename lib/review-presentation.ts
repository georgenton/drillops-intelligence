import type { compareCrownHistory } from "@/packages/domain/crown-history";
import type { RaulMseSample } from "@/packages/domain/raul-mse";

export const formatCrownNumber = (value: number | null | undefined, decimals = 2) =>
  value == null ? "—" : new Intl.NumberFormat("es-EC", { maximumFractionDigits: decimals }).format(value);

/** Presentation only: preserve missing results and the comparison's exact order. */
export function historicalCrownChart(rows: ReturnType<typeof compareCrownHistory>) {
  return {
    tooltip: { trigger: "axis", valueFormatter: (value: number | null) => `${formatCrownNumber(value)} m/h` },
    grid: { left: 155, right: 65, top: 25, bottom: 50 },
    xAxis: { type: "value", name: "ROP (m/h)", nameLocation: "middle", nameGap: 30, splitLine: { lineStyle: { color: "#253038" } } },
    yAxis: { type: "category", inverse: true, data: rows.map(row => `${row.brand ?? "Marca no informada"} · ${row.type ?? "Tipo no informado"}`), axisLabel: { width: 140, overflow: "truncate" } },
    series: [{ type: "bar", barMaxWidth: 35, data: rows.map(row => row.ropMPerHour), itemStyle: { color: "#56c7ff" }, label: { show: true, position: "right", formatter: ({ value }: { value: number | null }) => formatCrownNumber(value) } }],
  };
}

export function hasMseResult(sample: RaulMseSample | undefined): sample is RaulMseSample & { value: number } {
  return Boolean(sample && (sample.family === "HQ" || sample.family === "NQ") && sample.status === "experimental" && sample.value !== null && Number.isFinite(sample.value));
}
