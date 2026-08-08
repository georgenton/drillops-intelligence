import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";
import { intervals } from "@/lib/demo-data";
import { assertTenantAccess, scopeToTenant } from "@/lib/tenant-guard";

export async function GET(request:Request){const session=verifySession((await cookies()).get("drillops_session")?.value);if(!session)return NextResponse.json({error:"No autorizado"},{status:401});const p=new URL(request.url).searchParams,tenantId=p.get("tenantId")??session.tenantId,drillholeId=p.get("drillholeId"),min=Number(p.get("min")??0),max=Number(p.get("max")??10000);try{assertTenantAccess(session,tenantId)}catch{return NextResponse.json({error:"Acceso de tenant denegado"},{status:403})}const rows=scopeToTenant(intervals,tenantId).filter(i=>(!drillholeId||i.drillholeId===drillholeId)&&i.endDepth>=min&&i.startDepth<=max);return NextResponse.json({tenantId,count:rows.length,intervals:rows});}
