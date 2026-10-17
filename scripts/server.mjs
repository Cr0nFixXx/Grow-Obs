#!/usr/bin/env node
/**
 * Produktions-Server mit WebSocket-Unterstützung (B-59) – ersetzt `next start`.
 *
 *   node scripts/server.mjs [-p 3000] [-H 0.0.0.0]
 *
 * Next.js-Route-Handler können keine HTTP-Upgrades annehmen. Dieser dünne Server startet Next im selben Prozess
 * und leitet Upgrades auf `/api/realtime/ws` an den Echtzeit-Hub der eingebetteten API weiter (der Hub meldet seinen
 * Handler beim ersten API-Aufruf unter `globalThis.__growRealtimeUpgrade` an). Alles andere verhält sich wie `next start`.
 * Ohne diesen Server (z. B. Serverless-Hosting) fällt der Client automatisch auf Server-Sent Events zurück.
 */
import { createServer } from "node:http";
import next from "next";

const args = process.argv.slice(2);
const arg = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
const port = Number(arg("-p", process.env.PORT ?? "3000"));
const hostname = arg("-H", process.env.HOSTNAME && process.env.HOSTNAME !== "localhost" ? process.env.HOSTNAME : "0.0.0.0");

const app = next({ dev: false, hostname, port });
await app.prepare();
// Next hängt beim ersten Request einen eigenen `upgrade`-Listener an `req.socket.server` (für HMR), der fremde Upgrades
// sofort beendet – das würde unsere WebSockets kappen. Wir leiten Upgrades selbst weiter (siehe unten).
app.didWebSocketSetup = true;
const handle = app.getRequestHandler();
const nextUpgrade = app.getUpgradeHandler();

/** Weckt die eingebettete API (ein unauthentifizierter Aufruf genügt, Antwort 401). */
const warmUp = () => fetch(`http://127.0.0.1:${port}/api/realtime/stream`).catch(() => undefined);

/** Fehlerhafte Prozent-Kodierung (`/%E0%A4%A`) lässt Next mit 500 abbrechen → sauber mit 400 ablehnen. */
const malformedPath = (url = "/") => { try { decodeURIComponent(url.split("?")[0] ?? ""); return false; } catch { return true; } };
const server = createServer((req, res) => {
  if (malformedPath(req.url)) { res.writeHead(400, { "content-type": "text/plain; charset=utf-8" }).end("Ungültige Adresse"); return; }
  void handle(req, res);
});
const onUpgrade = (req, socket, head) => {
  const handler = globalThis.__growRealtimeUpgrade;
  let pathname = "";
  try { pathname = new URL(req.url ?? "/", "http://localhost").pathname; } catch { /* unten abgelehnt */ }
  if (pathname.endsWith("/realtime/ws")) {
    if (typeof handler === "function" && handler(req, socket, head)) return;
    // Die API startet beim ersten Aufruf (Migrationen, Hub) → einmal anstoßen, dann erneut versuchen.
    void warmUp().then(() => {
      const retry = globalThis.__growRealtimeUpgrade;
      if (typeof retry === "function" && retry(req, socket, head)) return;
      socket.destroy();
    });
    return;
  }
  try { nextUpgrade(req, socket, head); } catch { socket.destroy(); }
};
server.on("upgrade", onUpgrade);
// Sicherheitsnetz: fremde Upgrade-Listener (andere Next-Versionen) entfernen, damit nur `onUpgrade` entscheidet.
server.on("request", () => { for (const listener of server.listeners("upgrade")) if (listener !== onUpgrade) server.removeListener("upgrade", listener); });
server.listen(port, hostname, () => {
  console.log(`▲ Grow|Observer-Server auf http://${hostname}:${port} (HTTP + WebSocket)`);
  void warmUp();
});
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); });
