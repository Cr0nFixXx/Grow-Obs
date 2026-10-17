import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { env } from "./env.ts";
import { client } from "./db/client.ts";
import { handleUpgrade, shutdownRealtime } from "./realtime/index.ts";

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`Grow|Observer API listening on port ${info.port}`);
});

// WebSocket-Echtzeit (B-59): Upgrades auf /realtime/ws; alles andere wird abgewiesen.
(server as unknown as import("node:http").Server).on("upgrade", (req, socket, head) => {
  if (!handleUpgrade(req, socket, head)) socket.destroy();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void shutdownRealtime();
    server.close(() => { void client.end({ timeout: 5 }).then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
