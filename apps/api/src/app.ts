import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { corsOrigins } from "./env.ts";
import { requireAuth, type AuthEnv } from "./middleware/auth.ts";
import { auth } from "./routes/auth.ts";
import { growsApi } from "./routes/grows.ts";
import { forum } from "./routes/forum.ts";
import { social } from "./routes/social.ts";
import { chat } from "./routes/chat.ts";
import { notificationsApi } from "./routes/notifications.ts";
import { activity, breedersApi, hall, offersApi, products, strainsApi, wiki } from "./routes/catalog.ts";
import { admin } from "./routes/admin.ts";
import { communitiesApi } from "./routes/communities.ts";
import { tasksApi } from "./routes/tasks.ts";
import { mediaApi } from "./routes/media.ts";
import { adminFeaturesApi, featuresApi } from "./routes/features.ts";
import { requireFeature } from "./lib/features.ts";
import { adminReleasesApi, releasesApi } from "./routes/releases.ts";
import { presignUpload } from "./lib/s3.ts";

// Export without starting a port so integration tests can use app.request().
export const app = new Hono<AuthEnv>();
app.use("*", secureHeaders());
app.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Vary", "Authorization, Origin");
  await next();
});
app.use("*", cors({ origin: corsOrigins, allowHeaders: ["Content-Type", "Authorization"], allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));
const jsonLimit = bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "Anfrage zu gross" }, 413) });
// /media hat ein eigenes, größeres Limit (2 MB) direkt an der Route.
app.use("*", (c, next) => (c.req.method === "POST" && c.req.path === "/media" ? next() : jsonLimit(c, next)));

// Liveness only. Detailed dependency status requires a platform-admin session.
app.get("/health", (c) => c.json({ ok: true, check: "liveness", ts: new Date().toISOString() }));
// Deaktivierte Features serverseitig sperren (vor allen Fach-Routen).
app.use("*", requireFeature);
app.route("/features", featuresApi);
app.route("/admin/features", adminFeaturesApi);
app.route("/releases", releasesApi);
app.route("/admin/releases", adminReleasesApi);
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
app.route("/tasks", tasksApi);
app.route("/media", mediaApi);

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