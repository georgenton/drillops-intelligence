"use client";
import { useEffect, useRef } from "react";
import type { EChartsOption } from "echarts";

export function EChart({ option, className="chart", ariaLabel }: { option:unknown; className?:string; ariaLabel?:string }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if (!el.current) return;
    let chart: import("echarts").ECharts | undefined;
    let active = true;
    import("echarts").then(echarts=>{
      if (!active || !el.current) return;
      chart = echarts.init(el.current, undefined, {renderer:"canvas"}); chart.setOption(option as EChartsOption);
      const resize=()=>chart?.resize(); window.addEventListener("resize",resize); (chart as typeof chart & {__resize?:()=>void}).__resize=resize;
    });
    return ()=>{ active=false; if(chart){ const resize=(chart as typeof chart & {__resize?:()=>void}).__resize; if(resize) window.removeEventListener("resize",resize); chart.dispose(); } };
  },[option]);
  return <div ref={el} className={className} role="img" aria-label={ariaLabel}/>;
}
