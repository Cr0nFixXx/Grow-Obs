// Generates scenes/promo-60s.json (the 60 s hero promo). Edit this generator, not the JSON.  node tools/gen-promo-scene.mjs [out.json]
import fs from "fs";
const adj = (keys, dy, zm) => keys.map(k => [k[0], k[1], +(k[2] + dy).toFixed(2), k[3], k[4], k[5], k[6], +(k[7] * zm).toFixed(4)]);
const html = (a, b) => `${a} <span class="g">${b}</span>`;
const title = (plain, h, y, extra = {}) => ({ type: "text", plain, html: h, at: [0, y, -20], start: .7, ...extra });
const kick = (t, y, extra = {}) => ({ type: "text", role: "kicker", html: t, at: [0, y, -20], start: .4, out: 4.8, ...extra });
const ph = (views, at, rot, enter, extra = {}) => ({ type: "phone", views, pose: { at, rot, enter, float: 1, floatPhase: extra.fp || 1 }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== "fp")) });
const win = (img, at, ry, enter, extra = {}) => ({ type: "window", img, pose: { at, rot: [0, ry, 0], enter }, ...extra });
const D = 6.857142857;
const S = [];
S.push({ id: "intro", dur: D, legend: false, camera: { keys: [[0,0,0,300,0,0,0,1],[1.6,0,0,-1500,5,1,14,1],[3.6,0,0,-4300,-6,-1,-8,1],[5.3,0,40,-7500,2,0,5,1],[6.857,0,70,-7960,0,0,0,1.1]] },
  glows: [[0,0,-8000,900,.35]], rings: { kind: "tunnel", count: 16, spacing: 520, z0: -100, radius: 520, jitter: 30 }, out: { kind: "yaw", dir: 1 },
  objects: [
    { type: "icon", at: [0,-110,-8000], size: 400, start: 4.0, spin: 300, rzSpin: -20, spinDur: 2.4, animDelay: .25 },
    { type: "text", plain: "Grow|Observer", html: '<span style="color:#fff">Grow</span><span style="color:#a9f5bb">|</span><span style="color:#45bd5c">Observer</span>', size: 150, layers: 12, step: 2.6, at: [0,175,-8000], start: 5.0, rxs: 70 },
    { type: "text", role: "kicker", html: "Mobil · Desktop · Dein Grow", size: 30, at: [0,300,-8000], start: 5.8, rxs: 40, zs: -500 } ] });
S.push({ id: "devices", dur: D, camera: { keys: adj([[0,0,60,-150,-38,6,6,.62],[1.5,0,60,-150,-22,4,3,.7],[3.6,40,60,-150,6,0,-1,.78],[5.4,0,50,-150,22,-3,-3,.86],[6.857,0,50,-150,30,-4,-4,.9]], -60, 1.05) },
  glows: [[0,60,-100,1000,.28],[-1100,0,-700,800,.16],[1100,0,-700,800,.16]], out: { kind: "zoom", dir: 1 },
  objects: [
    win("dashboard", [-1180,-40,-780], 30, { start: .5, dur: 1.2, from: { x: -1620, ry: 40 } }),
    win("growdetail", [1180,-40,-780], -30, { start: .7, dur: 1.2, from: { x: 1620, ry: -40 } }),
    ph(["dash"], [0,55,0], [0,-6,0], { start: 0, dur: 1.1, from: { z: -1800, ry: 140, rz: -10 } }, { fp: 1, scroll: [{ view: "dash", start: 1.6, dur: 3.8, to: 1000 }] }),
    ph(["grows"], [-430,125,-180], [0,14,0], { start: .2, dur: 1.1, from: { z: -1620, ry: -140, rz: 8 } }, { fp: 2, scroll: [{ view: "grows", start: 1.8, dur: 3.8, to: 150 }] }),
    ph(["forum"], [430,125,-180], [0,-14,0], { start: .4, dur: 1.1, from: { z: -1620, ry: 140, rz: -8 } }, { fp: 3, scroll: [{ view: "forum", start: 2.0, dur: 3.8, to: 700 }] }),
    title("Ein Grow. Alle Geräte.", html("Ein Grow.", "Alle Geräte."), -440, { size: 112, start: .9 }), kick("01 · Überblick", -535, { start: .5 }) ] });
S.push({ id: "desktop", dur: D, camera: { keys: adj([[0,0,30,0,-30,5,5,.55],[2,0,30,0,-8,2,1,.66],[4.2,0,30,0,10,-1,-2,.76],[6.857,0,30,0,18,-3,-3,.84]], -60, 1.05) },
  glows: [[0,30,0,1100,.26],[-1250,0,-600,700,.14],[1250,0,-600,700,.14]], out: { kind: "yaw", dir: -1 },
  objects: [
    win("dashboard", [0,30,0], -6, { start: 0, dur: 1.2, from: { z: -1800, ry: 30, rx: 40 } }, {
      cards: { start: 1.7, stagger: .07, dur: .8, collapseStart: 6.0, collapseDur: .7, items: [
        { rect: [304,280,266,145], z: 150 }, { rect: [583,280,280,145], z: 190 }, { rect: [862,280,266,145], z: 150 }, { rect: [1141,280,267,145], z: 190 },
        { rect: [304,450,1104,150], z: 70 }, { rect: [304,625,728,195], z: 130 }, { rect: [1056,625,352,275], z: 230 }] },
      cursor: { path: [[.8,980,700],[1.9,700,330],[2.9,1000,340],[3.9,1340,118],[5.0,700,720],[6.2,1000,500]], clicks: [1.9,2.9,3.9], liftZ: 250 } }),
    win("growdetail", [-1290,-20,-650], 32, { start: .3, dur: 1.2, from: { x: -1710 } }),
    win("forum", [1290,-20,-650], -32, { start: .5, dur: 1.2, from: { x: 1710 } }),
    title("Dein Dashboard.", html("Dein", "Dashboard."), -490), kick("02 · Desktop", -580) ] });
S.push({ id: "diary", dur: D, camera: { keys: adj([[0,0,40,0,26,4,-4,.65],[2.4,0,40,0,6,1,-1,.78],[4.6,0,40,0,-12,-2,2,.9],[6.857,0,40,0,-30,-3,4,.95]], -60, 1.05) },
  glows: [[0,40,0,950,.28],[-520,110,-260,600,.15],[520,110,-260,600,.15]], out: { kind: "roll", dir: 1 },
  objects: [
    ph(["grows","growdetail"], [0,40,0], [0,0,0], { start: 0, dur: 1.1, from: { z: -1800, ry: -140, rx: 30 } }, { fp: 4,
      scroll: [{ view: "grows", start: .6, dur: 1.2, to: 180 }, { view: "growdetail", start: 3.0, dur: 3.6, to: 1150 }],
      swap: [{ from: "grows", to: "growdetail", t: 2.45, dur: .4 }], fingers: [{ kind: "tap", t: 2.0, x: 195, y: 330 }] }),
    ph(["dash"], [-540,120,-280], [0,24,0], { start: .25, dur: 1.1, from: { x: -1460, rz: 10 } }, { fp: 5, scroll: [{ view: "dash", start: 1.2, dur: 5, to: 900 }] }),
    ph(["forum"], [540,120,-280], [0,-24,0], { start: .45, dur: 1.1, from: { x: 1460, rz: -10 } }, { fp: 6, scroll: [{ view: "forum", start: 1.4, dur: 5, to: 700 }] }),
    { type: "tag", text: "Phase: Blüte", at: [330,-250,170], start: 3.0, dx: 80 }, { type: "tag", text: "Tag 64 von 98", at: [-350,-330,130], start: 3.6, dx: -80 }, { type: "tag", text: "Logs &amp; Fotos", at: [340,250,180], start: 4.5, dx: 80 },
    title("Jeder Tag. Dokumentiert.", html("Jeder Tag.", "Dokumentiert."), -465), kick("03 · Grow-Tagebuch", -555) ] });
S.push({ id: "carousel", dur: D, camera: { keys: [[0,0,0,200,0,0,0,1],[3,0,0,-600,0,2,-3,1.1],[6.857,0,0,-1000,0,-2,3,1.2]] },
  glows: [[0,0,-1800,1500,.2]], out: { kind: "yaw", dir: -1 },
  objects: [
    { type: "carousel", radius: 1500, spinDeg: 150, spinOffset: -10, windowScale: .7, phoneScale: 1.05, items: [
      { kind: "window", img: "forum" }, { kind: "phone", view: "feed", scroll: 700 }, { kind: "window", img: "market" }, { kind: "phone", view: "strains", scroll: 700 }, { kind: "window", img: "hall" },
      { kind: "phone", view: "wiki", scroll: 700 }, { kind: "window", img: "feed" }, { kind: "phone", view: "calc", scroll: 700 }, { kind: "window", img: "chat" }, { kind: "phone", view: "market", scroll: 700 }] },
    { type: "text", plain: "Wissen teilen.", html: html("Wissen", "teilen."), size: 116, at: [0,-400,-900], start: .6 }, kick("04 · Community", -490, { at: [0,-490,-900], start: .3 }) ] });
S.push({ id: "chat", dur: D, camera: { keys: adj([[0,0,40,0,-18,3,-4,.65],[3,0,40,0,6,0,3,.8],[6.857,0,40,0,24,-3,-5,.95]], -60, 1.05) },
  glows: [[0,40,0,950,.28],[-900,0,-450,700,.15],[900,0,-450,700,.15]], out: { kind: "zoom", dir: 1 },
  objects: [
    ph(["chat-blank"], [0,40,0], [0,0,0], { start: 0, dur: 1.1, from: { z: -1800, ry: 140, rx: -25 } }, { fp: 7, behavior: "chat", behaviorOpts: { times: [1.0,2.2,3.3,4.3,5.3] } }),
    win("calc", [-950,-30,-470], 30, { start: .3, dur: 1.2, from: { x: -2050 } }), win("sim", [950,-30,-470], -30, { start: .5, dur: 1.2, from: { x: 2050 } }),
    { type: "tag", text: "Direktnachrichten", at: [0,500,220], start: 1.2, dx: -80 }, { type: "tag", text: "Kostenrechner", at: [-720,330,-200], start: 3.6, dx: -80 }, { type: "tag", text: "Simulation", at: [720,330,-200], start: 4.2, dx: 80 },
    { type: "emoji", char: "🌿", start: 2.2, x: 300 }, { type: "emoji", char: "😍", start: 3.3, x: -300 }, { type: "emoji", char: "💚", start: 4.3, x: 380 }, { type: "emoji", char: "🙏", start: 5.3, x: -380 },
    title("Schreib mit Growern.", html("Schreib mit", "Growern."), -465), kick("05 · Chat &amp; Werkzeuge", -555) ] });
S.push({ id: "pwa", dur: D, camera: { keys: adj([[0,0,40,0,40,8,-6,.7],[2.5,0,40,0,-5,2,0,.82],[4.8,0,40,0,-30,-2,4,.9],[6.857,0,40,0,0,0,0,.95]], -60, 1.05) },
  glows: [[0,40,0,950,.28],[-1300,0,-900,800,.14],[1300,0,-900,800,.14]], out: { kind: "yaw", dir: -1 },
  objects: [
    ph(["dash","drawer2"], [0,40,0], [0,0,0], { start: 0, dur: 1.0, from: { z: -1800, ry: -140, rx: 25 } }, { fp: 8, behavior: "pwa", behaviorOpts: {} }),
    win("dashboard", [-1330,-60,-950], 35, { start: .3, dur: 1.2, from: { x: -1870 } }), win("wiki", [1330,-60,-950], -35, { start: .5, dur: 1.2, from: { x: 1870 } }),
    { type: "tag", text: "Edge-Swipe-Menü", at: [-400,-200,110], start: 1.5, dx: -80, out: 3.0 }, { type: "tag", text: "Installierbar (PWA)", at: [400,-120,160], start: 2.5, dx: 80 }, { type: "tag", text: "Startet im Vollbild", at: [-400,250,120], start: 5.3, dx: -80 },
    title("In Daumen-Reichweite.", html("In Daumen-", "Reichweite."), -465), kick("06 · Bedienung &amp; PWA", -555) ] });
const fl = [["window","dashboard"],["phone","dash"],["window","forum"],["phone","growdetail"],["window","market"],["phone","feed"],["window","hall"],["phone","strains"],["window","sim"],["phone","wiki"],["window","strains"],["phone","calc"]];
S.push({ id: "hyperflight", dur: 5.142857143, camera: { keys: [[0,0,0,300,0,0,0,1],[1.3,0,0,-1800,3,0,-8,1],[2.6,0,0,-3600,-3,0,9,1],[3.9,0,0,-5600,2,0,-7,1],[5.143,0,0,-7500,0,0,0,1]] },
  glows: [[0,0,-3800,2200,.16]], floorBoost: 1.3, rings: { kind: "tunnel", count: 14, spacing: 600, z0: -300, radius: 700, flicker: false, alpha: .5, lw: 3.5 }, out: { kind: "zoom", dir: 1 },
  objects: [{ type: "tunnel", spacing: 600, z0: -300, windowX: 960, phoneX: 400, items: fl.map(([k, n]) => k === "window" ? { kind: "window", img: n } : { kind: "phone", view: n, scroll: 140 }) }] });
S.push({ id: "outro", dur: D, legend: false, camera: { keys: [[0,0,60,0,20,-3,-6,1.7],[2.2,0,60,0,-8,1,2,1.15],[6.857,0,60,0,10,-1,0,1]] },
  glows: [[0,0,0,1100,.32]], rings: { kind: "burst", count: 5, delay: .1 },
  objects: [
    { type: "icon", at: [0,-120,0], size: 400, start: .1, spin: -260, rzSpin: 14, spinDur: 2.0, animDelay: .1 },
    { type: "text", plain: "Grow|Observer", html: '<span style="color:#fff">Grow</span><span style="color:#a9f5bb">|</span><span style="color:#45bd5c">Observer</span>', size: 150, layers: 12, step: 2.6, at: [0,165,0], start: 1.0, rxs: 70 },
    { type: "text", role: "kicker", html: "Dein Grow. Auf jedem Gerät.", size: 34, at: [0,300,0], start: 2.0, rxs: 40, zs: -500 } ] });
const scene = {
  meta: { title: "Grow|Observer – 3D promo, 60 s (16:9)", note: "Demo data only. Station order = order in `stations`. Camera keys: [t,x,y,z,yaw,pitch,roll,zoom]." },
  format: { w: 1920, h: 1080, fps: 30 }, bpm: 140, stationX: 14000, perspective: 1500, legend: "Screens mit Demo-Daten", fade: { in: .3, out: .95 },
  beat: { bpm: 140, on: [[3.43, 41.142857], [42.857143, 54.857143]] },
  audio: { bpm: 140, drop: 1, breakdown: 6, finale: 7, outro: 8, rolls: [3, 5, 7, 8], note: "indices refer to stations[]" },
  stations: S };
let j = JSON.stringify(scene, null, 1);
j = j.replace(/\[\s+(-?[\d.eE+-]+(?:,\s+-?[\d.eE+-]+)*)\s+\]/g, (m, a) => "[" + a.replace(/\s+/g, "") + "]");
j = j.replace(/\[\s+(\[[^\]]*\](?:,\s+\[[^\]]*\])*)\s+\]/g, (m, a) => "[" + a.replace(/\],\s+\[/g, "],[") + "]");
fs.writeFileSync(process.argv[2] || new URL("../scenes/promo-60s.json", import.meta.url), j);
console.log("ok", j.length);
