import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { corsOrigins } from "./env.js";
import { requireAuth, type AuthEnv } from "./middleware/auth.js";
import { auth } from "./routes/auth.js";
import { growsApi } from "./routes/grows.js";
import { forum } from "./routes/forum.js";
import { social } from "./routes/social.js";
import { chat } from "./routes/chat.js";
import { notificationsApi } from "./routes/notifications.js";
import { activity, breedersApi, hall, offersApi, products, strainsApi, wiki } from "./routes/catalog.js";
import { admin } from "./routes/admin.js";
import { communitiesApi } from "./routes/communities.js";
import { presignUpload } from "./lib/s3.js";

// Export without starting a port so integration tests can use app.request().
export const app = new Hono<AuthEnv>();
app.use("*", secureHeaders());
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Authorization, Origin");
  await next();
});
app.use("*", cors({ origin: corsOrigins, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));
app.use("*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "Anfrage zu gross" }, 413) }));

// Liveness only. Detailed dependency status requires a platform-admin session.
app.get("/health", (c) => c.json({ ok: true, check: "liveness", ts: new Date().toISOString() }));
app.route("/auth", auth);
app.route("/grows", growsApi);
app.route("/forum", forum);
app.route("/social", social);
app.route("/chat", chat);
app.route("/notifications", notificationsApi);
app.route("/products", products);
app.route("/offers", offersApi);
app.route("/breeders", breedersApi);
app.route("/strains", strainsApi);
app.route("/hall", hall);
app.route("/wiki", wiki);
app.route("/me/activity", activity);
app.route("/admin", admin);
app.route("/communities", communitiesApi);

const uploadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  size: z.number().int().positive().max(8 * 1024 * 1024),
});
app.post("/upload/presign", requireAuth, async (c) => {
  const parsed = uploadSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "JPEG/PNG/WebP bis 8 MB; name, contentType und size erforderlich" }, 400);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[parsed.data.contentType];
  const key = `uploads/${c.get("userId")}/${randomUUID()}.${extension}`;
  const url = await presignUpload(key, parsed.data.contentType, parsed.data.size);
  // Objects remain private. Validation/scanning and attachment finalization are separate work.
  return c.json({ key, url, method: "PUT", headers: { "Content-Type": parsed.data.contentType }, expiresIn: 300 });
});

app.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status);
  const requestId = randomUUID();
  // No SQL, request bodies, credentials, invitation codes or signed URLs in logs.
  console.error(JSON.stringify({ event: "api_error", requestId, type: error.name }));
  return c.json({ error: "Interner Fehler", requestId }, 500);
});
app.notFound((c) => c.json({ error: "Nicht gefunden" }, 404));