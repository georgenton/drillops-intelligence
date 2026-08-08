import { crowns, drillholes, intervals, rigs, shifts, survey, tenantData } from "@/lib/demo-data";
import type { BiDataset } from "@/packages/bi/types";
import type { TenantId } from "@/packages/domain/types";

export function getDemoBiDataset(tenantId: TenantId): BiDataset {
  return {
    tenantId,
    drillholes: tenantData(drillholes, tenantId),
    rigs: tenantData(rigs, tenantId),
    shifts: tenantData(shifts, tenantId),
    intervals: tenantData(intervals, tenantId),
    crowns: tenantData(crowns, tenantId),
    survey: tenantId === "extract" ? survey : [],
    source: "demo",
  };
}
