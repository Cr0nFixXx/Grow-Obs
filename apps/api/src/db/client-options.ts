/**
 * postgres.js-Optionen je nach Pooler.
 * Transaction-Pooler (Supabase/Supavisor Port 6543, pgbouncer): Verbindungen werden pro Transaktion zugeteilt, daher
 * keine benannten Prepared Statements (`prepare: false`) und keine Startparameter. Viele Serverless-Instanzen
 * teilen sich dann wenige Datenbankverbindungen; `LISTEN/NOTIFY` und Sitzungseinstellungen gehen dort nicht
 * (Echtzeit läuft auf Vercel ohnehin per Polling, `SET LOCAL` in Transaktionen bleibt möglich).
 */
export function isTransactionPooler(databaseUrl: string): boolean {
  try { return new URL(databaseUrl).port === "6543"; } catch { return false; }
}

export function clientOptions(databaseUrl: string, max: number) {
  const pooled = isTransactionPooler(databaseUrl);
  return {
    max,
    connect_timeout: 5,
    idle_timeout: 10,
    // Eingefrorene Serverless-Instanzen halten sonst Pooler-Sitzungen fest (B-77).
    max_lifetime: 60 * 5,
    ...(pooled ? { prepare: false } : { connection: { statement_timeout: 10000, lock_timeout: 5000 } }),
  };
}
