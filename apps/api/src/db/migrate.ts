import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./client";

/** Führt generierte Drizzle-Migrationen aus (ordner: ./drizzle). */
async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✅ Migrationen ausgeführt");
  process.exit(0);
}

main().catch((e) => {
  console.error("❌ Migration fehlgeschlagen:", e);
  process.exit(1);
});
