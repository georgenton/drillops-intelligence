import type { Crown, Drillhole, Interval, Rig, Shift, TenantId } from "@/packages/domain/types";

export interface SurveyPoint {
  depth: number;
  inclination: number;
  azimuth: number;
}

export interface BiDataset {
  tenantId: TenantId;
  drillholes: Drillhole[];
  rigs: Rig[];
  shifts: Shift[];
  intervals: Interval[];
  crowns: Crown[];
  survey: SurveyPoint[];
  source: "demo" | "database";
}

export interface DailyPerformance {
  date: string;
  metres: number;
  effectiveHours: number;
  totalHours: number;
  rop: number;
  utilization: number;
  nptHours: number;
}

export interface OperationalAlert {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  context: string;
}

export interface OperationalSnapshot {
  tenantId: TenantId;
  source: BiDataset["source"];
  generatedAt: string;
  period: { start: string; end: string; days: number; label: string };
  hole: Drillhole | null;
  kpis: {
    metres: number;
    effectiveHours: number;
    rop: number;
    utilization: number;
    operationalCostPerMetre: number;
    currentDepth: number;
    targetDepth: number;
    remaining: number;
    completionPct: number;
    advance24h: number;
  };
  daily: DailyPerformance[];
  npt: { cause: string; hours: number; sharePct: number }[];
  nptTotal: number;
  eta: { date: string; effectiveHours: number; calendarHours: number; confidence: "low" | "medium" | "high" } | null;
  depth: {
    rangeMetres: number;
    weightedRop: number;
    averageRecovery: number;
    anomalyCount: number;
    crownRuns: number;
  };
  anomaly: {
    from: number;
    to: number;
    ropChangePct: number;
    pressureChangePct: number;
    hardness: number;
    fracturing: string;
  } | null;
  activeCrown: {
    code: string;
    product: string;
    runMetres: number;
    historicalLife: number;
    lifeUsedPct: number;
    historicalRop: number;
    historicalCost: number;
    available: number;
  } | null;
  alerts: OperationalAlert[];
  hardnessRopChangePct: number;
}

export type BiMetric = "metres" | "rop" | "utilization" | "npt" | "depth" | "recovery" | "pressure" | "torque" | "rpm" | "crowns" | "eta" | "summary";
export type BiChartType = "bar" | "bar3d" | "line" | "area" | "doughnut" | "scatter";
export type BiUnitSystem = "metric" | "imperial";

export interface BiQueryRequest {
  metric: BiMetric;
  chartType: BiChartType | null;
  units: BiUnitSystem;
}

export interface BiChartSeries {
  name: string;
  data: number[] | Array<[number, number]>;
  color?: string;
}

export interface BiChartSpec {
  type: BiChartType;
  title: string;
  subtitle: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  unit: string;
  categories?: string[];
  series: BiChartSeries[];
}

export interface BiAnswer {
  answer: string;
  chart: BiChartSpec | null;
  facts: Array<{ label: string; value: string }>;
  links: Array<{ label: string; href: string }>;
  tool: string;
}
