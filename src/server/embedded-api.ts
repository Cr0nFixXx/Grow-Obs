import "server-only";
import path from "node:path";
import { resolveJwtSecret } from "./jwt-secret";

/**
 * Embedded-Modus (B-46): Die Self-Host-API aus `apps/api` läuft in Next.js unter `/api/*`.
 * Gleicher Code wie im Docker-Betrieb, nur ohne eigenen Port → same-origin, kein CORS.
 *
 * - Env: `DATABASE_URL` kommt aus `.env`; `JWT_SECRET` aus der Umgebung (z. B. `.env.local`).
 *   Fehlt es: in Entwicklung zufälliges Prozess-Secret (Sessions enden beim Neustart),
 *   in Produktion Abbruch (503) – außer `ALLOW_EPHEMERAL_JWT_SECRET=true`.
 * - Schema: Drizzle-Migrationen aus `apps/api/drizzle` laufen beim ersten Request (idempotent).
 * - Storage: ohne S3-Zugangsdaten sind Uploads deaktiviert (503), alles andere funktioniert.
 */
type FetchApp = { fetch: (request: Request) => Response | Promise<Response> };

let ready: Promise<FetchApp> | null = null;

function prepareEnvironment() {
  process.env.API_EMBEDDED = "true";
  if (!process.env.JWT_SECRET) {
    const resolved = resolveJwtSecret(process.env);
    if (!resolved.ok) throw new Error(resolved.reason);
    process.env.JWT_SECRET = resolved.secret;
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
  // Auf Serverless startet jede Instanz neu: SKIP_MIGRATIONS=true spart den Migrationslauf (Schema vorher einmal migrieren).
  if (process.env.SKIP_MIGRATIONS !== "true") await migrate(db, { migrationsFolder: path.join(process.cwd(), "apps/api/drizzle") });
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
    // Treiber-Fehler verpacken die Ursache (`cause`, z. B. Pooler voll, Timeout) → Code und Text mitprotokollieren (ohne Zugangsdaten).
    const cause = error instanceof Error ? (error as Error & { cause?: { code?: string; message?: string } }).cause : undefined;
    console.error(JSON.stringify({
      event: "embedded_api_boot_failed",
      type: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      ...(cause ? { causeCode: cause.code ?? null, cause: String(cause.message ?? "").slice(0, 200) } : {}),
    }));
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
    // Abbruch durchreichen: beendet z. B. den SSE-Strom, wenn der Browser die Verbindung schließt.
    signal: request.signal,
  });
  // Nur auf Vercel (eingefrorene Instanzen); Self-Host/Docker behalten ihren dauerhaften Pool und LISTEN-Verbindungen.
  return process.env.VERCEL ? runWithDbGuard(app, forwarded) : app.fetch(forwarded);
}

// B-79: Serverless-Schutz. Ohne diese Klammer halten eingefrorene Instanzen ihre Pooler-Sitzung (Timer laufen nicht),
// bis der Session-Pooler voll ist und neue Anfragen minutenlang hängen.
const REQUEST_DEADLINE_MS = 12_000; // kürzer als das Client-Zeitlimit (15 s), damit eine klare Meldung ankommt
let inflight = 0;

async function runWithDbGuard(app: FetchApp, request: Request): Promise<Response> {
  const { resetDbConnection } = await import("../../apps/api/src/db/client.ts");
  inflight += 1;
  let counted = true;
  const leave = () => {
    if (!counted) return false;
    counted = false;
    inflight -= 1;
    return inflight === 0;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve(app.fetch(request));
  const deadline = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), REQUEST_DEADLINE_MS); });
  try {
    const result = await Promise.race([work, deadline]);
    if (result === "timeout") {
      console.error(JSON.stringify({ event: "api_request_deadline", path: new URL(request.url).pathname, ms: REQUEST_DEADLINE_MS }));
      void work.catch(() => undefined);
      leave();
      await resetDbConnection({ force: true }); // hängende Verbindung verwerfen
      return Response.json({ error: "Der Server ist gerade ausgelastet. Bitte gleich erneut versuchen.", code: "DB_TIMEOUT" }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } });
    }
    return result;
  } finally {
    clearTimeout(timer);
    // Letzte laufende Anfrage: Verbindung freigeben, bevor die Instanz eingefroren wird.
    if (leave()) await resetDbConnection().catch(() => undefined);
  }
}
