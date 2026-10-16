import { afterAll, describe, expect, it } from "vitest";
import { app } from "../src/app.ts";
import { client } from "../src/db/client.ts";
import { BACKEND_VERSION, BUILD_NUMBER, moduleVersion } from "../src/version.generated.ts";

afterAll(async () => { await client.end({ timeout: 5 }); });

describe("Backend-Versionierung", () => {
  it("GET /version ist öffentlich und liefert Backend-Version + Build-Nummer (YYMMDDHH)", async () => {
    const response = await app.request("/version");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ component: "backend", version: BACKEND_VERSION, build: BUILD_NUMBER });
    expect(BUILD_NUMBER).toMatch(/^\d{8}$/);
    expect(BACKEND_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("Module erben die Backend-Version, solange kein eigener Eintrag existiert", () => {
    expect(moduleVersion("unbekanntes-modul")).toBe(BACKEND_VERSION);
  });
});
