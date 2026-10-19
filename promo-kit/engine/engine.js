/* Grow|Observer promo engine – deterministic, scene-config driven.
 *
 * A scene is a JSON file (see ../docs/ENGINE.md and ../scenes/*.json). The engine builds a CSS-3D world with a virtual
 * camera plus canvas effects (floor grid, rings, particles, speed lines). `window.renderFrame(t)` draws time t (seconds)
 * and is a pure function of t (apart from film grain), so any frame can be rendered at any time, in any order.
 *
 * URL params:  ?scene=../scenes/promo-60s.json   (or window.__SCENE__ = {...} injected before load; used by render.mjs)
 *              &assets=../screenshots/            (folder with mobile/ desktop/ parts/)
 *              &t=12.5                            (show one frame immediately, handy in a normal browser)
 */
(function () {
const Q = new URLSearchParams(location.search);
const A = Q.get('assets') || '../screenshots/';
const $ = id => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const E = {
  lin: x => x, out3: x => 1 - Math.pow(1 - x, 3), out5: x => 1 - Math.pow(1 - x, 5),
  io: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  back: x => { const c = 1.9, c3 = c + 1; return 1 + c3 * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2) },
  expo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)
};
const P = (t, s, d, e = E.out3) => e(clamp((t - s) / d));
const rnd = (function () { let a = 424242; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } })();
const D2R = Math.PI / 180;

let CFG, W = 1920, H = 1080, FPS = 30, STX = 14000, ST = [], DUR = 60, PCAM = 1500;
let SE = [], SO = [];           // station containers / station object instances
const DIM = {};
/* Seamless-loop mode: scene.loop = period in seconds. Every sinusoidal motion frequency is snapped to a whole number of cycles per period
   (w), and the constant particle drift is switched off, so renderFrame(t) === renderFrame(t + loop) apart from film grain. */
let LP = 0;
const w = a => LP ? Math.max(1, Math.round(a * LP / (2 * Math.PI))) * 2 * Math.PI / LP : a;

/* ---------- assets ---------- */
function assetUrl(n, ext) {
  if (n.startsWith('d-')) return `${A}desktop/${n}.jpg`;
  if (n.startsWith('chat-m')) return `${A}parts/${n}.png`;
  if (n === 'chat-blank-f') return `${A}parts/${n}.jpg`;
  return `${A}mobile/${n}.jpg`;
}
function neededImages(cfg) {
  const s = new Set();
  const phone = v => { s.add(v + '-f'); s.add(v + '-t') };
  const item = it => { if (it.kind === 'window') s.add('d-' + it.img); else phone(it.view) };
  for (const st of cfg.stations) for (const o of st.objects || []) {
    if (o.type === 'phone') { (o.views || []).forEach(v => { if (v !== 'chat-blank') phone(v) }); if (o.behavior === 'chat') s.add('chat-blank-f'); if (o.behavior === 'pwa') { s.add('drawer-f'); s.add('dash-f') } }
    if (o.type === 'window') s.add('d-' + o.img);
    if (o.type === 'carousel' || o.type === 'tunnel') o.items.forEach(item);
  }
  return [...s];
}
function loadImages(names) {
  return Promise.all(names.map(n => new Promise(r => {
    const i = new Image();
    i.onload = () => { DIM[n] = [i.naturalWidth / (n.startsWith('d-') ? 1.5 : 2), i.naturalHeight / (n.startsWith('d-') ? 1.5 : 2)]; r() };
    i.onerror = () => { if (!n.endsWith('-t')) console.error('missing asset', n); r() };
    i.src = assetUrl(n);
  })));
}

/* ---------- brand icon (same artwork as public/icon.svg) ---------- */
const LEAF = "M256 104C160 168 128 286 158 392c4 16 12 30 24 42-2-78 26-156 104-214 4 92 34 146 80 184 28-30 44-70 44-122 0-114-86-178-154-178z";
const CREASE = "M256 206c0 70-32 118-70 150";
let UID = 0;
function iconSVG() {
  const id = 'ic' + (UID++);
  return `<svg viewBox="0 0 512 512" width="100%" height="100%" style="overflow:visible"><defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#45bd5c"/><stop offset="1" stop-color="#1c6930"/></linearGradient></defs>
<g class="ibg" style="transform-origin:256px 256px"><rect width="512" height="512" rx="112" fill="url(#g${id})"/></g>
<path class="leafs" d="${LEAF}" fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>
<path class="leaff" d="${LEAF}" fill="#fff" opacity="0"/>
<path class="crease" d="${CREASE}" stroke="#154425" stroke-width="12" fill="none" stroke-linecap="round" opacity="0"/></svg>`;
}
function animIcon(root, lt, s) {
  const q = c => root.querySelector(c); const ibg = q('.ibg'), ls = q('.leafs'), lf = q('.leaff'), cr = q('.crease');
  const L = ls.getTotalLength(); ls.style.strokeDasharray = L;
  const a = P(lt, s, .6, E.back); ibg.style.transform = `scale(${a})`; ibg.style.opacity = clamp(a * 3);
  const d = P(lt, s + .3, .8, E.io); ls.style.strokeDashoffset = L * (1 - d); ls.style.opacity = lt < s + .3 ? 0 : (1 - P(lt, s + .95, .4));
  lf.style.opacity = .96 * P(lt, s + .85, .45); cr.style.opacity = .45 * P(lt, s + 1.2, .4);
}

/* ---------- generic helpers ---------- */
function o3(parent, w, h) { const d = document.createElement('div'); d.className = 'o3'; d.style.cssText = `left:${-w / 2}px;top:${-h / 2}px;width:${w}px;height:${h}px`; parent.appendChild(d); return d }
function pose3(el, o) { el.style.transform = `translate3d(${o.x || 0}px,${o.y || 0}px,${o.z || 0}px) rotateY(${o.ry || 0}deg) rotateX(${o.rx || 0}deg) rotateZ(${o.rz || 0}deg) scale(${o.s == null ? 1 : o.s})` }
/* pose spec: {at:[x,y,z], rot:[rx,ry,rz], s, float, floatPhase, enter:{start,dur,ease,from:{x,y,z,rx,ry,rz}}}
   `from` values are OFFSETS that decay to 0 during the enter animation. */
function poseCalc(p, lt) {
  p = p || {}; const at = p.at || [0, 0, 0], rot = p.rot || [0, 0, 0];
  const o = { x: at[0], y: at[1], z: at[2], rx: rot[0], ry: rot[1], rz: rot[2], s: p.s == null ? 1 : p.s };
  if (p.enter) { const e = p.enter, q = P(lt, e.start || 0, e.dur || 1.1, E[e.ease || 'out5']); const f = e.from || {}; for (const k in f) o[k] += f[k] * (1 - q) }
  if (p.float) o.y += Math.sin(lt * w(1.1) + (p.floatPhase || 0)) * 9 * p.float;
  if (LP && p.sway) { const a = 2 * Math.PI * lt / LP + (p.floatPhase || 0); o.ry += Math.sin(a) * p.sway; o.rx += Math.cos(a) * p.sway * .35; o.rz += Math.sin(a * 2) * p.sway * .12 }
  return o;
}
function mixc(a, b, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(lerp(v, y[i], t)).toString(16).padStart(2, '0')).join('') }
function T3(parent, plain, html, { size = 130, layers = 14, step = 2.6 } = {}) {
  const o = document.createElement('div'); o.className = 'o3 t3w'; let s = '';
  for (let i = layers; i >= 0; i--) {
    s += i === 0 ? `<div class="t3" style="font-size:${size}px;transform:translate(-50%,-50%)">${html}</div>`
      : `<div class="t3" style="font-size:${size}px;color:${mixc('#3fae58', '#0b2a15', i / layers)};transform:translate(-50%,-50%) translateZ(${-i * step}px)">${plain}</div>`
  }
  o.innerHTML = s; parent.appendChild(o); return o
}
const setO = (o, v) => { for (const c of o.children) c.style.opacity = v };
const stripTags = h => h.replace(/<[^>]+>/g, '');
const qa = (s, sel) => [...s.querySelectorAll(sel)];

/* ---------- phone building blocks ---------- */
function mkView(key) {
  const t = DIM[key + '-t']; const url = n => `url(${assetUrl(n)})`;
  if (t && t[1] > 844) return `<div class="view" data-k="${key}"><div class="tall" style="height:${t[1]}px;background-image:${url(key + '-t')}"></div><div class="hd" style="background-image:${url(key + '-f')}"></div><div class="nv" style="background-image:${url(key + '-f')}"></div></div>`;
  return `<div class="view" data-k="${key}"><div class="full" style="background-image:${url(key + '-f')}"></div></div>`;
}
const maxScroll = k => DIM[k + '-t'] ? Math.max(0, DIM[k + '-t'][1] - 844) : 0;
function vset(ph, key, o = {}) {
  const el = ph.querySelector(`.view[data-k="${key}"]`); if (!el) return;
  const op = o.o == null ? 1 : o.o; el.style.opacity = op; el.style.display = op <= 0.001 ? 'none' : 'block';
  el.style.zIndex = o.z || 1; el.style.transform = `translate(${o.x || 0}px,${o.y || 0}px)`;
  const tl = el.querySelector('.tall'); if (tl) tl.style.transform = `translateY(${-(o.sc || 0)}px)`;
}
function phoneEl(parent, views, extra = '') {
  const o = o3(parent, 414, 868);
  let h = `<div class="pback" style="transform:translateZ(-20px)"><div class="lens"></div><div class="plogo">${iconSVG()}</div></div>`;
  for (let i = 0; i < 9; i++) h += `<div class="pedge" style="transform:translateZ(${-18 + i * 2}px)${i % 2 ? '' : ';border-color:rgba(111,242,139,.4)'}"></div>`;
  h += `<div class="phone"><div class="scr">${views.map(mkView).join('')}${extra}<div class="fg"><div class="rg"></div><div class="dot"></div></div></div><div class="gloss"></div></div>`;
  o.innerHTML = h; return o;
}
function windowEl(parent, img) {
  const o = o3(parent, 1440, 936);
  let h = `<div class="wback" style="transform:translateZ(-14px)"></div>`;
  for (let i = 0; i < 5; i++) h += `<div class="wedge" style="transform:translateZ(${-12 + i * 2.5}px)${i % 2 ? '' : ';border-color:rgba(111,242,139,.35)'}"></div>`;
  h += `<div class="win"><div class="wbar"><i></i><i></i><i></i><span>Grow|Observer</span></div><div class="wshot" style="background-image:url(${assetUrl('d-' + img)})"></div></div>`;
  o.innerHTML = h; return o;
}
/* finger overlay inside a phone screen */
function fing(ph, o) {
  const f = ph.querySelector('.fg'); f.style.opacity = o.a; f.style.transform = `translate(${o.x}px,${o.y}px)`;
  f.querySelector('.dot').style.transform = `scale(${1 - .22 * o.p})`; const r = f.querySelector('.rg'); r.style.opacity = o.r > 0 && o.r < 1 ? (1 - o.r) * .9 : 0; r.style.transform = `scale(${1 + o.r * 2.2})`
}
function tapState(lt, s, x, y) {
  const u = lt - s; if (u < 0 || u > .8) return null;
  return { x, y, a: P(u, 0, .15) * (1 - P(u, .55, .2)), p: P(u, .15, .12) * (1 - P(u, .3, .15)), r: P(u, .3, .45, E.out3) }
}
function swipeState(lt, s, d, x0, y0, x1, y1) {
  const u = lt - s; if (u < -.25 || u > d + .35) return null; const k = P(lt, s, d, E.io);
  return { x: lerp(x0, x1, k), y: lerp(y0, y1, k), a: P(u, -.25, .2) * (1 - P(u, d + .1, .22)), p: .85, r: 0 }
}
const fingerUse = (ph, st) => fing(ph, st || { x: 0, y: 0, a: 0, p: 0, r: 0 });

/* ---------- object types ---------- */
const OBJ = {};

OBJ.phone = {
  build(c, sp) {
    let extra = '';
    const inst = { sp };
    if (sp.behavior === 'chat') {
      const CM = sp.behaviorOpts && sp.behaviorOpts.bubbles || [[30, 209, 205, 53], [101.5, 269, 258, 75], [30, 343.5, 155, 59.5], [101.5, 410, 258, 74], [30, 489, 228, 55]];
      extra = `<div class="layer chatL" style="z-index:5">${CM.map((b, i) => `<img class="cm" data-i="${i}" src="${assetUrl('chat-m' + i)}" style="position:absolute;left:${b[0]}px;top:${b[1]}px;width:${b[2]}px;height:${b[3]}px;opacity:0;transform-origin:${i % 2 ? '100% 100%' : '0% 100%'}">`).join('')}</div>`;
    }
    if (sp.behavior === 'pwa') {
      extra = `<div class="layer drL" style="z-index:6;display:none"><div class="scrim" style="position:absolute;inset:0;background:#000;opacity:0"></div><div class="drawerImg" style="position:absolute;left:0;top:0;width:390px;height:844px;background:url(${assetUrl('drawer-f')}) 0 0/390px 844px no-repeat;clip-path:inset(0 88px 0 0)"></div></div>
      <div class="layer homeL" style="z-index:8;display:none"><div class="home"><div class="sb"><span>9:41</span><span>●●● ▮</span></div><div class="homeIcons"></div></div></div>
      <div class="layer launchL" style="z-index:9;display:none"><div class="launchImg" style="position:absolute;inset:0;background:url(${assetUrl('dash-f')}) 0 0/390px 844px no-repeat;transform-origin:0 0;border-radius:40px"></div></div>
      <div class="hl" style="position:absolute;left:22px;top:668px;width:280px;height:54px;border-radius:14px;border:3px solid #6ff28b;box-shadow:0 0 30px #6ff28b;opacity:0;z-index:12;text-align:left"></div>`;
    }
    inst.el = phoneEl(c, sp.views, extra);
    if (sp.behavior === 'pwa') {
      const cols = ['#2b4a6b', '#6b3a2b', '#4a2b6b', '#2b6b5a', '#6b5a2b', '#6b2b4a', '#3a6b2b', '#2b3a6b', '#5a2b6b', '#2b5a6b', '#6b4a2b', '#4a6b2b'];
      let h = ''; const slots = []; for (let r = 0; r < 5; r++) for (let q = 0; q < 4; q++) slots.push([22 + q * 88, 70 + r * 104]);
      slots.forEach((s, i) => { if (i === 5 || i >= 16) return; h += `<div class="hi" style="left:${s[0]}px;top:${s[1]}px;background:linear-gradient(145deg,${cols[i % 12]},#0b0f0c);opacity:.9"></div>` });
      for (let i = 0; i < 4; i++) h += `<div class="hi" style="left:${22 + i * 88}px;top:742px;background:linear-gradient(145deg,${cols[(i * 3 + 1) % 12]},#0b0f0c);opacity:.9"></div>`;
      h += `<div class="appIcon" style="position:absolute;left:${slots[5][0]}px;top:${slots[5][1]}px;width:64px;height:64px;opacity:0">${iconSVG()}</div><div class="appLbl hl" style="left:${slots[5][0] - 8}px;top:${slots[5][1] + 68}px;opacity:0">GrowObserver</div>`;
      inst.el.querySelector('.homeIcons').innerHTML = h; inst.slot = slots[5];
    }
    return inst;
  },
  update(inst, lt, C) {
    const sp = inst.sp, el = inst.el;
    pose3(el, poseCalc(sp.pose, lt));
    if (sp.behavior === 'pwa') return pwaUpdate(inst, lt);
    const swaps = sp.swap || [], toViews = new Set(swaps.map(s => s.to));
    const st = {};
    for (const v of sp.views) st[v] = { o: toViews.has(v) ? 0 : 1, x: 0, z: 1, sc: 0 };
    for (const w of swaps) { const k = P(lt, w.t, w.dur || .4, E.out3); st[w.from].o *= 1 - k * .9; st[w.from].x = -k * 70; st[w.to].o = k; st[w.to].x = (1 - k) * 90; st[w.to].z = 2 }
    for (const s of sp.scroll || []) { const mx = maxScroll(s.view); st[s.view].sc = P(lt, s.start, s.dur, E[s.ease || 'io']) * Math.min(mx, s.to); }
    if (LP && sp.loopScroll) { const v = sp.views[0]; st[v].sc = (.5 - .5 * Math.cos(2 * Math.PI * lt / LP + (sp.pose && sp.pose.floatPhase || 0))) * Math.min(maxScroll(v), sp.loopScroll) }
    for (const v of sp.views) vset(el, v, st[v]);
    if (sp.fingers) {
      let f = null; for (const g of sp.fingers) { f = g.kind === 'swipe' ? swipeState(lt, g.t, g.d, g.x0, g.y0, g.x1, g.y1) : tapState(lt, g.t, g.x, g.y); if (f) break }
      fingerUse(el, f);
    }
    if (sp.behavior === 'chat') {
      const L = el.querySelector('.chatL');
      (sp.behaviorOpts && sp.behaviorOpts.times || [1.0, 2.2, 3.3, 4.3, 5.3]).forEach((t0, i) => {
        const b = L.querySelector(`.cm[data-i="${i}"]`); const q = P(lt, t0, .4, E.back); b.style.opacity = clamp(q * 3); b.style.transform = `scale(${.6 + .4 * q}) translateY(${(1 - q) * 18}px)`
      });
    }
  }
};
function pwaUpdate(inst, lt) {
  const ph = inst.el, T = Object.assign({ swipe: .7, drawer: 1.2, drawer2: 2.05, hl0: 2.3, hl1: 3.2, tapInstall: 3.0, home: 3.45, icon: 3.9, label: 4.3, tapIcon: 4.7, launch: 5.0 }, inst.sp.behaviorOpts || {});
  const q = c => ph.querySelector(c); const slot = inst.slot;
  const dOpen = P(lt, T.drawer, .5, E.out5) * (1 - P(lt, T.drawer2, .01));
  const dr = q('.drL'); dr.style.display = dOpen > .001 ? 'block' : 'none'; q('.scrim').style.opacity = .55 * dOpen;
  q('.drawerImg').style.transform = `translateX(${(1 - dOpen) * -310}px)`;
  const d2 = P(lt, T.drawer2, .25, E.out3);
  vset(ph, 'dash', { o: 1 }); vset(ph, 'drawer2', { o: d2, z: 3 });
  const hl = q('.hl'); hl.style.opacity = (lt > T.hl0 && lt < T.hl1) ? P(lt, T.hl0, .25) * (.6 + .4 * Math.sin(lt * w(10))) : 0;
  const hm = P(lt, T.home, .4, E.out3); const home = q('.homeL'); home.style.display = hm > .001 ? 'block' : 'none'; home.style.opacity = hm;
  const ap = P(lt, T.icon, .6, E.back); const ai = q('.appIcon'); ai.style.opacity = clamp(ap * 3); ai.style.transform = `translateY(${(1 - ap) * -120}px) scale(${.3 + .7 * ap})`;
  q('.appLbl').style.opacity = P(lt, T.label, .3);
  const st = swipeState(lt, T.swipe, .55, 4, 430, 190, 430) || tapState(lt, T.tapInstall, 162, 694) || tapState(lt, T.tapIcon, slot[0] + 32, slot[1] + 32);
  fingerUse(ph, st);
  const la = P(lt, T.launch, .7, E.io); const L = q('.launchL'); L.style.display = la > .001 ? 'block' : 'none';
  const sc0 = 64 / 390, li = q('.launchImg'); li.style.transform = `translate(${lerp(slot[0], 0, la)}px,${lerp(slot[1], 0, la)}px) scale(${lerp(sc0, 1, la)})`; li.style.borderRadius = lerp(15 / sc0, 40, la) + 'px';
}

OBJ.window = {
  build(c, sp) {
    const inst = { sp, el: windowEl(c, sp.img), cards: [] };
    if (sp.cards) for (const ci of sp.cards.items) {
      const [x, y, w, h] = ci.rect; const e = document.createElement('div'); e.className = 'card';
      e.style.cssText = `left:${x}px;top:${36 + y}px;width:${w}px;height:${h}px;background-image:url(${assetUrl('d-' + sp.img)});background-position:${-x}px ${-y}px`;
      inst.el.appendChild(e); e._c = [x + w / 2, y + h / 2]; e._z = ci.z; e._w = w; e._h = h; inst.cards.push(e)
    }
    if (sp.cursor) { const e = document.createElement('div'); e.className = 'cur'; e.innerHTML = `<div class="rip"></div><svg viewBox="0 0 24 24"><path d="M3 2l17 8-7.5 2.2L10 20z" fill="#fff" stroke="#0a0f0b" stroke-width="1.6" stroke-linejoin="round"/></svg>`; inst.el.appendChild(e); inst.cur = e }
    return inst;
  },
  update(inst, lt) {
    const sp = inst.sp; pose3(inst.el, poseCalc(sp.pose, lt));
    let cxw = 0, cyw = 0;
    if (sp.cursor) {
      const cp = sp.cursor.path; let k = 0; while (k < cp.length - 2 && lt >= cp[k + 1][0]) k++;
      const u = E.io(clamp((lt - cp[k][0]) / (cp[k + 1][0] - cp[k][0])));
      cxw = lerp(cp[k][1], cp[k + 1][1], u); cyw = lerp(cp[k][2], cp[k + 1][2], u);
    }
    if (sp.cards) {
      const X = sp.cards, st = X.start || 1.7, sg = X.stagger == null ? .07 : X.stagger, cs = X.collapseStart || 99;
      const col = P(lt, cs, X.collapseDur || .7, E.io);
      inst.cards.forEach((c, i) => {
        const [mx, my] = c._c; const q = P(lt, st + i * sg, X.dur || .8, E.back) * (1 - col);
        const hov = sp.cursor && q > .5 && Math.abs(cxw - mx) < c._w / 2 && Math.abs(cyw - my) < c._h / 2 ? 1 : 0;
        c.style.transform = `translate3d(${(mx - 720) * .05 * q}px,${(my - 450) * .05 * q}px,${c._z * q + hov * 60}px) rotateY(${(mx - 720) * -.004 * q}deg) scale(${1 + .04 * hov})`;
        c.style.display = lt < st - .05 ? 'none' : 'block'
      });
    }
    if (sp.cursor) {
      const cu = inst.cur, cf = sp.cursor, ex = sp.cards ? P(lt, (sp.cards.start || 1.7), .9, E.back) : 0, col = sp.cards ? P(lt, sp.cards.collapseStart || 99, sp.cards.collapseDur || .7, E.io) : 0;
      cu.style.display = lt < cf.path[0][0] ? 'none' : 'block';
      cu.style.transform = `translate3d(${cxw}px,${cyw + 36}px,${(ex > .5 ? (cf.liftZ || 250) : 6) * (1 - col) + 6}px)`;
      let ro = 0, rs = 1; (cf.clicks || []).forEach(t0 => { const q = P(lt, t0 + .35, .5, E.out3); if (q > 0 && q < 1) { ro = (1 - q) * .9; rs = 1 + q * 2.4 } });
      const rip = cu.querySelector('.rip'); rip.style.opacity = ro; rip.style.transform = `scale(${rs})`;
    }
  }
};

OBJ.text = {
  build(c, sp) {
    const kick = sp.role === 'kicker';
    const plain = sp.plain || stripTags(sp.html || '');
    const html = kick ? `<span class="kick">${sp.html || plain}</span>` : (sp.html || plain);
    const size = sp.size || (kick ? 30 : 104);
    return { sp, el: T3(c, kick ? '' : plain, html, { size, layers: kick ? 0 : (sp.layers == null ? 14 : sp.layers), step: sp.step || 2.8 }) };
  },
  update(inst, lt, C) {
    const sp = inst.sp, o = inst.el, at = sp.at || [0, 0, 0], kick = sp.role === 'kicker';
    const s = sp.start || 0, p = P(lt, s, sp.dur || 1.0, E.out5), on = lt >= s;
    o.style.display = on ? 'block' : 'none';
    const zs = sp.zs == null ? (kick ? -400 : -1100) : sp.zs, rxs = sp.rxs == null ? (kick ? 30 : 60) : sp.rxs;
    pose3(o, { x: at[0], y: at[1] + (1 - p) * 40, z: at[2] + (1 - p) * zs, rx: (1 - p) * rxs, ry: -C.yaw * (sp.face == null ? .55 : sp.face), s: 1 });
    setO(o, clamp(p * 3) * (1 - P(lt, sp.out == null ? 999 : sp.out, .5)));
  }
};

OBJ.tag = {
  build(c, sp) { const o = document.createElement('div'); o.className = 'o3 t3w'; o.innerHTML = `<div class="tag"><i></i>${sp.text}</div>`; c.appendChild(o); return { sp, el: o } },
  update(inst, lt, C) {
    const sp = inst.sp, o = inst.el, at = sp.at, dx = sp.dx || 0; const p = P(lt, sp.start, .55, E.back);
    o.style.display = p <= .001 ? 'none' : 'block';
    pose3(o, { x: at[0] + dx * (1 - p), y: at[1] + (1 - p) * 30 + Math.sin(lt * w(1.3) + at[0]) * 6, z: at[2], ry: -C.yaw * .9, rx: -C.pitch * .6, s: .7 + .3 * p });
    o.firstChild.style.opacity = clamp(p * 2.2) * (sp.out == null ? 1 : 1 - P(lt, sp.out, .3));
  }
};

OBJ.emoji = {
  build(c, sp) { const o = document.createElement('div'); o.className = 'o3 t3w'; o.innerHTML = `<div class="emo">${sp.char}</div>`; c.appendChild(o); return { sp, el: o } },
  update(inst, lt) {
    const sp = inst.sp, o = inst.el, u = lt - sp.start, d = sp.dur || 2.2; if (u < 0 || u > d) { o.style.display = 'none'; return }
    o.style.display = 'block'; const k = u / d;
    pose3(o, { x: sp.x, y: (sp.y0 == null ? 300 : sp.y0) - k * (sp.rise || 750), z: 200 + k * 120, rz: Math.sin(k * 5) * 14, s: .7 + k * .7 }); o.firstChild.style.opacity = Math.sin(k * 3.14);
  }
};

OBJ.icon = {
  build(c, sp) {
    const size = sp.size || 400; const o = o3(c, size, size); let h = '';
    for (let i = 13; i >= 1; i--) h += `<div style="position:absolute;inset:0;border-radius:${size * .22}px;background:${mixc('#2f8a46', '#0b2a15', i / 13)};transform:translateZ(${-i * 2.4}px)"></div>`;
    h += `<div class="ifront" style="position:absolute;inset:0">${iconSVG()}</div>`; o.innerHTML = h; return { sp, el: o };
  },
  update(inst, lt) {
    const sp = inst.sp, o = inst.el, at = sp.at || [0, 0, 0], s = sp.start || 0;
    o.style.display = lt >= s - .1 ? 'block' : 'none';
    const ip = P(lt, s, .8, E.back), spin = 1 - P(lt, s, sp.spinDur || 2.4, E.out5);
    pose3(o, { x: at[0], y: at[1], z: at[2], ry: spin * (sp.spin == null ? 300 : sp.spin), rz: spin * (sp.rzSpin == null ? -20 : sp.rzSpin), s: Math.max(.001, ip) });
    animIcon(o.querySelector('.ifront'), lt, s + (sp.animDelay == null ? .25 : sp.animDelay));
  }
};

/* ring of screens around the camera */
OBJ.carousel = {
  build(c, sp) {
    const ring = document.createElement('div'); ring.className = 'o3 t3w'; c.appendChild(ring);
    const items = sp.items.map(it => it.kind === 'window' ? windowEl(ring, it.img) : phoneEl(ring, [it.view]));
    return { sp, el: ring, items };
  },
  update(inst, lt, C, st) {
    const sp = inst.sp, R = sp.radius || 1500, n = inst.items.length, step = 360 / n;
    const spin = lerp(0, sp.spinDeg == null ? 150 : sp.spinDeg, P(lt, 0, st.dur, E.io)) + (sp.spinOffset || 0);
    inst.items.forEach((el, i) => {
      const it = sp.items[i], th = (i * step + spin) * D2R, p = P(lt, .05 + i * (sp.stagger == null ? .07 : sp.stagger), 1.0, E.out5), r = R * (1 + (1 - p) * .8), isW = it.kind === 'window';
      pose3(el, { x: Math.sin(th) * r, y: (isW ? -10 : 20) + Math.sin(lt * w(1.1) + i) * 8 + (1 - p) * 500, z: -Math.cos(th) * r, ry: -th / D2R, s: isW ? (sp.windowScale || .7) : (sp.phoneScale || 1.05) });
      if (!isW && it.scroll) vset(el, it.view, { sc: P(lt, .5, 6, E.io) * Math.min(maxScroll(it.view), it.scroll) });
    });
  }
};

/* screens flying past along -z */
OBJ.tunnel = {
  build(c, sp) { return { sp, items: sp.items.map((it, i) => ({ it, i, side: i % 2 ? 1 : -1, el: it.kind === 'window' ? windowEl(c, it.img) : phoneEl(c, [it.view]) })) } },
  update(inst, lt) {
    const sp = inst.sp, sp0 = sp.spacing || 600;
    inst.items.forEach(({ it, i, side, el }) => {
      const isW = it.kind === 'window', z = (sp.z0 == null ? -300 : sp.z0) - sp0 * i;
      pose3(el, { x: side * (isW ? (sp.windowX || 960) : (sp.phoneX || 400)), y: (isW ? 0 : -30) + Math.sin(i * 1.7) * 70, z, ry: -side * (isW ? 24 : 20), rz: side * 2, s: 1 });
      if (!isW && it.scroll) vset(el, it.view, { sc: (lt * it.scroll) % Math.max(1, maxScroll(it.view)) });
    });
  }
};

/* ---------- camera ---------- */
// keys: [t, x, y, z, yaw°, pitch°, roll°, zoom]  (x relative to the station origin, t relative to the station start)
function hk(keys, lt) {
  const n = keys.length; if (lt <= keys[0][0]) return keys[0].slice(1); if (lt >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0; while (i < n - 2 && lt >= keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[i + 1], dt = k1[0] - k0[0], u = (lt - k0[0]) / dt;
  const a0 = keys[Math.max(0, i - 1)], b0 = keys[Math.min(n - 1, i + 1)], a1 = keys[i], b1 = keys[Math.min(n - 1, i + 2)];
  const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2; const out = [];
  for (let c = 1; c <= 7; c++) { const m0 = (b0[c] - a0[c]) / (b0[0] - a0[0]), m1 = (b1[c] - a1[c]) / (b1[0] - a1[0]); out.push(h00 * k0[c] + h10 * dt * m0 + h01 * k1[c] + h11 * dt * m1) }
  return out;
}
function whip(t) {
  const Wp = { yaw: 0, pitch: 0, roll: 0, zm: 1, blur: 0, ca: 0, flash: 0 };
  for (let k = 0; k < CFG.stations.length - 1; k++) {
    const o = CFG.stations[k].out; if (!o) continue; const c = ST[k + 1], dIn = o.in || .4, dOut = o.after || .45, d = o.dir || 1, kind = o.kind || 'yaw'; let m = 0, sg = 0;
    if (t >= c - dIn && t < c) { m = Math.pow((t - (c - dIn)) / dIn, 2.2); sg = 1 } else if (t >= c && t < c + dOut) { m = Math.pow(1 - (t - c) / dOut, 2.2); sg = -1 }
    if (m > 0) {
      if (kind === 'yaw') { Wp.yaw = sg * d * 85 * m; Wp.blur = 95 * m }
      else if (kind === 'zoom') { Wp.zm = 1 + 3.5 * m; Wp.blur = 0; Wp.ca = 0 }
      else { Wp.roll = sg * d * 75 * m; Wp.yaw = sg * d * 22 * m; Wp.blur = 40 * m }
      Wp.ca = Math.max(Wp.ca, 16 * m)
    }
    Wp.flash = Math.max(Wp.flash, Math.exp(-Math.abs(t - c) * 13) * (kind === 'zoom' ? .7 : .45));
  }
  return Wp;
}
function stationAt(t) { let si = 0; for (let i = 0; i < ST.length - 1; i++) if (t >= ST[i]) si = i; return si }
function beatPulse(t) {
  const b = CFG.beat; if (!b) return 0;
  if (!b.on.some(([a, c]) => t >= a && t < c)) return 0;
  return Math.exp(-((t / (60 / b.bpm)) % 1) * 5);
}
function camAt(t, withFx = true) {
  const si = stationAt(t), lt = t - ST[si], k = hk(CFG.stations[si].camera.keys, lt);
  const C = { x: k[0] + si * STX, y: k[1], z: k[2], yaw: k[3], pitch: k[4], roll: k[5], zoom: k[6], P: PCAM, si, lt };
  if (withFx) {
    const Wp = whip(t); C.yaw += Wp.yaw; C.roll += Wp.roll; C.zoom *= Wp.zm; C.W = Wp;
    const pu = beatPulse(t); C.P = PCAM * (1 - .07 * pu); C.zoom *= 1 + .012 * pu;
    let sh = 0; for (let i = 1; i < ST.length - 1; i++) { const d = t - ST[i]; if (d >= 0 && d < .7) sh = Math.max(sh, Math.exp(-d * 9)) }
    C.yaw += Math.sin(t * w(1.9)) * .35 + Math.sin(t * w(93)) * .5 * sh; C.pitch += Math.sin(t * w(1.3) + 1) * .25 + Math.cos(t * w(81)) * .5 * sh; C.roll += Math.sin(t * w(.9)) * .3 + Math.sin(t * w(67)) * .8 * sh;
    C.x += Math.sin(t * w(2.3)) * 4; C.y += Math.cos(t * w(1.7)) * 4;
    if (LP && CFG.loopCam) { const o = CFG.loopCam, a = 2 * Math.PI * t / LP; C.yaw += Math.sin(a) * (o.yaw || 0); C.pitch += Math.sin(a * 2 + 1) * (o.pitch || 0); C.roll += Math.sin(a + 2) * (o.roll || 0); C.x -= Math.sin(a) * (o.x || 0); C.y += Math.cos(a) * (o.y || 0); C.zoom *= 1 + Math.sin(a * 2) * (o.zoom || 0) }
  }
  return C;
}
function cam3(x, y, z, C) {
  const dx = x - C.x, dy = y - C.y, dz = z - C.z;
  const cy = Math.cos(C.yaw * D2R), sy = Math.sin(C.yaw * D2R); const x1 = dx * cy + dz * sy, z1 = -dx * sy + dz * cy;
  const cp = Math.cos(C.pitch * D2R), sp = Math.sin(C.pitch * D2R); const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
  const cr = Math.cos(C.roll * D2R), sr = Math.sin(C.roll * D2R); const x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;
  return [x3 * C.zoom, y3 * C.zoom, z2 * C.zoom];
}
function proj(v, C) { const d = C.P - v[2]; if (d < 60) return null; const s = C.P / d; return [W / 2 + v[0] * s, H / 2 + v[1] * s, s] }
function applyCam(C) {
  $('view').style.perspective = C.P + 'px';
  $('world').style.transform = `scale3d(${C.zoom},${C.zoom},${C.zoom}) rotateZ(${C.roll}deg) rotateX(${C.pitch}deg) rotateY(${C.yaw}deg) translate3d(${-C.x}px,${-C.y}px,${-C.z}px)`;
}

/* ---------- canvas effects ---------- */
let cv, cx, fgc, fx2;
const NP = 380; const PART = Array.from({ length: NP }, () => ({ x: (rnd() - .5) * 4800, y: (rnd() - .5) * 3000, z: (rnd() - .5) * 6000, r: 1.2 + rnd() * 3.2, a: .25 + rnd() * .6, ph: rnd() * 6.28 }));
const BOKEH = Array.from({ length: 16 }, () => ({ x: rnd(), y: rnd(), r: 30 + rnd() * 90, a: .04 + rnd() * .07, k: .3 + rnd() * 1.2, ph: rnd() * 6.28 }));
const SPD = Array.from({ length: 110 }, () => ({ a: rnd() * 6.283, r0: .12 + rnd() * .5, l: .1 + rnd() * .35, ph: rnd() }));
function seg(c, a, b, C) {
  let A_ = cam3(a[0], a[1], a[2], C), B_ = cam3(b[0], b[1], b[2], C); const zn = C.P - 80;
  if (A_[2] > zn && B_[2] > zn) return false;
  if (A_[2] > zn) { const u = (zn - B_[2]) / (A_[2] - B_[2]); A_ = B_.map((v, i) => v + (A_[i] - v) * u) }
  else if (B_[2] > zn) { const u = (zn - A_[2]) / (B_[2] - A_[2]); B_ = A_.map((v, i) => v + (B_[i] - v) * u) }
  const p = proj(A_, C), q = proj(B_, C); if (!p || !q) return false; c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); return true
}
function ring(x, y, z, R, C, col, lw, al) {
  cx.beginPath(); const N = 56; let any = false, pen = false;
  for (let i = 0; i <= N; i++) { const a = i / N * 6.2832; const v = cam3(x + Math.cos(a) * R, y + Math.sin(a) * R, z, C); const p = proj(v, C); if (!p) { pen = false; continue } if (!pen) { cx.moveTo(p[0], p[1]); pen = true } else cx.lineTo(p[0], p[1]); any = true }
  if (!any) return; cx.strokeStyle = col; cx.lineWidth = lw; cx.globalAlpha = al; cx.stroke()
}
function glow(x, y, z, R, al, C, col = '69,189,92') {
  const v = cam3(x, y, z, C), p = proj(v, C); if (!p) return; const r = R * p[2];
  const g = cx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r); g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${col},0)`); cx.fillStyle = g; cx.fillRect(p[0] - r, p[1] - r, 2 * r, 2 * r)
}
function bgDraw(t, C, Cp) {
  const pu = beatPulse(t), S = CFG.stations[C.si];
  cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over'; cx.clearRect(0, 0, W, H);
  const g = cx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#08120b'); g.addColorStop(.6, '#050906'); g.addColorStop(1, '#040704'); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  cx.globalCompositeOperation = 'lighter';
  const si = C.si, ox = si * STX;
  let gi = 0; for (const [x, y, z, R, a] of S.glows || []) { const sw = LP && CFG.loopCam ? Math.sin(2 * Math.PI * t / LP + gi * 2.1) * 260 : 0; glow(ox + x + sw, y, z, R, a * (1 + pu * .25) * (LP ? 1 + .18 * Math.sin(2 * Math.PI * t / LP + gi) : 1), C); gi++ }
  if (S.floor !== false) {
    const gs = 240, FY = S.floorY == null ? 520 : S.floorY, cxs = Math.round(C.x / gs) * gs, czs = Math.round(C.z / gs) * gs;
    cx.lineWidth = 1.6;
    for (let pass = 0; pass < 2; pass++) {
      cx.beginPath();
      for (let i = -20; i <= 20; i++) { const x = cxs + i * gs; const major = ((Math.round(x / gs)) % 5 + 5) % 5 === 0; if (major !== !!pass) continue; seg(cx, [x, FY, czs - 7200], [x, FY, czs + 1600], C) }
      for (let j = -30; j <= 7; j++) { const fo = LP ? ((t / LP * (CFG.loopFloor == null ? 3 : CFG.loopFloor)) % 1) * gs : 0; const z = czs + j * gs + fo; const major = ((Math.round(czs / gs) + j) % 5 + 5) % 5 === 0; if (major !== !!pass) continue; seg(cx, [cxs - 4800, FY, z], [cxs + 4800, FY, z], C) }
      cx.strokeStyle = pass ? 'rgba(140,255,165,1)' : 'rgba(111,242,139,1)'; cx.globalAlpha = (pass ? .34 : .17) * (1 + pu * .5) * (S.floorBoost || 1); cx.stroke();
    }
  }
  cx.globalAlpha = 1;
  const R_ = [], rg = S.rings;
  if (rg && rg.kind === 'tunnel') for (let i = 0; i < rg.count; i++) { const z = (rg.z0 == null ? -100 : rg.z0) - i * rg.spacing; const fl = rg.flicker === false ? 1 : .55 + .45 * Math.sin(t * w(6) + i * 1.7); R_.push([0, 0, z, rg.radius + (rg.jitter ? (i % 3) * rg.jitter : 0), rg.flicker === false ? (rg.alpha || .5) : .55 * fl + .15, rg.lw || 3]) }
  if (rg && rg.kind === 'burst') for (let k = 0; k < rg.count; k++) { const u = C.lt - (rg.delay || .1) - k * .22; if (u < 0) continue; const p = P(u, 0, 2.2, E.out3); R_.push([0, 0, -40 - k * 30, 300 + p * 2200, (1 - p) * .8, 4]) }
  for (const [x, y, z, r, a, lw] of R_) ring(ox + x, y, z, r, C, 'rgba(111,242,139,1)', lw, a * (1 + pu * .4));
  const bx = 4800, by = 3000, bz = 6000;
  for (const p of PART) {
    const wx = (((p.x - C.x + bx / 2) % bx) + bx) % bx - bx / 2 + C.x, wy = (((p.y - C.y + by / 2) % by) + by) % by - by / 2 + C.y, wz = (((p.z - C.z + bz / 2) % bz) + bz) % bz - bz / 2 + C.z;
    const v = cam3(wx, wy, wz, C), q = proj(v, C); if (!q) continue;
    const tw = .55 + .45 * Math.sin(t * w(1.7) + p.ph); const r = Math.max(.6, p.r * q[2]);
    const vp = cam3(wx, wy, wz, Cp), qp = proj(vp, Cp);
    cx.globalAlpha = Math.min(1, p.a * tw * (.7 + pu * .5)); cx.strokeStyle = cx.fillStyle = 'rgb(140,255,165)';
    const dd = qp ? Math.hypot(q[0] - qp[0], q[1] - qp[1]) : 0;
    if (qp && dd > 3 && dd < 900) { cx.lineWidth = r * 1.3; cx.beginPath(); cx.moveTo(qp[0], qp[1]); cx.lineTo(q[0], q[1]); cx.stroke() }
    else { cx.beginPath(); cx.arc(q[0], q[1], r, 0, 6.283); cx.fill() }
    if (p.r > 3 && q[2] < 2) { cx.globalAlpha = .06 * tw; cx.beginPath(); cx.arc(q[0], q[1], r * 5, 0, 6.283); cx.fill() }
  }
  cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
}
function fgDraw(t, C, Cp) {
  const sc = Math.min(W / 1920, H / 1080);
  fx2.clearRect(0, 0, W, H); fx2.globalCompositeOperation = 'lighter';
  const pu = beatPulse(t);
  const sp = Math.hypot(C.x - Cp.x, C.y - Cp.y, C.z - Cp.z) / (Math.max(.001, C.t_ - Cp.t_));
  const f = clamp((sp - 700) / 1400);
  if (f > .02) for (const s of SPD) {
    const ph = ((t * 3 + s.ph) % 1); const r0 = (s.r0 + ph * .6) * 1100 * sc, r1 = r0 + s.l * f * 900 * sc;
    const ca = Math.cos(s.a), sa = Math.sin(s.a); fx2.strokeStyle = `rgba(180,255,200,${.5 * f * (1 - ph)})`; fx2.lineWidth = 2;
    fx2.beginPath(); fx2.moveTo(W / 2 + ca * r0 * 1.5, H / 2 + sa * r0); fx2.lineTo(W / 2 + ca * r1 * 1.5, H / 2 + sa * r1); fx2.stroke()
  }
  for (const b of BOKEH) {
    const x = ((b.x * (W + 280) - C.yaw * b.k * 26 - C.x * .05 * b.k + (LP ? 0 : t * 12 * b.k)) % (W + 280) + (W + 280)) % (W + 280) - 140, y = b.y * (H + 100) - 100 - C.pitch * b.k * 14 + Math.sin(t * w(.5) + b.ph) * 30; const br = b.r * sc;
    const g = fx2.createRadialGradient(x, y, 0, x, y, br); g.addColorStop(0, `rgba(111,242,139,${b.a * (1 + pu * .8)})`); g.addColorStop(.7, `rgba(111,242,139,${b.a * .5})`); g.addColorStop(1, 'rgba(111,242,139,0)');
    fx2.fillStyle = g; fx2.fillRect(x - br, y - br, br * 2, br * 2)
  }
  const Wp = C.W || { flash: 0 }; const sa = Math.max(pu * .1, Wp.flash * .5);
  if (sa > .01) { const g = fx2.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(111,242,139,0)'); g.addColorStop(.5, `rgba(190,255,210,${sa})`); g.addColorStop(1, 'rgba(111,242,139,0)'); fx2.fillStyle = g; fx2.fillRect(0, H / 2 - 3, W, 6); fx2.fillRect(0, H / 2 - 1, W, 2) }
  fx2.globalCompositeOperation = 'source-over';
}

/* ---------- build + master ---------- */
function build() {
  const world = $('world');
  CFG.stations.forEach((st, i) => {
    const c = document.createElement('div'); c.className = 'stn'; c.style.transform = `translate3d(${i * STX}px,0,0)`; world.appendChild(c); SE[i] = c;
    SO[i] = (st.objects || []).map(sp => { const T = OBJ[sp.type]; if (!T) throw new Error('unknown object type ' + sp.type); const inst = T.build(c, sp); inst.T = T; return inst });
  });
}
function renderFrame(t) {
  t = clamp(t, 0, DUR - 1e-6);
  const C = camAt(t), Cp = camAt(Math.max(ST[C.si], t - .045)); C.t_ = t; Cp.t_ = Math.max(ST[C.si], t - .045);
  for (let i = 0; i < SE.length; i++) SE[i].style.display = i === C.si ? 'block' : 'none';
  const st = { dur: CFG.stations[C.si].dur };
  for (const inst of SO[C.si]) inst.T.update(inst, C.lt, C, st);
  applyCam(C); bgDraw(t, C, Cp); fgDraw(t, C, Cp);
  const Wp = C.W, wrap = $('fxw');
  if (Wp.blur > .4 || Wp.ca > .4) { $('fxb').setAttribute('stdDeviation', `${Wp.blur.toFixed(2)} 0`); $('fxr').setAttribute('dx', (-Wp.ca).toFixed(2)); $('fxbl').setAttribute('dx', Wp.ca.toFixed(2)); wrap.style.filter = 'url(#fx)' }
  else wrap.style.filter = 'none';
  const showLegend = CFG.legend && CFG.stations[C.si].legend !== false;
  $('legend').style.opacity = showLegend ? .9 * P(C.lt, .3, .5) : 0;
  $('flash').style.opacity = Wp.flash;
  $('grain').style.transform = `translate(${(rnd() * 100) | 0}px,${(rnd() * 100) | 0}px)`;
  const fd = CFG.fade || { in: .3, out: .95 };
  $('fade').style.opacity = (fd.in ? 1 - P(t, 0, fd.in, E.lin) : 0) + (fd.out ? P(t, DUR - fd.out - .05, fd.out, E.lin) : 0);
}

async function init() {
  CFG = window.__SCENE__ || await (await fetch(Q.get('scene') || '../scenes/promo-60s.json')).json();
  LP = +CFG.loop || 0;
  const F = CFG.format || {}; W = F.w || 1920; H = F.h || 1080; FPS = F.fps || 30; STX = CFG.stationX || 14000; PCAM = CFG.perspective || 1500;
  document.documentElement.style.setProperty('--W', W + 'px'); document.documentElement.style.setProperty('--H', H + 'px');
  ST = [0]; CFG.stations.forEach(s => ST.push(ST[ST.length - 1] + s.dur)); DUR = ST[ST.length - 1];
  for (const id of ['bg', 'fg']) { $(id).width = W; $(id).height = H }
  cv = $('bg'); cx = cv.getContext('2d'); fgc = $('fg'); fx2 = fgc.getContext('2d');
  (function () { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const d = x.createImageData(256, 256); for (let i = 0; i < d.data.length; i += 4) { const v = rnd() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255 } x.putImageData(d, 0, 0); $('grain').style.backgroundImage = `url(${c.toDataURL()})` })();
  $('legend').textContent = CFG.legend || '';
  await loadImages(neededImages(CFG));
  build();
  window.SCENE_INFO = { w: W, h: H, fps: FPS, dur: DUR, stations: CFG.stations.map((s, i) => ({ id: s.id, start: ST[i], dur: s.dur })) };
  await document.fonts.ready;
  if (Q.get('t') != null) renderFrame(parseFloat(Q.get('t')));
}
window.renderFrame = renderFrame;
window.ready = init();
})();
