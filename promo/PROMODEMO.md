# PROMODEMO.md

Documentation of the **Grow|Observer promo demo video**: what it shows, how it is built, and how to rebuild or change it.

- **Status:** test demo (first iteration). Not final marketing material.
- **Result:** `promo/GrowObserver-Promo.mp4` – 44 s, 1920×1080, 30 fps, H.264 + AAC stereo, about 27 MB.
- **Nothing here touches the app code.** The video is built from screenshots of the running app (mock mode) and an HTML motion-graphics scene.

---

## 1. Summary

| Item | Value |
|---|---|
| Format | 16:9, 1920×1080, 30 fps, 1320 frames |
| Length | 44.0 s (88 beats at 120 BPM) |
| Image source | real screenshots of the app (dark theme, mock data), app icon from `public/icon.svg` |
| Motion graphics | one HTML page (`scene.html`) whose whole look is a pure function of time: `renderFrame(t)` |
| Rendering | headless Chromium (Playwright) screenshots every frame; ffmpeg encodes |
| Music | synthesized with numpy/scipy (`audio.py`), no samples, no third-party material |
| Language | German on screen (matches the app UI); this document is English |
| Build time | about 1 min for frames + 5 s audio + 40 s encoding on 2 CPU cores |

Everything is reproducible from source with `bash promo/build.sh`.

---

## 2. Files

| Path | Purpose | In git |
|---|---|---|
| `PROMODEMO.md` | this document | yes |
| `GrowObserver-Promo.mp4` | the rendered video | yes |
| `scene.html` | the entire animation (HTML + CSS + JS, 8 scenes, background canvas, wipes) | yes |
| `assets/*.jpg` | screenshots used by the scene (16 desktop `d-*.jpg` at 2880×1800, 4 mobile `m-*.jpg` at 1170×2532; `d-communities`, `d-planner`, `d-grows` and `m-profile` are captured but not used yet) | yes |
| `audio.py` | music synthesis → `music.wav` | yes |
| `render.mjs` | frame renderer (`node promo/render.mjs <first> <end> <dir> [step] [quality]`) | yes |
| `preview.mjs` | renders single still frames at given times (`node promo/preview.mjs 1,5.5,12` → `promo/test/`) | yes |
| `capture.mjs` | records the raw screenshots from a running dev server → `promo/shots/` | yes |
| `make-assets.py` | converts `shots/*.png` to `assets/*.jpg` | yes |
| `build.sh` | full pipeline: frames → music → mp4 | yes |
| `setup-libs.sh` | sandbox-only helper: Chromium system libraries and emoji font without root | yes |
| `sheet.py` | contact-sheet helper for reviewing preview stills | yes |
| `music.wav` | generated audio | no (ignored) |
| `shots/`, `test/`, `.frames/`, `syslibs/` | generated or sandbox-only | no (ignored) |

`promo/.gitignore` lists the ignored paths. The emoji font lives in `~/.fonts` (outside the repo).

---

## 3. Storyboard

Cuts sit on beats (multiples of 0.5 s). Scene changes use a diagonal green wipe whose midpoint is the cut time, except at 34.0 s (white flash cut).

| Time | Scene | On screen | Screenshots / assets | Sound |
|---|---|---|---|---|
| 0.0–3.0 | **S0 Intro** | Icon pops in, leaf is drawn as a stroke then filled, green status dot, ring pulse, wordmark “Grow\|Observer” rises letter by letter, kicker “Tagebuch · Community · Kosten · KI” | `public/icon.svg` paths (inlined) | soft impact at 0.12 s, four rising plucks, noise riser into 3.0 s |
| 3.0–7.0 | **S1 Kinetic type** | “Dein Grow.” (3.0 s), “Dein Tagebuch.” (4.0 s), “Deine Community.” (5.0 s, green) slam in with blur, glow flash and shake-free scale | – (ghost leaf outline in the background) | impact at 3.0, kick starts, bass slams on 3/4/5, hats from 4.0, claps from 5.0 |
| 7.0–12.0 | **S2 Dashboard** | “Alles auf einen Blick.”; browser window rises with 3D tilt, slow pan down; three callouts: “Aktive Grows”, “KI-Empfehlung für heute”, “Klima live” | `d-dashboard` | impact at 7.0, full groove: kick, clap, hats, bass line, arpeggio |
| 12.0–16.0 | **S3 Tagebuch** | “Jeder Tag. Dokumentiert.” + sub text; tilted window from the right; callouts “Phase: Blüte”, “Tag 64 / 98”, “94 % Gesundheit” | `d-growdetail` | impact at 12.0 |
| 16.0–20.0 | **S4 KI-Assistent** | “Frag die KI. Statt zu raten.”; window from the left; pills Grow Mentor, Mixture-of-Erd's, Klima-Wächter, Kosten-Optimierer (agent names from the UI) | `d-ai` | impact at 16.0 |
| 20.0–24.0 | **S5 Zahlen** | “Zahlen statt Bauchgefühl.”; two overlapping tilted windows (calculator front-left, simulation back-right) | `d-calc`, `d-sim` | impact at 20.0 |
| 24.0–29.0 | **S6 Community** | “Von Growern. Für Grower.”; three windows fan out (feed left, hall of fame right, forum centre); pills Forum, Community-Feed, Chat, Marktplatz, Hall of Fame | `d-feed`, `d-hall`, `d-forum` | impact at 24.0 |
| 29.0–34.0 | **S7 Mobile** | “Läuft wie eine App.”; three phones rise with floating motion; pills PWA, Touch-Gesten, Offline-Shell | `m-grows`, `m-dashboard`, `m-forum` | impact at 29.0, snare roll 32.0–34.0 |
| 34.0–38.0 | **S8 Rapid fire** | eight full-bleed crops, one per beat, with a huge word and progress bar: TAGEBUCH, SORTEN, BREEDER, WIKI, FORUM, CHAT, MARKTPLATZ, HALL OF FAME | `d-growdetail`, `d-strains`, `d-breeders`, `d-wiki`, `d-forum`, `d-chat`, `d-market`, `d-hall` | big impact at 34.0, rising chord stabs on every beat, 16th hats |
| 38.0–44.0 | **S9 Outro** | icon and wordmark again, claim “Grow beobachten. Besser wachsen.”, pills PWA / Self-hosted / Community, footer “Ruderalis 0.1.1 · in Entwicklung”, fade to black from 43.3 s | icon | impact at 38.0, half-time kick, bell arpeggio, fade-out |

Wipe times: 3, 7, 12, 16, 20, 24, 29, 38 s (`WIPES` in `scene.html`). Flash times: every beat from 34.0 to 37.5 s (`FLASH`).

---

## 4. How the scene works (`scene.html`)

### 4.1 Deterministic time
The page exposes `window.renderFrame(t)` (seconds) and a promise `window.ready` (fonts and images decoded). Nothing runs on its own: no CSS transitions, no `requestAnimationFrame`. `render.mjs` calls `renderFrame(frame / 30)` and takes a screenshot. Any frame can therefore be rendered alone, in any order, on any machine (this is also why two Chromium workers can render the two halves in parallel).

### 4.2 Structure
- `#stage` is a fixed 1920×1080 box. Layers (z-order): background canvas, scenes `#s0`–`#s9` (only the active one is `display:block`), wipes (`#wipeA/B/C`), flash, vignette, fade-to-black.
- **Background** (`bg(t)`): a canvas drawing a dark green gradient, two drifting glows, a perspective grid floor and 110 seeded particles. Everything pulses on the beat (`exp(-frac(t*2)*4)`) from 3 s on.
- **Scenes** are the array `SC = [[id, start, end], …]` and the update table `U` (`U.s2(lt)` etc., `lt` = time inside the scene). `renderFrame` shows the active scene and calls its update function.
- **Windows** (`mkWin`) are 1440×936 px browser mock-ups (title bar plus a 1440×900 screenshot as CSS background). They are placed at native size and scaled with `transform` (perspective, `rotateX/Y/Z`, `scale`) via `setW`. **Phones** (`.phone`, `setPh`) are 418×872 px bezels with a 390×844 screen.
- **Callout chips** (`mkChip`) live inside the window's wrapper, so they move and tilt with it. They are positioned in screenshot coordinates (x, y of the UI element in the 1440×900 shot; the 36 px title bar is added automatically).

### 4.3 Declarative reveal attributes
Inside a scene, three data attributes animate elements without custom code (`generic()`):

| Attribute | Effect | Value |
|---|---|---|
| `data-r="0.2"` | text line slides up out of a mask | start time in seconds (scene time) |
| `data-f="0.9"` | fade in and rise by 34 px | start time |
| `data-p="1.4"` | pill pops with overshoot | start time |

### 4.4 Easing and helpers
`P(lt, start, duration, ease)` returns eased progress 0…1. Easings in `E`: `lin`, `out3`, `out5`, `io` (in-out cubic), `back` (overshoot), `expo`. `fl(t, k)` is a gentle floating offset. `rnd` is a seeded random generator, so particles are identical on every render.

### 4.5 Intro icon
`iconSVG()` inlines the paths of `public/icon.svg`. `animIcon()` scales the gradient square with overshoot, draws the leaf outline using `stroke-dashoffset` (length from `getTotalLength()`), then fades the fill in, then the crease and the status dot.

### 4.6 Rapid-fire scene
S8 shows one cropped full-bleed screenshot per beat (`FF` list). The crop removes the sidebar and top bar: the image is translated by `-272·s` px horizontally and scaled by `s ≈ 1.644` so the 1168 px content area fills 1920 px. A slow push-in and alternating drift give motion.

### 4.7 Fonts
Space Grotesk and Inter are loaded from Google Fonts at render time (the same fonts as the app). `window.ready` waits until they are loaded. An offline render therefore needs the two families installed locally or a copy of the CSS.

---

## 5. Music (`audio.py`)

Fully synthesized, 44.1 kHz stereo, 120 BPM (beat = 0.5 s), A minor, chord loop **Am – F – C – G** (one chord per 2 s bar). A fixed random seed makes the output identical on every run.

| Voice | Method | Where |
|---|---|---|
| Kick | sine with exponential pitch drop 155→45 Hz, click | every beat 3–38 s, half-time 38–42 s |
| Clap | band-passed noise, three short bursts | beats 2 and 4 from 5 s, every beat 34–38 s, roll 32–34 s |
| Hats | high-passed noise, closed and open | off-beats from 4 s, 16ths 34–38 s |
| Bass | saw + sub sine, low-passed, per-note envelope | slams at 3/4/5 s, 8th-note line 7–38 s, long notes in the outro |
| Arpeggio | detuned saws with a closing filter, 16th notes | 7–34 s, brightening over time |
| Stabs | three-note chord plucks | every beat 34–38 s, rising |
| Bells | plucks with long decay | 38–43 s |
| Pad | three detuned saws per note, low-passed, slow attack | whole track, ducked by the kick (sidechain curve) |
| Risers / impacts | band-passed noise sweep + sine rise; sub boom + noise crash | before and on every scene cut |
| Reverb | synthetic noise impulse response (2.2 s), convolved once per channel | pad, plucks, claps, impacts |

Master: 25 Hz high-pass, soft clipping (`tanh`), peak normalised to 0.89, 0.25 s fade-in, 1.2 s fade-out so the audio ends with the video fade.

**Changing the length or cut times** means changing both worlds: `SC`, `WIPES`, `FLASH` in `scene.html` and the time lists in `audio.py` (`kicks`, `riser(...)`, the impact list). Keep cuts on multiples of 0.5 s so they land on the beat.

---

## 6. Rebuilding from scratch

### 6.1 Requirements
- Node 20+ and the repo dependencies (`npm ci` in the repo root; this installs Playwright).
- Chromium for Playwright: `npx playwright install chromium`.
- Python 3 with `numpy`, `scipy`, `Pillow`, and `imageio-ffmpeg` (`pip install imageio-ffmpeg`; it bundles an ffmpeg binary, no system ffmpeg needed).
- Network access during rendering (Google Fonts).

In minimal containers, Chromium may fail with `error while loading shared libraries`. Run `bash promo/setup-libs.sh` once (no root needed); `build.sh` then picks up `promo/syslibs` automatically.

### 6.2 Rebuild the video only (screenshots unchanged)
```bash
bash promo/build.sh          # frames (2 workers) -> promo/music.wav -> promo/GrowObserver-Promo.mp4
```
Environment variables: `OUT` (output path), `TOTAL_FRAMES` (default 1320).

### 6.3 Re-record the screenshots (after UI changes)
```bash
npx vite --host 0.0.0.0 --port 5173        # MOCK mode: no NEXT_PUBLIC_API_URL / VITE_API_URL set
node promo/capture.mjs                     # writes promo/shots/*.png (needs the dev server)
python3 promo/make-assets.py               # PNG -> promo/assets/*.jpg
bash promo/build.sh
```
`capture.mjs` skips the onboarding, logs in with the pre-filled mock credentials, waits for the count-up animations and toast to finish (6.5 s), then visits each view through the sidebar (desktop, 1440×900 at 2×) and the bottom navigation (mobile, 390×844 at 3×, touch). Set `BASE_URL` to use another host. The dev server may be stopped afterwards; it is not needed for rendering.

### 6.4 Quick review while editing
```bash
node promo/preview.mjs 1,5.5,12,34.25      # stills in promo/test/t1.jpg, t5_5.jpg, ...
python3 promo/sheet.py promo/sheet.jpg 1,5.5,12,34.25   # optional contact sheet (2 columns)
```
A single still takes well under a second, so layout work does not need a full render. If chip positions or text need adjusting, change `scene.html` and re-run the preview.

---

## 7. Resource notes (2 CPU cores, 2 GB RAM sandbox)

- Frame rendering uses two Chromium workers (frames 0–659 and 660–1319) writing JPEGs at quality 90. About 1 min in total.
- ffmpeg with default x264 settings was killed by the out-of-memory killer once while other processes (a dev server) were running. `build.sh` therefore uses `-preset faster -threads 2 -x264-params rc-lookahead=10:ref=2:bframes=2`. Stop dev servers before encoding.
- The sandbox snapshot does not keep `node_modules`, `~/.cache` (Playwright browsers) or pip packages. After a sandbox reset: `npm ci`, `npx playwright install chromium`, `pip install imageio-ffmpeg`, and `bash promo/setup-libs.sh` if Chromium reports missing libraries.
- Frames are intermediate output (`promo/.frames/`, about 100 MB) and are deleted by `build.sh`.

---

## 8. Content rules and honesty notes

- **All app content is mock data** (demo user “Max Grünfeld”, demo grows, demo prices). The screenshots come from the app in mock mode, because the API mode shows honest empty states instead.
- **No invented numbers.** The login page of the mock mode shows hero figures such as “12.400 Grower” and “98 % KI-Treffer”. They are placeholders and are intentionally **not** shown or claimed anywhere in the video.
- **AI scene:** it shows the real assistant UI and its agent names, but the AI backend is not connected yet (see `TODO.md`). Remove or relabel scene S4 if that must not be advertised.
- **Version text:** the outro footer “Ruderalis 0.1.1 · in Entwicklung” is hard-coded in `scene.html` (`#s9`). It is not read from `version.json`; update it by hand when the owner assigns a new version.
- **Features named in pills** (PWA, Touch-Gesten, Offline-Shell, Self-hosted, Dark & Light) exist in the app. “Offline-Shell” means the cached app shell, not full offline operation.
- **Avatar and images** in the screenshots are the demo assets of the mock data; no third-party personal data is shown.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `error while loading shared libraries: libnspr4.so` | Chromium system libraries missing | `bash promo/setup-libs.sh` |
| Emoji appear as empty boxes in screenshots | no colour-emoji font | `setup-libs.sh` installs Noto Color Emoji into `~/.fonts` |
| Chromium still reports a missing `.so` although `promo/syslibs/` exists | the folder was restored from a snapshot without its symlinks | `rm -rf promo/syslibs && bash promo/setup-libs.sh` |
| `Executable doesn't exist … chrome-headless-shell` | Playwright browser not installed (it lives in `~/.cache`, not in the repo) | `npm ci && npx playwright install chromium` |
| `build.sh`: `FFMPEG=` empty / `No module named imageio_ffmpeg` | pip packages lost after sandbox reset | `pip install imageio-ffmpeg` |
| ffmpeg is “Killed” | out of memory | stop other processes; keep `-threads 2` and the x264 parameters |
| `capture.mjs` times out waiting for “Hallo, Max” | dev server not in mock mode, or login screen changed | unset `NEXT_PUBLIC_API_URL`/`VITE_API_URL`, check the login flow in `capture.mjs` |
| Fonts look wrong in the video | Google Fonts not reachable during render | allow network, or install Space Grotesk and Inter locally |
| Text clipped in a scene | `.line` masks use `overflow:hidden` and fixed container widths | widen the container or reduce the font size in that scene's markup |
| Frame count mismatch | one render worker crashed | check `promo/.render-1.log` / `.render-2.log` (kept on failure) |

---

## 10. Ideas for the next iteration

- Vertical 9:16 cut for social media (separate stage size, mobile-first scenes).
- Voice-over or text-to-speech with captions; currently there is no speech.
- Replace the synthesized music by licensed or custom music; the cut times already sit on a 120 BPM grid.
- A light-theme scene (the app has a light mode) and a short “real-time chat” scene with live messages.
- Read the version text from `version.json` during the build.
- Capture the screenshots against the real API with seeded sample content once demo data exists outside the mock mode.
