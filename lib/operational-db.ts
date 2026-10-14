import { Pool, type PoolClient } from "pg";
let pool: Pool | undefined;
export function operationalPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_UNAVAILABLE");
  return pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
}
export async function tenantTransaction<T>(tenantId: string, work: (client: PoolClient) => Promise<T>) {
  const client = await operationalPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
