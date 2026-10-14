import { operationalPool } from "@/lib/operational-db";
export async function GET() {
  try {
    await operationalPool().query("SELECT 1 FROM operational_sessions LIMIT 0");
    return Response.json({status:"ready"});
  } catch { return Response.json({status:"unavailable"},{status:503}); }
}
