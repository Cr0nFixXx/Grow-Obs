import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import webpush from "web-push";
import { env } from "../../apps/api/src/env.ts";

/** Echte Bibliothek, kein Netzwerk: Die konfigurierten VAPID-Schlüssel werden akzeptiert und die Nutzlast wird für ein Browser-Abo verschlüsselt. */
describe("web-push Bibliothek mit den konfigurierten VAPID-Schlüsseln", () => {
  it("erzeugt eine signierte, verschlüsselte Anfrage an den Push-Dienst (ohne zu senden)", () => {
    const browser = createECDH("prime256v1"); browser.generateKeys();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: browser.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
    const payload = JSON.stringify({ title: "Neue Nachricht" });
    const req = webpush.generateRequestDetails(sub, payload, { TTL: 60, urgency: "high", topic: "go-chat", vapidDetails: { subject: env.VAPID_SUBJECT!, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! } });
    expect(req.endpoint).toBe(sub.endpoint);
    expect(req.method).toBe("POST");
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(req.headers.Authorization).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(Number(req.headers.TTL)).toBe(60);
    expect(req.headers.Urgency).toBe("high");
    expect(req.headers.Topic).toBe("go-chat");
    expect((req.body as Buffer).length).toBeGreaterThan(payload.length); // verschlüsselt, nicht Klartext
    expect((req.body as Buffer).toString("utf8")).not.toContain("Neue Nachricht");
  });
});
