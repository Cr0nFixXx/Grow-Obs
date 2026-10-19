# Promo engine – scene format reference

The engine (`engine/`) turns a **scene JSON** into a deterministic animation: a CSS-3D world (phones, browser windows, 3D text)
seen through a virtual camera, plus canvas effects (floor grid, rings, particles, speed lines, film grain, vignette).
`window.renderFrame(t)` draws second `t`; it is a pure function of `t` (except film grain), so frames can be rendered in any order,
in parallel, and resumed. Nothing is recorded in real time.

```
engine/index.html   page shell (loads fonts.css, engine.css, engine.js)
engine/engine.js    scene loader, camera, objects, effects, renderFrame(t), window.ready (Promise)
engine/engine.css   phone/window/text/tag styling
engine/fonts.css    offline Inter + Space Grotesk (latin, latin-ext) in engine/fonts/
```

## Run it
* **Headless (normal path):** `tools/render.mjs`, `tools/still.mjs` (they inject the scene via `window.__SCENE__`).
* **In a browser:** serve the kit root (`npx http-server .` or `python3 -m http.server`) and open
  `engine/index.html?scene=../scenes/promo-60s.json&assets=../screenshots/&t=12.5` (`t` = show one frame; without it the scene stays on t=0
  until you call `renderFrame(t)` in the console). The stage has the fixed pixel size of `format` (not responsive): use a browser window of that size or zoom out. Works from `file://` only with `window.__SCENE__` injected (fetch is blocked).

## Scene (top level)
| key | meaning |
|---|---|
| `format` | `{w,h,fps}` – any size (1920×1080, 1080×1920, 1080×1080, 1080×1350 are used) |
| `stations[]` | the timeline: stations play one after another, each `dur` seconds (total = sum of `dur`) |
| `stationX` | world distance between stations (default 14000) – keeps stations out of each other's view |
| `perspective` | CSS-3D perspective in px (default 1500) |
| `legend` | text shown bottom-center (we use `Screens mit Demo-Daten`); a station can hide it with `legend:false` |
| `fade` | `{in,out}` seconds of black at start/end (`0` = none; stills use 0) |
| `beat` | `{bpm, on:[[from,to],…]}` – time ranges where the scene "pulses" to the beat (camera zoom, glow) |
| `audio` | cue map for `audio/audio.py` (see below). Indices refer to `stations[]` |
| `loop` | seconds. Enables **loop mode**: every periodic motion (float, handheld drift, twinkle) snaps to whole cycles per period and particle drift is off, so `renderFrame(t)` ≈ `renderFrame(t + loop)` (only film grain differs). Use for seamless GIF/MP4 loops (`tools/loop.sh`); station time must be past all `enter` animations. Extra loop-only fields: scene `loopCam {yaw,pitch,roll,x,y,zoom}` (camera orbit amplitudes), `loopFloor` (floor-grid cells scrolled per loop, default 3); `pose.sway` (± degrees of wobble), `pose.float` (bob amplitude), phone `loopScroll` (px the screen scrolls down and back). Glows drift automatically when `loopCam` is set. |
| `meta` | free-form notes |

## Station
```jsonc
{ "id": "diary", "dur": 6.857,
  "camera": { "keys": [[t, x, y, z, yaw, pitch, roll, zoom], …] },   // station-local seconds, smooth interpolation
  "glows":  [[x, y, z, radius, alpha], …],                            // soft green light blobs
  "rings":  { "kind": "tunnel", "count": 16, "spacing": 520, "z0": -100, "radius": 520, "jitter": 30 }  // or {"kind":"burst","count":5,"delay":.1}
  "floorBoost": 1.3,                                                  // brighter/faster floor grid
  "out":    { "kind": "yaw|zoom|roll", "dir": 1, "in": .4, "after": .45 },  // transition into the next station (motion blur whip)
  "legend": false,                                                    // hide the legend in this station
  "objects": [ … ] }
```
Camera keys: `x,y,z` world position, `yaw` (+ = camera turns right), `pitch` (+ = looks up), `roll` degrees, `zoom` multiplier.
World units ≈ CSS px at z=0; +z is toward the camera, −z away. The world transform is
`scale(zoom) rotateZ(roll) rotateX(pitch) rotateY(yaw) translate3d(-x,-y,-z)`.

## Objects (`stations[].objects[]`)
Common: `pose` = `{ at:[x,y,z], rot:[rx,ry,rz], s: scale, float: 1, floatPhase: n, enter:{ start, dur, from:{x,y,z,rx,ry,rz} } }`.
`enter` animates from the offset pose to the final pose (spring-ish ease). All times are station-local seconds.

| type | fields | notes |
|---|---|---|
| `phone` | `views:[name,…]`, `pose`, `scroll`, `behavior`, `behaviorOpts` | `views` = names in `screenshots/mobile/` without suffix (`dash`, `grows`, `growdetail`, `forum`, `feed`, `calc`, `sim`, `strains`, `market`, `hall`, `wiki`, `drawer`, `drawer2`, `chat`). Several views = auto scroll/crossfade through the tall screenshot (`<name>-t.jpg`), `scroll` = px offset. Phone body 414×868. |
| `phone` + `behavior:"chat"` | `behaviorOpts.times:[…]` | blank chat frame + 5 message bubbles popping in at those times (`parts/chat-m0..4.png`) |
| `phone` + `behavior:"pwa"` | `behaviorOpts` (timings) | choreographed edge-swipe → drawer → scroll → "App installieren" highlight |
| `window` | `img`, `pose`, `cursor`, `cards` | `img` = name in `screenshots/desktop/` without `d-` (`dashboard`, `grows`, `growdetail`, `strains`, `calc`, `sim`, `forum`, `feed`, `hall`, `market`, `wiki`, `chat`). Browser chrome is drawn by the engine. `cards` = "exploded dashboard": rectangles `[x,y,w,h]` of the screenshot that fly out in z. `cursor` = animated mouse pointer with click ripples. |
| `text` | `plain`, `html`, `size`, `at`, `start`, `dur`, `out`, `layers`, `step`, `rxs`, `role:"kicker"` | extruded 3D headline (`layers` = depth slices). `html` may use `<span class="g">` for the green accent. `role:"kicker"` = small tracked label, no extrusion. |
| `tag` | `text`, `at`, `start`, `dx`, `out` | floating pill with green dot; place it in empty screen areas (it is semi-transparent) |
| `emoji` | `char`, `start`, `x`, `dur`, `y0`, `rise` | floats upward and fades (needs Noto Color Emoji on Linux) |
| `icon` | `at`, `size`, `start`, `spin`, `rzSpin`, `spinDur`, `animDelay` | the real app icon artwork (leaf + crease), extruded, with draw-in animation |
| `carousel` | `radius`, `spinDeg`, `spinOffset`, `windowScale`, `phoneScale`, `items:[{kind:"window",img}|{kind:"phone",view,scroll}]` | ring of screens around the camera |
| `tunnel` | `spacing`, `z0`, `windowX`, `phoneX`, `items` | screens streaming past the camera (hyperflight) |

Screenshot naming (all under `screenshots/`): `mobile/<key>-f.jpg` = viewport frame 390×844 @2x; `mobile/<key>-t.jpg` = tall page (for scrolling);
`desktop/d-<key>.jpg` = 1440×900 @1.5x (2160×1350); `parts/` = chat helpers. A missing `-t` file is tolerated (one benign
`ERR_FILE_NOT_FOUND`, filtered in `tools/lib.mjs`). A missing `-f` file logs `missing asset`.

## Audio cues (`audio` block)
`{ "bpm":140, "drop":1, "breakdown":6, "finale":7, "outro":8, "rolls":[3,5,7,8], "hats16":3, "arps":2, "stabs":[5,7] }`
(`hats16`, `arps`, `stabs` optional.) `audio/audio.py --scene <json> --out music.wav` synthesizes an E-minor track whose length is the sum of the
station durations: build-up until `drop`, full groove until `outro`, a one-bar dropout at `breakdown`, snare rolls before every station listed in
`rolls`, stabs at `stabs`, bells in the outro. For the music to hit the cuts, make station durations a multiple of one bar
(`4 × 60 / bpm` s; 140 BPM → 1.714 s). Deterministic (seeded); ~6 s to run.

## Recipes
* **New 15 s teaser:** copy `tools/gen-hero.mjs` or `scenes/hero-devices-16x9.json`, change `dur` (e.g. 3 stations × 5 s), edit `camera.keys` and objects,
  `node tools/render.mjs --scene scenes/teaser.json --out ~/.cache/pm/frames`, then mux (see `tools/build.sh`, it takes `SCENE=`/`OUT=`).
* **New hero still:** add a layout to `LAYOUTS` in `tools/gen-hero.mjs` → `node tools/gen-hero.mjs && bash tools/stills.sh`.
  Static camera (two identical keys), `fade {in:0,out:0}`, render at t=3.5 (all enter animations are finished).
* **Check a frame fast:** `node tools/still.mjs --scene scenes/promo-60s.json --t 6.3,16,30 --out ~/.cache/pm/test` then `python3 tools/sheet.py sheet.jpg ~/.cache/pm/test/*.jpg`.
* **New screenshots:** see README → "Re-capturing screenshots".

## Gotchas learned the hard way
* Zoom > 1.05 with 3D titles high up clips the headline at the frame top → lower camera `y` or lower `zoom`.
* Overlay pills (`tag`) show the screenshot text through them → put them where the screen is empty.
* `-webkit-box-reflect` on `preserve-3d` is unreliable (no floor reflections); real WebGL is too slow without a GPU (not used).
* Chromium can crash ("Target crashed") in long renders on ≤ 2 GB RAM: `render.mjs` retries with a fresh page and skips finished frames; keep ≤ 2 workers.
* Frames/temporary files belong **outside** the repo (`PM` env, default `~/.cache/pm`): 1800 JPGs ≈ 150 MB.
