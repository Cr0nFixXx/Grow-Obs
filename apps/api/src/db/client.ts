import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";
import { env } from "../env.ts";

// Session-Pooler/Direktverbindung. Der Supabase-Transaction-Pooler (Port 6543) hat sich im Test als unbrauchbar erwiesen (B-77: Abfragen hingen).
function createClient() {
  return postgres(env.DATABASE_URL, {
    max: env.DB_POOL_MAX,
    connect_timeout: 5,
    idle_timeout: 10,
    // Eingefrorene Serverless-Instanzen halten sonst Pooler-Sitzungen fest (B-77).
    max_lifetime: 60 * 5,
    connection: { statement_timeout: 10000, lock_timeout: 5000 },
  });
}

type Sql = ReturnType<typeof createClient>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

let currentClient: Sql = createClient();
let currentDb: Db = drizzle(currentClient, { schema });

/**
 * Verbindung verwerfen und beim nächsten Zugriff neu aufbauen (B-79).
 * Serverless: Eingefrorene Instanzen führen keine Timer aus (`idle_timeout`) und halten ihre Pooler-Sitzung,
 * bis der Pool leer ist. Deshalb gibt der Handler die Verbindung frei, sobald keine Anfrage mehr läuft –
 * oder wenn eine Anfrage hängt (`force`, Verbindung wird hart geschlossen).
 */
export async function resetDbConnection(options: { force?: boolean } = {}): Promise<void> {
  const old = currentClient;
  currentClient = createClient();
  currentDb = drizzle(currentClient, { schema });
  await old.end({ timeout: options.force ? 0 : 2 }).catch(() => undefined);
}

// Stabile Verweise für alle Importe; zeigen immer auf die aktuelle Verbindung (Funktionen werden bei jedem Aufruf neu aufgelöst).
function forward(getCurrent: () => object, prop: string | symbol): unknown {
  const value = Reflect.get(getCurrent(), prop, getCurrent()) as unknown;
  if (typeof value !== "function") return value;
  return (...args: unknown[]) => {
    const target = getCurrent();
    return (Reflect.get(target, prop, target) as (...a: unknown[]) => unknown).apply(target, args);
  };
}

export const client = new Proxy((() => undefined) as unknown as Sql, {
  apply: (_target, _this, args) => Reflect.apply(currentClient as unknown as (...a: unknown[]) => unknown, currentClient, args),
  get: (_target, prop) => forward(() => currentClient, prop),
});

export const db = new Proxy({} as Db, {
  get: (target, prop) => (Object.prototype.hasOwnProperty.call(target, prop) ? (Reflect.get(target, prop) as unknown) : forward(() => currentDb, prop)), // eigene Werte: Überschreibungen (Test-Spione)
  getOwnPropertyDescriptor: (target, prop) =>
    Reflect.getOwnPropertyDescriptor(target, prop) ?? (prop in currentDb ? { configurable: true, enumerable: true, writable: true, value: forward(() => currentDb, prop) } : undefined),
});
