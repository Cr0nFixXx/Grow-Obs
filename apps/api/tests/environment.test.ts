import { describe, expect, it } from "vitest";
import { environmentSchema } from "../src/config/environment.ts";

const base = {
  DATABASE_URL: "postgres://test:test@localhost:5432/example_test",
  JWT_SECRET: "generated-test-secret-with-at-least-32-characters",
  S3_ACCESS_KEY: "test",
  S3_SECRET_KEY: "test-secret",
};
describe("deployment environment", () => {
  it("rejects weak/example JWT secrets", () => {
    expect(environmentSchema.safeParse({ ...base, JWT_SECRET: "short" }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...base, JWT_SECRET: "please-change-me-to-a-long-random-string" }).success).toBe(false);
  });
  it("requires HTTPS and explicit origins in production", () => {
    expect(environmentSchema.safeParse({ ...base, NODE_ENV: "production" }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...base, CORS_ORIGINS: "*" }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...base, NODE_ENV: "production", CORS_ORIGINS: "https://app.example.test", S3_PUBLIC_ENDPOINT: "https://media.example.test" }).success).toBe(true);
  });
  it("allows the same-origin embedded mode without storage, but not a storage-less standalone API", () => {
    const { S3_ACCESS_KEY: _a, S3_SECRET_KEY: _s, ...noStorage } = base;
    expect(environmentSchema.safeParse(noStorage).success).toBe(false);
    expect(environmentSchema.safeParse({ ...noStorage, API_EMBEDDED: "true", NODE_ENV: "production" }).success).toBe(true);
    // Mit Storage gilt auch embedded weiterhin HTTPS für signierte Uploads.
    expect(environmentSchema.safeParse({ ...base, API_EMBEDDED: "true", NODE_ENV: "production" }).success).toBe(false);
  });
  it("keeps internal storage and browser signing origins separate", () => {
    const parsed = environmentSchema.parse({ ...base, S3_ENDPOINT: "http://minio:9000", S3_PUBLIC_ENDPOINT: "https://media.example.test" });
    expect(parsed.S3_ENDPOINT).not.toBe(parsed.S3_PUBLIC_ENDPOINT);
    expect(parsed.ALLOW_DEMO_SEED).toBe("false");
  });
});
describe("Web-Push-Konfiguration (VAPID)", () => {
  const vapid = { VAPID_PUBLIC_KEY: `B${"a".repeat(86)}`, VAPID_PRIVATE_KEY: "b".repeat(43), VAPID_SUBJECT: "mailto:betreiber@example.test" };
  it("ist optional: ohne Werte ist Push aus, alle drei zusammen sind gültig", () => {
    expect(environmentSchema.safeParse(base).success).toBe(true);
    expect(environmentSchema.safeParse({ ...base, ...vapid }).success).toBe(true);
    expect(environmentSchema.safeParse({ ...base, ...vapid, VAPID_SUBJECT: "https://app.example.test" }).success).toBe(true);
  });
  it("lehnt Teilkonfiguration und Fehlformate ab", () => {
    expect(environmentSchema.safeParse({ ...base, VAPID_PUBLIC_KEY: vapid.VAPID_PUBLIC_KEY }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...base, ...vapid, VAPID_SUBJECT: "betreiber@example.test" }).success).toBe(false);
    expect(environmentSchema.safeParse({ ...base, ...vapid, VAPID_PRIVATE_KEY: "zu kurz!" }).success).toBe(false);
  });
});
