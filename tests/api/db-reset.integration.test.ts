import { describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { client, db, resetDbConnection } from "../../apps/api/src/db/client.ts";

// B-79: Die Verbindung wird auf Serverless nach jeder Anfrage freigegeben bzw. bei einer hängenden Anfrage verworfen.
describe("DB-Verbindung freigeben (B-79)", () => {
  it("Abfragen funktionieren über client und db, auch nach dem Zurücksetzen", async () => {
    expect((await client`select 1 as n`)[0]?.n).toBe(1);
    await resetDbConnection();
    expect((await client`select 2 as n`)[0]?.n).toBe(2);
    const rows = await db.execute(sql`select 3 as n`);
    expect((rows as unknown as Array<{ n: number }>)[0]?.n).toBe(3);
    await resetDbConnection();
    expect(((await db.execute(sql`select 4 as n`)) as unknown as Array<{ n: number }>)[0]?.n).toBe(4);
  });

  it("hartes Zurücksetzen bricht eine hängende Abfrage ab, danach läuft alles wieder", async () => {
    const stuck = client`select pg_sleep(5)`.then(() => "done", () => "aborted");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const started = Date.now();
    await resetDbConnection({ force: true });
    expect(await stuck).toBe("aborted");
    expect(Date.now() - started).toBeLessThan(2000);
    expect((await client`select 5 as n`)[0]?.n).toBe(5);
  });

  it("Transaktionen laufen auf der aktuellen Verbindung", async () => {
    await resetDbConnection();
    const value = await db.transaction(async (tx) => ((await tx.execute(sql`select 6 as n`)) as unknown as Array<{ n: number }>)[0]?.n);
    expect(value).toBe(6);
  });
});
