import { afterEach, describe, expect, it, vi } from "vitest";

/** `config` liest die Umgebung beim Import (Next ersetzt die Werte zur Build-Zeit) → Modul je Test neu laden. */
async function load(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value as string);
  return (await import("@/lib/config")).config;
}

describe("config.realtimeMode (Serverless-Schalter)", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

  it("Standard ist auto (WebSocket → SSE → Polling)", async () => {
    expect((await load({ NEXT_PUBLIC_REALTIME: "" })).realtimeMode).toBe("auto");
  });
  it("NEXT_PUBLIC_REALTIME=polling erzwingt reines Polling", async () => {
    expect((await load({ NEXT_PUBLIC_REALTIME: "polling" })).realtimeMode).toBe("polling");
  });
  it("unbekannte Werte fallen auf auto zurück", async () => {
    expect((await load({ NEXT_PUBLIC_REALTIME: "sse" })).realtimeMode).toBe("auto");
  });
});
