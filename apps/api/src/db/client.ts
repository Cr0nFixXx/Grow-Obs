import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { env } from "../env.ts";
import { clientOptions } from "./client-options.ts";

export const client = postgres(env.DATABASE_URL, clientOptions(env.DATABASE_URL, env.DB_POOL_MAX));
export const db = drizzle(client, { schema });
