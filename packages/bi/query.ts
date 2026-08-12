import { safeDivide } from "@/packages/domain/calculations";
import type { BiAnswer, BiChartSpec, BiChartType, BiMetric, BiQueryRequest, BiUnitSystem, OperationalSnapshot } from "./types";

const METRES_TO_FEET = 3.28084;
const COLORS = ["#d7ff43", "#56c7ff", "#ff9f43", "#bd8cff", "#41d6a3", "#ff6969"];
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const round = (value: number, digits = 2) => Number(value.toFixed(digits));
const format = (value: number, digits = 1) => new Intl.NumberFormat("es-EC", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
const labelDate = (date: string) => new Intl.DateTimeFormat("es-EC", { day: "2-digit", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));

function inferMetric(question: string): BiMetric {
  if (/consumible|diesel|diésel|aditivo|bentonita|xantica|xántica|water control/.test(question)) return "consumables";
  if (/energia mecanica|energía mecánica|\bmse\b/.test(question)) return "mse";
  if (/programad|planificad|meta diaria|cumplimiento/.test(question)) return "planned";
  if (/tiempo perdido|\bnpt\b|no productiv|causas?/.test(question)) return "npt";
  if (/recuperacion|recovery/.test(question)) return "recovery";
  if (/presion|pressure/.test(question)) return "pressure";
  if (/torque/.test(question)) return "torque";
  if (/\brpm\b|revoluciones/.test(question)) return "rpm";
  if (/utilizacion|utilization|horas efectivas/.test(question)) return "utilization";
  // Completion questions can mention the current "rendimiento". Resolve their
  // intent before the generic ROP vocabulary so the suggested ETA prompt does
  // not get classified as a speed trend.
  if (/termin|\beta\b|fecha estimada|restante/.test(question)) return "eta";
  if (/\brop\b|velocidad|rendimiento/.test(question)) return "rop";
  if (/corona|broca|bit |costo por metro|usd\/m/.test(question)) return "crowns";
  if (/profundidad actual|objetivo|depth/.test(question)) return "depth";
  if (/metro|avance|perforado|pie|pies|\bft\b/.test(question)) return "metres";
  return "summary";
}

function inferChartType(question: string): BiChartType | null {
  if (/3d|tres dimensiones|tridimensional/.test(question)) return "bar3d";
  if (/dona|donut|torta|pastel|pie chart/.test(question)) return "doughnut";
  if (/dispersion|scatter/.test(question)) return "scatter";
  if (/\barea\b/.test(question)) return "area";
  if (/linea|lineal|line chart/.test(question)) return "line";
  if (/barra|columna|bar chart/.test(question)) return "bar";
  return null;
}

function inferUnits(question: string): BiUnitSystem {
  return /\bpie\b|\bpies\b|\bft\b|imperial/.test(question) ? "imperial" : "metric";
}

export function inferBiQuery(question: string): BiQueryRequest {
  const normalized = normalize(question);
  return { metric: inferMetric(normalized), chartType: inferChartType(normalized), units: inferUnits(normalized) };
}

function temporalChart(snapshot: OperationalSnapshot, metric: "metres" | "rop" | "utilization", request: BiQueryRequest): BiChartSpec {
  const imperial = request.units === "imperial";
  const config = {
    metres: { title: "Avance diario", unit: imperial ? "ft" : "m", values: snapshot.daily.map((item) => item.metres * (imperial ? METRES_TO_FEET : 1)), name: "Avance" },
    rop: { title: "ROP diario", unit: imperial ? "ft/h" : "m/h", values: snapshot.daily.map((item) => item.rop * (imperial ? METRES_TO_FEET : 1)), name: "ROP" },
    utilization: { title: "Utilización diaria", unit: "%", values: snapshot.daily.map((item) => item.utilization), name: "Utilización" },
  }[metric];
  return {
    type: request.chartType ?? (metric === "metres" ? "bar" : "line"),
    title: config.title,
    subtitle: `Periodo ${snapshot.period.label} · fuente ${snapshot.source === "database" ? "SQL" : "demo validado"}`,
    xAxisLabel: "Fecha",
    yAxisLabel: config.unit,
    unit: config.unit,
    categories: snapshot.daily.map((item) => labelDate(item.date)),
    series: [{ name: config.name, data: config.values.map((value) => round(value, 2)), color: COLORS[0] }],
  };
}

function depthChart(snapshot: OperationalSnapshot, request: BiQueryRequest): BiChartSpec {
  const imperial = request.units === "imperial";
  const current = snapshot.kpis.currentDepth * (imperial ? METRES_TO_FEET : 1);
  const remaining = snapshot.kpis.remaining * (imperial ? METRES_TO_FEET : 1);
  const unit = imperial ? "ft" : "m";
  return {
    type: request.chartType ?? "bar3d",
    title: `Avance de ${snapshot.hole?.code ?? "sondeo"}`,
    subtitle: `${format(snapshot.kpis.completionPct, 1)}% completado`,
    xAxisLabel: "Estado",
    yAxisLabel: unit,
    unit,
    categories: ["Perforado", "Restante"],
    series: [{ name: "Profundidad", data: [round(current, 1), round(remaining, 1)], color: COLORS[0] }],
  };
}

function nptChart(snapshot: OperationalSnapshot, request: BiQueryRequest): BiChartSpec {
  return {
    type: request.chartType ?? "bar",
    title: "Pareto de tiempo no productivo",
    subtitle: `${format(snapshot.nptTotal, 1)} h acumuladas · ${snapshot.period.label}`,
    xAxisLabel: "Causa",
    yAxisLabel: "Horas",
    unit: "h",
    categories: snapshot.npt.map((item) => item.cause),
    series: [{ name: "NPT", data: snapshot.npt.map((item) => item.hours), color: COLORS[2] }],
  };
}

function plannedChart(snapshot: OperationalSnapshot, request: BiQueryRequest): BiChartSpec {
  const imperial = request.units === "imperial", factor = imperial ? METRES_TO_FEET : 1, unit = imperial ? "ft" : "m";
  const planned = (snapshot.hole?.plannedDailyMetres ?? safeDivide(snapshot.kpis.metres, snapshot.daily.length)) * factor;
  return { type: request.chartType ?? "bar", title: "Ejecutado vs programado", subtitle: `Meta diaria configurada · ${snapshot.period.label}`, xAxisLabel: "Fecha", yAxisLabel: unit, unit, categories: snapshot.daily.map((item) => labelDate(item.date)), series: [{ name: "Ejecutado", data: snapshot.daily.map((item) => round(item.metres * factor, 1)), color: COLORS[1] }, { name: "Programado", data: snapshot.daily.map(() => round(planned, 1)), color: COLORS[0] }] };
}

function consumablesChart(request: BiQueryRequest, rows: Array<{ month: string; cost: number }>): BiChartSpec {
  return { type: request.chartType ?? "bar", title: "Costo mensual de consumibles", subtitle: "Fuente histórica Raúl · diciembre 2022 a marzo 2023", xAxisLabel: "Mes", yAxisLabel: "USD", unit: "USD", categories: rows.map((row) => row.month), series: [{ name: "Costo", data: rows.map((row) => round(row.cost, 2)), color: COLORS[0] }] };
}

function mseChart(request: BiQueryRequest, intervals: Array<{ startDepth: number; endDepth: number; mse?: number }>): BiChartSpec {
  const sampled=intervals.filter((_,index)=>index%3===0||index===intervals.length-1), imperial=request.units==="imperial";
  return { type: request.chartType ?? "line", title: "Energía mecánica específica", subtitle: "Calculada con WOB, torque, RPM, ROP y diámetro del sondeo", xAxisLabel: imperial?"Profundidad (ft)":"Profundidad (m)", yAxisLabel:"MPa", unit:"MPa", categories:sampled.map((item)=>format(((item.startDepth+item.endDepth)/2)*(imperial?METRES_TO_FEET:1),0)),series:[{name:"MSE",data:sampled.map(item=>round(item.mse??0,1)),color:COLORS[5]}] };
}

function crownChart(snapshot: OperationalSnapshot, request: BiQueryRequest, crowns: Array<{ product: string; rop: number; cost: number }>): BiChartSpec {
  const imperial = request.units === "imperial";
  const unit = imperial ? "USD/ft" : "USD/m";
  return {
    type: request.chartType ?? "bar",
    title: "Costo histórico por corona",
    subtitle: "Comparación de productos compatibles con el tenant",
    xAxisLabel: "Corona",
    yAxisLabel: unit,
    unit,
    categories: crowns.map((crown) => crown.product),
    series: [{ name: "Costo", data: crowns.map((crown) => round(crown.cost / (imperial ? METRES_TO_FEET : 1), 2)), color: COLORS[1] }],
  };
}

function intervalChart(metric: "recovery" | "pressure" | "torque" | "rpm", request: BiQueryRequest, intervals: Array<{ startDepth: number; endDepth: number; recovery: number; pressure?: number; torque?: number; rpm?: number }>): BiChartSpec {
  const imperial = request.units === "imperial";
  const sampled = intervals.filter((_, index) => index % 3 === 0 || index === intervals.length - 1);
  const config = {
    recovery: { title: "Recuperación por profundidad", unit: "%", value: (item: typeof intervals[number]) => item.recovery },
    pressure: { title: "Presión por profundidad", unit: "bar", value: (item: typeof intervals[number]) => item.pressure ?? 0 },
    torque: { title: "Torque por profundidad", unit: "Nm", value: (item: typeof intervals[number]) => item.torque ?? 0 },
    rpm: { title: "RPM por profundidad", unit: "rpm", value: (item: typeof intervals[number]) => item.rpm ?? 0 },
  }[metric];
  return {
    type: request.chartType ?? "line",
    title: config.title,
    subtitle: `Intervalos cada 3 m · profundidad en ${imperial ? "pies" : "metros"}`,
    xAxisLabel: imperial ? "Profundidad (ft)" : "Profundidad (m)",
    yAxisLabel: config.unit,
    unit: config.unit,
    categories: sampled.map((item) => format(((item.startDepth + item.endDepth) / 2) * (imperial ? METRES_TO_FEET : 1), 0)),
    series: [{ name: config.title.split(" por")[0], data: sampled.map((item) => round(config.value(item), 2)), color: COLORS[1] }],
  };
}

export function executeBiQuery(snapshot: OperationalSnapshot, request: BiQueryRequest, context?: {
  crowns?: Array<{ product: string; rop: number; cost: number; available: number }>;
  intervals?: Array<{ startDepth: number; endDepth: number; recovery: number; pressure?: number; torque?: number; rpm?: number; mse?: number }>;
  monthlyConsumables?: Array<{ month: string; cost: number }>;
  consumableItems?: Array<{ item: string; cost: number }>;
}): BiAnswer {
  const imperial = request.units === "imperial";
  const lengthUnit = imperial ? "ft" : "m";
  const speedUnit = imperial ? "ft/h" : "m/h";
  const lengthFactor = imperial ? METRES_TO_FEET : 1;
  const links: BiAnswer["links"] = [{ label: "Abrir dashboard", href: "/dashboard" }];
  if (request.metric === "planned") {
    const target=(snapshot.hole?.plannedDailyMetres??safeDivide(snapshot.kpis.metres,snapshot.daily.length))*snapshot.daily.length,compliance=safeDivide(snapshot.kpis.metres,target)*100;
    return { answer:`Se ejecutaron ${format(snapshot.kpis.metres,1)} m frente a ${format(target,1)} m programados en ${snapshot.period.days} días: ${format(compliance,1)}% de cumplimiento.`,chart:plannedChart(snapshot,request),facts:[{label:"Meta diaria",value:`${format(snapshot.hole?.plannedDailyMetres??0,1)} m`},{label:"Cumplimiento",value:`${format(compliance,1)}%`}],links:[{label:"Abrir dashboard",href:"/dashboard"},{label:"Ver sondeo",href:"/sondeos"}],tool:"compare_planned_actual"};
  }
  if (request.metric === "consumables") {
    const monthly=context?.monthlyConsumables??[],items=context?.consumableItems??[],latest=monthly.at(-1),top=items.slice().sort((a,b)=>b.cost-a.cost)[0];
    return {answer:latest?`En ${latest.month} el costo de consumibles fue ${format(latest.cost,2)} USD.${top?` El principal rubro fue ${top.item} con ${format(top.cost,2)} USD.`:""}`:"No hay consumibles históricos disponibles.",chart:consumablesChart(request,monthly),facts:items.slice(0,3).map(item=>({label:item.item,value:`$${format(item.cost,2)}`})),links:[{label:"Ver consumibles",href:"/consumibles"}],tool:"get_consumables_history"};
  }
  if (request.metric === "mse") {
    const intervals=context?.intervals??[],values=intervals.flatMap(item=>item.mse&&item.mse>0?[item.mse]:[]),average=safeDivide(values.reduce((sum,value)=>sum+value,0),values.length);
    return {answer:values.length?`La MSE media calculada es ${format(average,1)} MPa sobre ${values.length} intervalos. Se presenta como indicador de eficiencia de perforación, no como litología inferida.`:"Faltan WOB, torque, RPM o ROP válidos para calcular MSE.",chart:mseChart(request,intervals),facts:values.length?[{label:"MSE mínima",value:`${format(Math.min(...values),1)} MPa`},{label:"MSE máxima",value:`${format(Math.max(...values),1)} MPa`}]:[],links:[{label:"Abrir Depth Intelligence",href:"/depth-intelligence"}],tool:"get_mse_by_depth"};
  }
  if (request.metric === "npt") {
    const top = snapshot.npt[0];
    return {
      answer: top ? `En el periodo se registraron ${format(snapshot.nptTotal, 1)} h de tiempo no productivo. La causa principal es ${top.cause.toLowerCase()} con ${format(top.hours, 1)} h (${format(top.sharePct, 1)}%).` : "No hay tiempo no productivo registrado en el periodo seleccionado.",
      chart: nptChart(snapshot, request),
      facts: snapshot.npt.slice(0, 3).map((item) => ({ label: item.cause, value: `${format(item.hours, 1)} h` })),
      links: [{ label: "Ver turnos", href: "/turnos" }, { label: "Abrir Depth Intelligence", href: "/depth-intelligence" }],
      tool: "get_npt_breakdown",
    };
  }
  if (request.metric === "eta") {
    const eta = snapshot.eta;
    return {
      answer: eta ? `Quedan ${format(snapshot.kpis.remaining * lengthFactor, 1)} ${lengthUnit}. Con un ROP de ${format(snapshot.kpis.rop * lengthFactor, 2)} ${speedUnit} y ${format(snapshot.kpis.utilization, 1)}% de utilización, la finalización estimada es ${new Intl.DateTimeFormat("es-EC", { dateStyle: "long", timeZone: "America/Guayaquil" }).format(new Date(eta.date))}.` : "No hay suficientes datos válidos para estimar la finalización.",
      chart: depthChart(snapshot, request),
      facts: [{ label: "Restante", value: `${format(snapshot.kpis.remaining * lengthFactor, 1)} ${lengthUnit}` }, { label: "Confianza", value: eta?.confidence === "medium" ? "Media" : "Baja" }],
      links: [{ label: "Ver sondeo", href: "/sondeos" }],
      tool: "estimate_completion",
    };
  }
  if (request.metric === "crowns") {
    const crowns = context?.crowns ?? [];
    const cheapest = crowns.slice().sort((a, b) => a.cost - b.cost)[0];
    const fastest = crowns.slice().sort((a, b) => b.rop - a.rop)[0];
    return {
      answer: cheapest && fastest ? `${cheapest.product} tiene el menor costo histórico (${format(cheapest.cost / (imperial ? METRES_TO_FEET : 1), 2)} ${imperial ? "USD/ft" : "USD/m"}); ${fastest.product} lidera en velocidad con ${format(fastest.rop * lengthFactor, 2)} ${speedUnit}.` : "No hay historial suficiente de coronas para esta empresa.",
      chart: crownChart(snapshot, request, crowns),
      facts: crowns.slice(0, 3).map((crown) => ({ label: crown.product, value: `${crown.available} disp.` })),
      links: [{ label: "Ver coronas", href: "/coronas" }, { label: "Abrir Bit Advisor", href: "/bit-advisor" }],
      tool: "compare_crowns",
    };
  }
  if (request.metric === "depth") {
    return {
      answer: `${snapshot.hole?.code ?? "El sondeo"} está en ${format(snapshot.kpis.currentDepth * lengthFactor, 1)} de ${format(snapshot.kpis.targetDepth * lengthFactor, 1)} ${lengthUnit}: ${format(snapshot.kpis.completionPct, 1)}% completado.`,
      chart: depthChart(snapshot, request),
      facts: [{ label: "Actual", value: `${format(snapshot.kpis.currentDepth * lengthFactor, 1)} ${lengthUnit}` }, { label: "Restante", value: `${format(snapshot.kpis.remaining * lengthFactor, 1)} ${lengthUnit}` }],
      links: [{ label: "Ver sondeo", href: "/sondeos" }],
      tool: "get_depth_progress",
    };
  }
  if (request.metric === "metres" || request.metric === "rop" || request.metric === "utilization") {
    const chart = temporalChart(snapshot, request.metric, request);
    const value = request.metric === "metres" ? snapshot.kpis.metres * lengthFactor : request.metric === "rop" ? snapshot.kpis.rop * lengthFactor : snapshot.kpis.utilization;
    const unit = request.metric === "metres" ? lengthUnit : request.metric === "rop" ? speedUnit : "%";
    const label = request.metric === "metres" ? "avance" : request.metric === "rop" ? "ROP ponderado" : "utilización";
    return {
      answer: `El ${label} del periodo ${snapshot.period.label} es ${format(value, request.metric === "metres" ? 1 : 2)} ${unit}. La gráfica usa los mismos turnos que el indicador, agrupados por día.`,
      chart,
      facts: [{ label: "Periodo", value: `${snapshot.period.days} días` }, { label: "Horas efectivas", value: `${format(snapshot.kpis.effectiveHours, 1)} h` }],
      links,
      tool: `get_${request.metric}_trend`,
    };
  }
  const intervalValues = (context?.intervals ?? []).flatMap((item) => {
    const value = request.metric === "recovery" ? item.recovery : request.metric === "pressure" ? item.pressure : request.metric === "torque" ? item.torque : request.metric === "rpm" ? item.rpm : undefined;
    return value == null ? [] : [value];
  });
  const intervalAverage = safeDivide(intervalValues.reduce((sum, value) => sum + value, 0), intervalValues.length);
  const metricConfig = {
    recovery: { label: "recuperación media", value: snapshot.depth.averageRecovery, unit: "%" },
    pressure: { label: "presión media", value: intervalAverage, unit: "bar" },
    torque: { label: "torque medio", value: intervalAverage, unit: "Nm" },
    rpm: { label: "RPM media", value: intervalAverage, unit: "rpm" },
  }[request.metric as "recovery" | "pressure" | "torque" | "rpm"];
  if (metricConfig) {
    return {
      answer: `${metricConfig.label[0].toUpperCase()}${metricConfig.label.slice(1)}: ${format(metricConfig.value, 1)} ${metricConfig.unit}.${request.metric === "pressure" && snapshot.anomaly ? ` En el tramo anómalo la presión cambió ${format(snapshot.anomaly.pressureChangePct, 1)}% frente a los cinco intervalos previos.` : ""}`,
      chart: intervalChart(request.metric as "recovery" | "pressure" | "torque" | "rpm", request, context?.intervals ?? []),
      facts: snapshot.anomaly ? [{ label: "Tramo anómalo", value: `${snapshot.anomaly.from}–${snapshot.anomaly.to} m` }] : [],
      links: [{ label: "Abrir Depth Intelligence", href: "/depth-intelligence" }],
      tool: `get_${request.metric}_by_depth`,
    };
  }
  const topNpt = snapshot.npt[0];
  return {
    answer: `${snapshot.hole?.code ?? "El sondeo"} está en ${format(snapshot.kpis.currentDepth, 1)} de ${format(snapshot.kpis.targetDepth, 1)} m. En los últimos ${snapshot.period.days} días avanzó ${format(snapshot.kpis.metres, 1)} m, con ROP ponderado de ${format(snapshot.kpis.rop, 2)} m/h y ${format(snapshot.kpis.utilization, 1)}% de utilización.${topNpt ? ` El NPT principal fue ${topNpt.cause.toLowerCase()} (${format(topNpt.hours, 1)} h).` : ""}`,
    chart: temporalChart(snapshot, "metres", { ...request, metric: "metres" }),
    facts: [{ label: "Costo operativo", value: `$${format(snapshot.kpis.operationalCostPerMetre, 1)}/m` }, { label: "Alertas", value: String(snapshot.alerts.length) }],
    links: [{ label: "Abrir dashboard", href: "/dashboard" }, { label: "Abrir Depth Intelligence", href: "/depth-intelligence" }],
    tool: "summarize_drillhole",
  };
}

export function chartTypeFromTool(value: unknown): BiChartType | null {
  return ["bar", "bar3d", "line", "area", "doughnut", "scatter"].includes(String(value)) ? value as BiChartType : null;
}

export function unitSystemFromTool(value: unknown): BiUnitSystem {
  return value === "imperial" ? "imperial" : "metric";
}

export function metricFromTool(value: unknown): BiMetric {
  const metrics: BiMetric[] = ["metres", "planned", "rop", "utilization", "npt", "depth", "recovery", "pressure", "torque", "rpm", "mse", "consumables", "crowns", "eta", "summary"];
  return metrics.includes(value as BiMetric) ? value as BiMetric : "summary";
}

export function pct(part: number, total: number) {
  return round(safeDivide(part, total) * 100, 1);
}
