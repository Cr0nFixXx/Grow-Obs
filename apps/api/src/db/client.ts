import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { env } from "../env.ts";

// Session-Pooler/Direktverbindung. Der Supabase-Transaction-Pooler (Port 6543) hat sich im Test als unbrauchbar erwiesen (B-77: Abfragen hingen).
export const client = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  connect_timeout: 5,
  idle_timeout: 10,
  // Eingefrorene Serverless-Instanzen halten sonst Pooler-Sitzungen fest (B-77).
  max_lifetime: 60 * 5,
  connection: { statement_timeout: 10000, lock_timeout: 5000 },
});
export const db = drizzle(client, { schema });
