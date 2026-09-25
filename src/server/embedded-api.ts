import "server-only";
import path from "node:path";
import { randomBytes } from "node:crypto";

/**
 * Embedded-Modus (B-46): Die Self-Host-API aus `apps/api` läuft in Next.js unter `/api/*`.
 * Gleicher Code wie im Docker-Betrieb, nur ohne eigenen Port → same-origin, kein CORS.
 *
 * - Env: `DATABASE_URL` kommt aus `.env`; `JWT_SECRET` aus der Umgebung (z. B. `.env.local`).
 *   Fehlt es, wird ein zufälliges Prozess-Secret erzeugt (Sessions enden dann beim Neustart).
 * - Schema: Drizzle-Migrationen aus `apps/api/drizzle` laufen beim ersten Request (idempotent).
 * - Storage: ohne S3-Zugangsdaten sind Uploads deaktiviert (503), alles andere funktioniert.
 */
type FetchApp = { fetch: (request: Request) => Response | Promise<Response> };

let ready: Promise<FetchApp> | null = null;

function prepareEnvironment() {
  process.env.API_EMBEDDED = "true";
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = randomBytes(48).toString("base64url");
    console.warn(JSON.stringify({ event: "embedded_api_ephemeral_jwt_secret", hint: "JWT_SECRET in .env.local setzen, sonst enden Sessions beim Neustart" }));
  }
}

async function boot(): Promise<FetchApp> {
  prepareEnvironment();
  const [{ app }, { db }, { migrate }] = await Promise.all([
    import("../../apps/api/src/app.ts"),
    import("../../apps/api/src/db/client.ts"),
    import("drizzle-orm/postgres-js/migrator"),
  ]);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "apps/api/drizzle") });
  return app;
}

function getApp(): Promise<FetchApp> {
  if (!ready) {
    ready = boot().catch((error: unknown) => {
      ready = null; // nächster Request versucht es erneut (z. B. DB kurz nicht erreichbar)
      throw error;
    });
  }
  return ready;
}

/** Leitet `/api/<pfad>` an die Hono-App weiter (dort ohne `/api`-Präfix gemountet). */
export async function handleApiRequest(request: Request): Promise<Response> {
  let app: FetchApp;
  try {
    app = await getApp();
  } catch (error) {
    console.error(JSON.stringify({ event: "embedded_api_boot_failed", type: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return Response.json({ error: "Backend nicht verfügbar" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, "") || "/";
  const hasBody = !["GET", "HEAD"].includes(request.method);
  const forwarded = new Request(url, {
    method: request.method,
    headers: request.headers,
    // Body-Limit der API: 64 KB → puffern ist unkritisch und vermeidet Stream-Duplex-Sonderfälle.
    body: hasBody ? await request.arrayBuffer() : undefined,
  });
  return app.fetch(forwarded);
}
