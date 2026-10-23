import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { Hono } from "hono";
import { app } from "../../apps/api/src/app.ts";
import { sql } from "drizzle-orm";
import { client, db } from "../../apps/api/src/db/client.ts";
import { afterAll } from "vitest";
import { clientIp, consume, emailKey, hit, rateLimit, resetRateLimits } from "../../apps/api/src/middleware/rate-limit.ts";

beforeAll(async () => { await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../apps/api/drizzle", import.meta.url)) }); });
beforeEach(async () => { await resetRateLimits(); delete process.env.RATE_LIMIT_DISABLED; delete process.env.TRUST_PROXY; });
afterAll(async () => { await client.end({ timeout: 5 }); });

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}

describe("rate limiter (unit)", () => {
  it("lässt `limit` Treffer durch und blockt danach bis zum Fensterende", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) expect(hit("k", 3, 60_000, t0 + i).ok).toBe(true);
    const blocked = hit("k", 3, 60_000, t0 + 10);
    expect(blocked).toMatchObject({ ok: false });
    expect(blocked.ok === false && blocked.retryAfter).toBeGreaterThan(0);
    expect(hit("k", 3, 60_000, t0 + 60_001).ok).toBe(true); // neues Fenster
  });

  it("zählt Schlüssel getrennt", () => {
    expect(hit("a", 1, 1000, 0).ok).toBe(true);
    expect(hit("b", 1, 1000, 0).ok).toBe(true);
    expect(hit("a", 1, 1000, 1).ok).toBe(false);
  });
});

describe("rate limiter (Middleware)", () => {
  function mini() {
    const mini = new Hono();
    mini.post("/x", rateLimit({ name: "t", limit: 2, windowMs: 60_000, keys: emailKey }), async (c) => c.json({ ok: true, body: await c.req.json() }));
    return mini;
  }
  const call = (m: Hono, email: string, ip: string) => m.request("/x", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email }) });

  it("antwortet 429 mit Retry-After und lässt den Handler den Body weiterhin lesen", async () => {
    const m = mini();
    const first = await call(m, "a@example.test", "1.1.1.1");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ body: { email: "a@example.test" } });
    expect((await call(m, "a@example.test", "1.1.1.1")).status).toBe(200);
    const blocked = await call(m, "a@example.test", "1.1.1.1");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("limitiert pro E-Mail auch bei wechselnden IPs (Brute-Force über Proxy-Pool)", async () => {
    const m = mini();
    expect((await call(m, "victim@example.test", "1.1.1.1")).status).toBe(200);
    expect((await call(m, "VICTIM@example.test", "2.2.2.2")).status).toBe(200);
    expect((await call(m, "victim@example.test", "3.3.3.3")).status).toBe(429);
    expect((await call(m, "other@example.test", "4.4.4.4")).status).toBe(200);
  });

  it("nutzt den letzten X-Forwarded-For-Eintrag (nicht den vom Client gesetzten ersten)", async () => {
    const m = mini();
    // Angreifer rotiert den ersten Eintrag, der Proxy hängt immer dieselbe echte IP an.
    expect((await call(m, "a1@example.test", "9.9.9.1, 5.5.5.5")).status).toBe(200);
    expect((await call(m, "a2@example.test", "9.9.9.2, 5.5.5.5")).status).toBe(200);
    expect((await call(m, "a3@example.test", "9.9.9.3, 5.5.5.5")).status).toBe(429);
  });

  it("TRUST_PROXY=false ignoriert Forwarded-Header; RATE_LIMIT_DISABLED schaltet ab", async () => {
    process.env.TRUST_PROXY = "false";
    const ctx = { req: { header: () => "6.6.6.6" } } as never;
    expect(clientIp(ctx)).toBe("unknown");
    process.env.RATE_LIMIT_DISABLED = "true";
    const m = mini();
    for (let i = 0; i < 5; i++) expect((await call(m, "a@example.test", "1.1.1.1")).status).toBe(200);
  });
});

describe("rate limiter an der echten API", () => {
  it("sperrt Login-Brute-Force nach 10 Fehlversuchen (429) – 401 davor", async () => {
    const ip = { "x-forwarded-for": "7.7.7.7" };
    for (let i = 0; i < 10; i++) {
      expect((await post("/auth/login", { email: "nobody@example.test", password: `wrong-${i}` }, ip)).status).toBe(401);
    }
    const blocked = await post("/auth/login", { email: "nobody@example.test", password: "wrong-11" }, ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
    expect(await blocked.json()).toMatchObject({ error: expect.stringContaining("Zu viele Anfragen") });
  });

  it("limitiert Registrierungen pro IP (10/Stunde); ungültige Daten zählen mit", async () => {
    const ip = { "x-forwarded-for": "8.8.8.8" };
    for (let i = 0; i < 10; i++) expect((await post("/auth/register", { name: "x" }, ip)).status).toBe(400);
    expect((await post("/auth/register", { name: "x" }, ip)).status).toBe(429);
    // andere IP bleibt unberührt
    expect((await post("/auth/register", { name: "x" }, { "x-forwarded-for": "8.8.4.4" })).status).toBe(400);
  });
});

describe("gemeinsamer Zähler in PostgreSQL (B-60)", () => {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it("zählt atomar: 25 parallele Treffer bei Limit 10 → genau 10 erlaubt", async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => consume(["burst"], 10, 60_000)));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
    const blocked = results.find((r) => !r.ok);
    expect(blocked && !blocked.ok && blocked.retryAfter).toBeGreaterThanOrEqual(1);
    expect(blocked && !blocked.ok && blocked.retryAfter).toBeLessThanOrEqual(60);
  });

  it("gilt über Instanzen hinweg: zwei getrennte Modulinstanzen (eigener Speicher und eigene Verbindung) teilen den Zähler", async () => {
    vi.resetModules();
    const other = await import("../../apps/api/src/middleware/rate-limit.ts");
    const otherDb = await import("../../apps/api/src/db/client.ts");
    try {
      expect(await consume(["shared"], 2, 60_000)).toMatchObject({ ok: true });
      expect(await other.consume(["shared"], 2, 60_000)).toMatchObject({ ok: true });
      expect(await consume(["shared"], 2, 60_000)).toMatchObject({ ok: false });
      expect(await other.consume(["shared"], 2, 60_000)).toMatchObject({ ok: false });
    } finally {
      await otherDb.client.end({ timeout: 5 });
    }
  });

  it("neues Fenster nach Ablauf (Datenbankzeit)", async () => {
    expect(await consume(["win"], 1, 300)).toMatchObject({ ok: true });
    expect(await consume(["win"], 1, 300)).toMatchObject({ ok: false });
    await sleep(450);
    expect(await consume(["win"], 1, 300)).toMatchObject({ ok: true });
  });

  it("zählt alle Schlüssel, auch wenn ein anderer schon blockiert", async () => {
    expect(await consume(["ip:1", "email:x"], 1, 60_000)).toMatchObject({ ok: true });
    expect(await consume(["ip:2", "email:x"], 1, 60_000)).toMatchObject({ ok: false });
    // ip:2 wurde trotzdem gezählt → der zweite Versuch mit ip:2 allein ist blockiert
    expect(await consume(["ip:2"], 1, 60_000)).toMatchObject({ ok: false });
  });

  it("speichert nur Hashes, keine Klartext-E-Mail oder IP", async () => {
    await consume(["login:email:person@example.test", "login:ip:203.0.113.9"], 5, 60_000);
    const rows = await db.execute<{ key: string }>(sql`SELECT key FROM rate_limits`);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fällt bei Datenbankausfall auf den Prozess-Zähler zurück (Limit gilt weiter, keine 500)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const spy = vi.spyOn(db, "execute").mockRejectedValue(new Error("db down"));
    try {
      expect(await consume(["fallback"], 2, 60_000)).toMatchObject({ ok: true });
      expect(await consume(["fallback"], 2, 60_000)).toMatchObject({ ok: true });
      expect(await consume(["fallback"], 2, 60_000)).toMatchObject({ ok: false });
    } finally { spy.mockRestore(); warn.mockRestore(); }
  });

  it("räumt abgelaufene Zeilen auf (beim ersten Treffer einer Instanz)", async () => {
    await db.execute(sql`INSERT INTO rate_limits (key, count, reset_at) VALUES ('stale', 3, now() - interval '10 minutes')`);
    vi.resetModules();
    const fresh = await import("../../apps/api/src/middleware/rate-limit.ts");
    const freshDb = await import("../../apps/api/src/db/client.ts");
    try {
      await fresh.consume(["sweeper"], 5, 60_000);
      await sleep(200);
      const rows = await db.execute<{ key: string }>(sql`SELECT key FROM rate_limits WHERE key = 'stale'`);
      expect(rows).toHaveLength(0);
    } finally { await freshDb.client.end({ timeout: 5 }); }
  });

  it("die API-Limits laufen über die Tabelle (Login-Sperre sichtbar in rate_limits)", async () => {
    await post("/auth/login", { email: "nobody@example.test", password: "wrong-password" }, { "x-forwarded-for": "7.7.7.7" });
    const rows = await db.execute<{ count: number }>(sql`SELECT count FROM rate_limits`);
    expect(rows.length).toBeGreaterThanOrEqual(2); // IP + E-Mail
  });
});
