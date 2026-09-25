/**
 * Liveness-Check der Web-App (Plattform-Healthcheck). Bewusst ohne DB-Zugriff, damit ein
 * DB-Ausfall den Container nicht als "tot" markiert. Detailstatus: /api/admin/health (Admin).
 * Feldnamen `ok`/`check` entsprechen der Hono-API (/health), damit Diagnosen beide verstehen.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const api = process.env.NEXT_PUBLIC_API_URL ?? "";
  return Response.json(
    {
      ok: true,
      status: "ok",
      check: "liveness",
      service: "grow-observer-web",
      dataMode: api ? (api.startsWith("/") ? "api-embedded" : "api-external") : "mock",
      time: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
