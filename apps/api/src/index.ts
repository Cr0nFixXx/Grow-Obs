import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./env.js";
import { client } from "./db/client.js";

const server = serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`Grow|Observer API listening on port ${info.port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => { void client.end({ timeout: 5 }).then(() => process.exit(0)); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
