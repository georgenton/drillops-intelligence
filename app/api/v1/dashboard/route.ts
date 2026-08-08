import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { assertTenantAccess } from "@/lib/tenant-guard";
import { buildOperationalSnapshot } from "@/packages/bi/analytics";
import { loadBiDataset } from "@/packages/bi/data-source";
import type { TenantId } from "@/packages/domain/types";

export async function GET(request:Request){
  const session=verifySession((await cookies()).get("drillops_session")?.value);if(!session)return NextResponse.json({error:"No autorizado"},{status:401});
  const params=new URL(request.url).searchParams;
  const tenantId=params.get("tenantId")??session.tenantId;
  try{assertTenantAccess(session,tenantId)}catch{return NextResponse.json({error:"Acceso de tenant denegado"},{status:403})}
  const dataset=await loadBiDataset(tenantId as TenantId);
  const snapshot=buildOperationalSnapshot(dataset,params.get("drillholeId")??undefined,Number(params.get("periodDays")??7));
  return NextResponse.json(snapshot);
}
