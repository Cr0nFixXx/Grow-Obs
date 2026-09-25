import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { env } from "../env.ts";

export const client = postgres(env.DATABASE_URL, {
  max: 10,
  connect_timeout: 5,
  idle_timeout: 20,
  connection: { statement_timeout: 10000, lock_timeout: 5000 },
});
export const db = drizzle(client, { schema });
