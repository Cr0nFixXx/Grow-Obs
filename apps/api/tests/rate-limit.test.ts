import { beforeEach, describe, expect, it } from "vitest";
import { Hono } from "hono";
import { app } from "../src/app.ts";
import { client } from "../src/db/client.ts";
import { afterAll } from "vitest";
import { clientIp, emailKey, hit, rateLimit, resetRateLimits } from "../src/middleware/rate-limit.ts";

beforeEach(() => { resetRateLimits(); delete process.env.RATE_LIMIT_DISABLED; delete process.env.TRUST_PROXY; });
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
