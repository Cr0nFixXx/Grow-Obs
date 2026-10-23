import { describe, expect, it } from "vitest";
import { resolveJwtSecret } from "@/server/jwt-secret";

describe("resolveJwtSecret", () => {
  it("nutzt ein konfiguriertes Secret unverändert", () => {
    expect(resolveJwtSecret({ JWT_SECRET: "x".repeat(40), NODE_ENV: "production" })).toEqual({ ok: true, secret: "x".repeat(40), ephemeral: false });
  });
  it("verweigert den Start ohne Secret in Produktion", () => {
    const result = resolveJwtSecret({ NODE_ENV: "production" });
    expect(result.ok).toBe(false);
  });
  it("erlaubt ein temporäres Secret in Produktion nur mit explizitem Opt-out", () => {
    const result = resolveJwtSecret({ NODE_ENV: "production", ALLOW_EPHEMERAL_JWT_SECRET: "true" });
    expect(result).toMatchObject({ ok: true, ephemeral: true });
  });
  it("erzeugt in Entwicklung ein langes, zufälliges Secret", () => {
    const a = resolveJwtSecret({ NODE_ENV: "development" });
    const b = resolveJwtSecret({});
    expect(a.ok && a.ephemeral && a.secret.length >= 32).toBe(true);
    expect(a.ok && b.ok && a.secret !== b.secret).toBe(true);
  });
});
