/* Web-Push-Helfer des Service Workers (B-63). Reine Funktionen → in Tests ohne Browser ladbar (node:vm). */
(function () {
  const NEUTRAL = { title: "Neue Benachrichtigung", body: "Öffne Grow|Obs für Details.", url: "/notifications", tag: "go-push" };

  /** Nur Pfade der eigenen App: nie fremde Hosts, nie „//host“, nie javascript:. */
  const safePath = (value) => (typeof value === "string" && /^\/(?!\/)[A-Za-z0-9._~\-\/%?=&#]*$/.test(value) && value.length <= 200 ? value : NEUTRAL.url);

  /** Nutzlast des Servers (JSON) → Anzeige-Daten. Kaputte oder fehlende Daten ergeben eine neutrale Meldung (iOS verlangt, dass jeder Push etwas anzeigt). */
  const parse = (data) => {
    let raw = null;
    try { raw = data ? data.json() : null; } catch { raw = null; }
    const o = raw && typeof raw === "object" ? raw : {};
    const str = (v, fallback, max) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback);
    return { title: str(o.title, NEUTRAL.title, 80), body: str(o.body, NEUTRAL.body, 140), url: safePath(o.url), tag: str(o.tag, NEUTRAL.tag, 64) };
  };

  /** Optionen für `showNotification`. Gleicher `tag` ersetzt die ältere Meldung (kein Stapel), `renotify` meldet trotzdem erneut. */
  const options = (msg) => ({ body: msg.body, tag: msg.tag, renotify: true, lang: "de", icon: "/icon-192.png", data: { url: msg.url } });

  globalThis.GrowPush = Object.freeze({ parse, options, safePath });
})();
