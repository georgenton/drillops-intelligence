import { createHash } from "node:crypto";
import { operationalPool } from "./operational-db";
import { readOperation } from "./operational-store";
import { readCatalog } from "./operational-catalog";
import { canAccessSection } from "./access-control";
import type { PrivateSession } from "./private-auth";
import { buildReviewScenario } from "@/packages/domain/review-scenario";

/** Tenant opt-in, staging only. Never a database-failure fallback. */
export async function readReviewScenario(session:PrivateSession) {
  if(process.env.DRILLOPS_ENV!=="staging"||session.demo)return null;
  if(!["operational_reviewer","general_manager","operations_supervisor","platform_admin"].includes(session.role))return null;
  if(!canAccessSection({...session,section:"operacion"}))return null;
  const enabled=await operationalPool().query(
    "SELECT settings->>'reviewScenarioId' AS id FROM tenants WHERE id=$1 AND active=true",[session.tenantId]);
  if(enabled.rows[0]?.id!=="REVISION_RAUL_2026_10_V1")return null;
  const [data,catalog]=await Promise.all([
    readOperation(session.tenantId,{from:"2026-05-01",to:"2026-05-31"}),readCatalog(session),
  ]);
  // The scenario receives only fields this membership may consult.
  data.decisions=[];data.quickRecords=[];
  if(!canAccessSection({...session,section:"coronas"})){data.crowns=[];data.shifts=data.shifts.map(s=>({...s,crowns:[]}));}
  data.reports=data.reports.map(r=>({...r,
    survey:canAccessSection({...session,section:"survey"})?r.survey:[],
    consumptions:canAccessSection({...session,section:"consumibles"})?r.consumptions:[],
    materials:canAccessSection({...session,section:"consumibles"})?r.materials:[],
  }));
  const scenario=buildReviewScenario(data,catalog);
  return {...scenario,sourceVersion:createHash("sha256").update(JSON.stringify({revision:scenario.revision,shifts:data.shifts,reports:data.reports,catalog})).digest("hex")};
}
