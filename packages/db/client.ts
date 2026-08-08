import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? (process.env.NODE_ENV === "production" ? undefined : "postgresql://drillops:drillops@localhost:5447/drillops");
export const db = connectionString ? drizzle(new Pool({ connectionString, max:5 }), { schema }) : null;
