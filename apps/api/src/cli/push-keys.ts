import webpush from "web-push";

/** Erzeugt ein VAPID-Schlüsselpaar für Web-Push (B-63). Gibt nur aus, schreibt nichts; der private Schlüssel ist ein Geheimnis. */
const keys = webpush.generateVAPIDKeys();
console.log(`# Web-Push (VAPID) – in die Umgebung des Servers übernehmen (private Datei, nie einchecken).
# Den privaten Schlüssel nicht teilen; bei Wechsel müssen sich alle Geräte neu anmelden.
VAPID_PUBLIC_KEY=${keys.publicKey}
VAPID_PRIVATE_KEY=${keys.privateKey}
VAPID_SUBJECT=mailto:betreiber@example.org   # echte Kontaktadresse eintragen (oder https://…)`);
