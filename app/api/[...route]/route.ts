import { handleApiRequest } from "@/server/embedded-api";

/**
 * Catch-all für die eingebettete Self-Host-API (apps/api) unter /api/*.
 * `/api/health` hat eine eigene, abhängigkeitsfreie Route (Plattform-Healthcheck).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handler(request: Request) {
  return handleApiRequest(request);
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
