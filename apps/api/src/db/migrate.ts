import { migrate } from "drizzle-orm/postgres-js/migrator";
import { client, db } from "./client.ts";

/** Führt generierte Drizzle-Migrationen aus (ordner: ./drizzle). */
async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrationen ausgefuehrt");
  await client.end();
}

main().catch(async (e) => {
  console.error("Migration fehlgeschlagen:", e instanceof Error ? e.name : "unknown");
  await client.end();
  process.exitCode = 1;
});
