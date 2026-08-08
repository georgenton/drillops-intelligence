"use client";

import { useMemo } from "react";
import type { BiChartSpec } from "@/packages/bi/types";
import { EChart } from "./echart";

const axis = {
  axisLine: { lineStyle: { color: "#344149" } },
  axisLabel: { color: "#8b989f", fontSize: 10 },
  splitLine: { lineStyle: { color: "#243038", type: "dashed" as const } },
};

export function BiChart({ spec, className = "bi-chart" }: { spec: BiChartSpec; className?: string }) {
  const option = useMemo(() => {
    const tooltip = { trigger: spec.type === "doughnut" ? "item" : "axis", backgroundColor: "#11191e", borderColor: "#344149", textStyle: { color: "#edf2f4" } };
    if (spec.type === "doughnut") {
      const values = spec.series[0]?.data as number[] ?? [];
      return {
        animationDuration: 450,
        tooltip: { ...tooltip, formatter: "{b}: {c} " + spec.unit + " ({d}%)" },
        legend: { type: "scroll", bottom: 0, textStyle: { color: "#8b989f", fontSize: 9 } },
        series: [{
          name: spec.series[0]?.name,
          type: "pie",
          radius: ["48%", "72%"],
          center: ["50%", "43%"],
          padAngle: 2,
          itemStyle: { borderRadius: 4, borderColor: "#141e24", borderWidth: 2 },
          label: { color: "#bac4c9", fontSize: 9, formatter: "{b}\n{c} " + spec.unit },
          data: values.map((value, index) => ({ name: spec.categories?.[index] ?? `Valor ${index + 1}`, value })),
        }],
      };
    }

    const base = {
      animationDuration: 450,
      tooltip: { ...tooltip, valueFormatter: (value: number) => `${value} ${spec.unit}` },
      grid: { left: 54, right: 22, top: 24, bottom: 48, containLabel: false },
      xAxis: { type: "category", data: spec.categories ?? [], name: spec.xAxisLabel, nameLocation: "middle", nameGap: 32, ...axis, splitLine: { show: false } },
      yAxis: { type: "value", name: spec.yAxisLabel, nameTextStyle: { color: "#718087" }, ...axis },
    };

    if (spec.type === "bar3d") {
      const values = spec.series[0]?.data as number[] ?? [];
      const color = spec.series[0]?.color ?? "#d7ff43";
      return {
        ...base,
        tooltip,
        series: [
          {
            name: spec.series[0]?.name,
            type: "bar",
            data: values,
            barMaxWidth: 34,
            itemStyle: {
              color: { type: "linear", x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: "#61751e" }, { offset: 0.45, color }, { offset: 1, color: "#8ca92a" }] },
              borderColor: "rgba(255,255,255,.16)",
              borderWidth: 1,
            },
            emphasis: { itemStyle: { shadowBlur: 18, shadowColor: "rgba(215,255,67,.25)" } },
          },
          {
            type: "pictorialBar",
            data: values,
            symbol: "diamond",
            symbolPosition: "end",
            symbolOffset: [0, -5],
            symbolSize: [34, 11],
            z: 3,
            silent: true,
            itemStyle: { color: "#efffae", borderColor: "rgba(255,255,255,.3)", borderWidth: 1 },
          },
        ],
      };
    }

    return {
      ...base,
      legend: spec.series.length > 1 ? { top: 0, right: 10, textStyle: { color: "#8b989f" } } : undefined,
      series: spec.series.map((series) => ({
        name: series.name,
        type: spec.type === "scatter" ? "scatter" : spec.type === "bar" ? "bar" : "line",
        data: series.data,
        smooth: spec.type === "line" || spec.type === "area",
        symbolSize: spec.type === "scatter" ? 10 : 6,
        barMaxWidth: 34,
        lineStyle: { color: series.color, width: 3 },
        itemStyle: { color: series.color, borderRadius: spec.type === "bar" ? [4, 4, 0, 0] : undefined },
        areaStyle: spec.type === "area" ? { color: "rgba(215,255,67,.14)" } : undefined,
      })),
    };
  }, [spec]);

  return <EChart option={option} className={className} ariaLabel={`${spec.title}. ${spec.subtitle}`} />;
}
