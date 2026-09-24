import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { z } from "zod";
import { corsOrigins, env } from "./env";
import { auth } from "./routes/auth";
import { growsApi } from "./routes/grows";
import { forum } from "./routes/forum";
import { social } from "./routes/social";
import { chat } from "./routes/chat";
import { notificationsApi } from "./routes/notifications";
import { activity, breedersApi, hall, offersApi, products, strainsApi, wiki } from "./routes/catalog";
import { admin } from "./routes/admin";
import { communitiesApi } from "./routes/communities";
import { presignUpload } from "./lib/s3";

const app = new Hono();

app.use(logger());
app.use("*", cors({ origin: corsOrigins }));

app.get("/health", (c) => c.json({ ok: true, ts: new Date().toISOString() }));
app.route("/admin", admin);
app.route("/communities", communitiesApi);

// Kern-Ressourcen
app.route("/auth", auth);
app.route("/grows", growsApi);
app.route("/forum", forum);
app.route("/social", social);
app.route("/chat", chat);
app.route("/notifications", notificationsApi);

// Katalog (Read-only, Seed-basiert)
app.route("/products", products);
app.route("/offers", offersApi);
app.route("/breeders", breedersApi);
app.route("/strains", strainsApi);
app.route("/hall", hall);
app.route("/wiki", wiki);
app.route("/me/activity", activity);

// Presigned Upload für Grow-Fotos/Avatare (5 Min)
app.post("/upload/presign", async (c) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(await c.req.json().catch(() => ({})));
  if (!body.success) return c.json({ error: "Ungültige Daten" }, 400);
  const safe = body.data.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `uploads/${Date.now()}-${safe}`;
  const url = await presignUpload(key);
  return c.json({ url, key, publicUrl: `${env.S3_ENDPOINT}/${env.S3_BUCKET}/${key}` });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Interner Fehler" }, 500);
});
app.notFound((c) => c.json({ error: "Nicht gefunden" }, 404));

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`🌿 Grow|Observer API läuft auf http://localhost:${info.port}`);
});
