// Generates the key-visual scenes  scenes/hero-<variant>-<format>.json  (single-station "stills" scenes).
//   node tools/gen-hero.mjs            then render them with tools/stills.sh  (or tools/still.mjs --t 3.5 --png)
// Edit LAYOUTS / VARIANTS to add visuals; every scene is plain engine JSON (see docs/ENGINE.md).
import fs from "fs";
import path from "path";
import { KIT } from "./lib.mjs";
const FORMATS = { "16x9": [1920, 1080], "9x16": [1080, 1920], "1x1": [1080, 1080], "4x5": [1080, 1350] };
const g = (a, b) => `${a} <span class="g">${b}</span>`;
const enter = (from, start = 0) => ({ start, dur: 1.1, from });
const phone = (views, at, rot, extra = {}) => ({ type: "phone", views, pose: { at, rot, s: extra.s || 1, enter: enter({ z: -1400, ry: 120 }) } });
const win = (img, at, ry, sc = 1) => ({ type: "window", img, pose: { at, rot: [0, ry, 0], s: sc, enter: enter({ z: -1400, ry: 40 }, .2) } });
const txt = (lines, x, y0, size, lh = 0, start = .5) => lines.map((l, i) => ({ type: "text", plain: l.replace(/<[^>]+>/g, ""), html: l, size, at: [x, y0 + i * lh, -20], start: start + i * .12 }));
const kick = (t, x, y) => ({ type: "text", role: "kicker", html: t, at: [x, y, -20], start: .3, size: 28 });
const tag = (text, x, y, z = 120, dx = 60, start = 1.4) => ({ type: "tag", text, at: [x, y, z], dx, start });
// zoom/camera + object layouts per variant and format. cam = [x,y,z,yaw,pitch,roll,zoom]
const L = {
  logo: { all: { cam: [0, 70, 0, -4, 3, 0, 1], zoomBy: { "9x16": .98, "4x5": .95, "1x1": .9 }, objects: [
    { type: "icon", at: [0, -120, 0], size: 400, start: .1, spin: -260, rzSpin: 14, spinDur: 2.0, animDelay: .1 },
    { type: "text", plain: "Grow|Observer", html: '<span style="color:#fff">Grow</span><span style="color:#a9f5bb">|</span><span style="color:#45bd5c">Observer</span>', size: 150, layers: 12, step: 2.6, at: [0, 165, 0], start: 1.0, rxs: 70 },
    { type: "text", role: "kicker", html: "Dein Grow. Auf jedem Gerät.", size: 34, at: [0, 300, 0], start: 2.0, rxs: 40, zs: -500 }] }, legend: false },
  dashboard: {
    "16x9": { cam: [0, 0, 0, 10, 2, 0, .95], objects: [phone(["dash"], [330, 30, 0], [0, -14, 0], { s: 1.1 }), kick("01 · Dashboard", -470, -200), ...txt(["Alles auf", g("einen", "Blick.")], -470, -90, 120, 130), tag("Aktive Grows", -560, 200), tag("Offene Tasks", -430, 280, 120, 60, 1.8)] },
    "9x16": { cam: [0, 0, 0, 6, 2, 0, 1.12], objects: [phone(["dash"], [0, 180, 0], [0, -10, 0], { s: 1.4 }), kick("01 · Dashboard", 0, -800), ...txt(["Alles auf", g("einen", "Blick.")], 0, -690, 108, 125), tag("Aktive Grows", -300, -20, 120), tag("Offene Tasks", 250, 520, 120, -60, 1.8)] },
    "1x1": { cam: [0, 0, 0, 10, 2, 0, .92], objects: [phone(["dash"], [330, 40, 0], [0, -14, 0]), kick("01 · Dashboard", -290, -200), ...txt(["Alles auf", g("einen", "Blick.")], -290, -90, 90, 100), tag("Aktive Grows", -380, 170)] },
    "4x5": { cam: [0, 0, 0, 6, 2, 0, 1.0], objects: [phone(["dash"], [0, 240, 0], [0, -10, 0], { s: 1.2 }), kick("01 · Dashboard", 0, -610), ...txt(["Alles auf", g("einen", "Blick.")], 0, -510, 100, 115), tag("Aktive Grows", -230, 60, 120)] } },
  diary: {
    "16x9": { cam: [0, 0, 0, 10, 2, 0, .95], objects: [phone(["growdetail"], [330, 30, 0], [0, -14, 0], { s: 1.1 }), kick("03 · Grow-Tagebuch", -470, -200), ...txt(["Jeder Tag.", "<span class=\"g\">Dokumentiert.</span>"], -470, -90, 100, 120), tag("Phase: Blüte", -560, 200), tag("Tag 64 von 98", -430, 280, 120, 60, 1.8)] },
    "9x16": { cam: [0, 0, 0, 6, 2, 0, 1.12], objects: [phone(["growdetail"], [0, 180, 0], [0, -10, 0], { s: 1.4 }), kick("03 · Grow-Tagebuch", 0, -800), ...txt(["Jeder Tag.", "<span class=\"g\">Dokumentiert.</span>"], 0, -690, 108, 125), tag("Phase: Blüte", -300, -20, 120), tag("Tag 64 von 98", 250, 520, 120, -60, 1.8)] },
    "1x1": { cam: [0, 0, 0, 10, 2, 0, .92], objects: [phone(["growdetail"], [330, 40, 0], [0, -14, 0]), kick("03 · Grow-Tagebuch", -290, -200), ...txt(["Jeder Tag.", "<span class=\"g\">Dokumentiert.</span>"], -290, -90, 74, 90), tag("Phase: Blüte", -380, 170)] },
    "4x5": { cam: [0, 0, 0, 6, 2, 0, 1.0], objects: [phone(["growdetail"], [0, 240, 0], [0, -10, 0], { s: 1.2 }), kick("03 · Grow-Tagebuch", 0, -610), ...txt(["Jeder Tag.", "<span class=\"g\">Dokumentiert.</span>"], 0, -510, 100, 115), tag("Phase: Blüte", -230, 60, 120)] } },
  devices: {
    "16x9": { cam: [0, 40, -150, 12, 2, 0, .85], objects: [win("dashboard", [-1180, -40, -780], 30), win("growdetail", [1180, -40, -780], -30), phone(["dash"], [0, 55, 0], [0, -6, 0]), phone(["grows"], [-430, 125, -180], [0, 14, 0]), phone(["forum"], [430, 125, -180], [0, -14, 0]), kick("Mobil · Desktop", 0, -535), ...txt([g("Ein Grow.", "Alle Geräte.")], 0, -440, 112)] },
    "9x16": { cam: [0, 0, 0, 8, 2, 0, .95], objects: [win("dashboard", [0, -330, -200], -12, .72), phone(["dash"], [-190, 420, 0], [0, 12, 0], { s: 1.1 }), phone(["forum"], [260, 520, -200], [0, -14, 0], { s: 1.05 }), kick("Mobil · Desktop", 0, -960), ...txt(["Ein Grow.", g("Alle", "Geräte.")], 0, -860, 140, 135)] },
    "1x1": { cam: [0, 0, 0, 10, 2, 0, .72], objects: [win("dashboard", [-250, -170, -500], 24), phone(["dash"], [300, 110, 0], [0, -14, 0]), phone(["grows"], [-120, 260, -160], [0, 14, 0]), kick("Mobil · Desktop", 0, -580), ...txt([g("Ein Grow.", "Alle Geräte.")], 0, -490, 112)] },
    "4x5": { cam: [0, 0, 0, 8, 2, 0, .8], objects: [win("dashboard", [0, -400, -300], -12), phone(["dash"], [-190, 260, 0], [0, 12, 0]), phone(["forum"], [250, 350, -220], [0, -14, 0]), kick("Mobil · Desktop", 0, -810), ...txt(["Ein Grow.", g("Alle", "Geräte.")], 0, -700, 130, 130)] } },
};
let n = 0;
for (const [variant, byFmt] of Object.entries(L)) for (const [fid, [w, h]] of Object.entries(FORMATS)) {
  const lay = byFmt[fid] || byFmt.all, c = [...lay.cam]; if (lay.zoomBy && lay.zoomBy[fid]) c[6] *= lay.zoomBy[fid];
  const keys = [[0, c[0], c[1], c[2], c[3], c[4], c[5], c[6]], [4, c[0], c[1], c[2], c[3], c[4], c[5], c[6]]];
  const scene = { meta: { title: `Hero still: ${variant} ${fid}`, note: "Render at t=3.5 (all enter animations settled)." }, format: { w, h, fps: 30 }, stationX: 14000, perspective: 1500,
    legend: lay.legend === false ? "" : "Screens mit Demo-Daten", fade: { in: 0, out: 0 }, stations: [{ id: variant, dur: 4, camera: { keys }, legend: lay.legend !== false,
      glows: [[0, 40, 0, 1000, .3], [-900, 0, -500, 700, .15], [900, 0, -500, 700, .15]], objects: lay.objects }] };
  fs.writeFileSync(path.join(KIT, "scenes", `hero-${variant}-${fid}.json`), JSON.stringify(scene));
  n++;
}
console.log("wrote", n, "hero scenes");
