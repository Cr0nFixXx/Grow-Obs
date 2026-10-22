import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { env } from "../env.ts";

export const client = postgres(env.DATABASE_URL, {
  max: env.DB_POOL_MAX,
  connect_timeout: 5,
  idle_timeout: 10,
  // Leerlauf-Verbindungen früh freigeben: eingefrorene Serverless-Instanzen halten sonst Sitzungen im Pooler (Supabase Session-Modus) fest.
  max_lifetime: 60 * 5,
  connection: { statement_timeout: 10000, lock_timeout: 5000 },
});
export const db = drizzle(client, { schema });
