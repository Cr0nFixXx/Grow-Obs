import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { targetPath } from "../../../apps/api/src/lib/push-core";
import { parsePath } from "@/lib/routes";

type Msg = { title: string; body: string; url: string; tag: string };
type PushLib = { parse: (d: { json: () => unknown } | null) => Msg; options: (m: Msg) => Record<string, unknown>; safePath: (v: unknown) => string };
const context: { GrowPush?: PushLib } = {};
runInNewContext(readFileSync(new URL("../../../public/sw-push.js", import.meta.url), "utf8"), context);
const lib = context.GrowPush!;
const data = (value: unknown) => ({ json: () => value });

describe("Service Worker: Push-Nachricht", () => {
  it("übernimmt Titel, Text, Ziel und Gruppe aus der Server-Nutzlast", () => {
    expect(lib.parse(data({ title: "Neue Nachricht", body: "Öffne Grow|Observer", url: "/chat", tag: "go-chat-ab12" }))).toEqual({ title: "Neue Nachricht", body: "Öffne Grow|Observer", url: "/chat", tag: "go-chat-ab12" });
  });
  it("zeigt bei fehlenden oder kaputten Daten trotzdem eine neutrale Meldung (iOS verlangt eine Anzeige je Push)", () => {
    for (const d of [null, data(null), data("text"), data(42), data({}), { json: () => { throw new Error("kein JSON"); } }]) {
      expect(lib.parse(d as never)).toMatchObject({ title: "Neue Benachrichtigung", url: "/notifications" });
    }
  });
  it("kürzt überlange Texte", () => {
    const m = lib.parse(data({ title: "t".repeat(300), body: "b".repeat(900) }));
    expect(m.title.length).toBe(80);
    expect(m.body.length).toBe(140);
  });
  it("lässt nur Pfade der eigenen App als Ziel zu", () => {
    for (const ok of ["/", "/chat", "/forum/abc-1", "/grows?x=1"]) expect(lib.safePath(ok)).toBe(ok);
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", "chat", "/a b", "/<script>", 5, null, `/${"a".repeat(300)}`]) expect(lib.safePath(bad)).toBe("/notifications");
  });
  it("gleicher Tag ersetzt die ältere Meldung und meldet erneut", () => {
    expect(lib.options({ title: "t", body: "b", url: "/chat", tag: "go-chat" })).toMatchObject({ body: "b", tag: "go-chat", renotify: true, lang: "de", data: { url: "/chat" } });
  });
});

describe("Push-Ziele des Servers ↔ Routen der App", () => {
  it("jedes Ziel, das der Server sendet, ist eine bekannte Ansicht (kein 404 nach dem Antippen)", () => {
    for (const type of ["chat", "forum", "grow", "task", "shop", "ai", "system"] as const) {
      const path = targetPath(type);
      expect(lib.safePath(path), type).toBe(path);
      expect(parsePath(path), `${type} → ${path}`).not.toBeNull();
    }
  });
});
