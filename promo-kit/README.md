# Grow|Observer – Motion-Graphics Promo Kit

Everything needed to produce promo material for the Grow|Observer app: real demo screenshots, brand assets, device mockups, hero stills,
a scene-driven 3D motion-graphics engine, scene configs, a soundtrack synthesizer and render tools. **Sources only** – no rendered video is stored
(rebuild it in ~30 min). Start with **`BRIEF.md`** (rules, look, story), then this file; engine details in **`docs/ENGINE.md`**.

```
BRIEF.md            creative brief: honesty rules, look & feel, story, QA checklist   (read first)
copy.json           approved German on-screen texts + do-not-say list
manifest.json       inventory of every file (regenerate: node tools/manifest.mjs)
brand/              icon.svg (exact app icon), icon-512/1024.png, wordmark.svg/png, lockup.png, tokens.json
screenshots/        real app screenshots, demo/mock data: mobile/ (<key>-f.jpg viewport, <key>-t.jpg tall), desktop/ (d-<key>.jpg), parts/
mockups/            transparent PNG device mockups: phone-<key>.png (621×1302), browser-<key>.png (1800×1170)
stills/             16 key visuals: hero-{dashboard,diary,devices,logo}-{16x9,9x16,1x1,4x5}.jpg
engine/             the generic renderer (HTML/CSS/JS, offline fonts)
scenes/             promo-60s.json (hero video), hero-*.json (stills), legacy-scene.html.txt (old single-file version, reference only)
audio/audio.py      soundtrack synth driven by the scene JSON
tools/              render/still/build/setup/capture/asset/mockup/brand/manifest scripts (see below)
docs/ENGINE.md      scene format reference + recipes + gotchas
```

## Quick start (≈ 5 min)
```bash
cd promo-kit
bash tools/setup.sh                       # node/playwright/chromium/python deps + smoke test
node tools/still.mjs --scene scenes/promo-60s.json --t 6.3,16,30 --out ~/.cache/pm/test    # look at 3 frames
bash tools/stills.sh                      # re-render all key visuals into stills/
bash tools/build.sh                       # full 60 s video -> out/GrowObserver-promo.mp4 (~30 min, 2 cores)
```
Requirements: Node ≥ 20, Python ≥ 3.10 (numpy, scipy, pillow, imageio-ffmpeg), Chromium via Playwright, ~2 GB RAM, no GPU needed.
On minimal Linux images Chromium may need system libs (`npx playwright install-deps chromium`, needs root; otherwise unpack the `.deb`s into
`$PM/syslibs` – the scripts add `$PM/syslibs/usr/lib/x86_64-linux-gnu` to `LD_LIBRARY_PATH` automatically).
**`PM`** (default `~/.cache/pm`) is the work directory for frames/temp files – keep it outside the repo.

## What is where – tools
| script | purpose |
|---|---|
| `tools/setup.sh` | install/check dependencies, smoke test |
| `tools/render.mjs --scene S --out DIR [--from --to --q]` | frames as `f00000.jpg…`; resumable; retries after Chromium crashes |
| `tools/still.mjs --scene S --t 2,5.5 --out DIR [--png --prefix p]` | single frames for review or deliverables |
| `tools/build.sh` | frames (parallel) → music → mp4. Env: `SCENE`, `OUT`, `WORKERS`, `RESUME=1`, `NO_AUDIO=1`, `PM` |
| `tools/stills.sh` | all `scenes/hero-*.json` → `stills/*.jpg` (t = 3.5 s) |
| `tools/gen-promo-scene.mjs` | generates `scenes/promo-60s.json` – edit the generator, not the JSON |
| `tools/gen-hero.mjs` | generates the 16 `hero-*.json` (layouts per format in `LAYOUTS`) |
| `tools/mockups.mjs` | transparent phone/browser mockups from `screenshots/` |
| `tools/brand.mjs` | icon/wordmark/lockup PNG + wordmark SVG |
| `tools/capture.mjs`, `tools/make-assets.py` | re-capture the app (mock mode) and convert to JPG (below) |
| `tools/sheet.py out.jpg a.jpg b.jpg …` | contact sheet for quick visual QA |
| `tools/manifest.mjs` | rewrite `manifest.json` |
| `audio/audio.py --scene S --out music.wav` | stereo WAV, length = scene length |

## Re-capturing screenshots (only if the app UI changed)
The kit sits inside the app repo (`promo-kit/`); capturing needs the app itself in **mock mode** (= no API URL → demo data only).
```bash
# in the repo root
npm ci
npm run dev:vite -- --host 0.0.0.0                 # Vite on :5173, mock mode (don't set VITE_API_URL)
BASE_URL=http://localhost:5173 node promo-kit/tools/capture.mjs      # raw PNGs -> $PM/assets  (mobile 390×844 @2x, desktop 1440×900 @2x)
python3 promo-kit/tools/make-assets.py                                # -> screenshots/{mobile,desktop,parts}
node promo-kit/tools/mockups.mjs && bash promo-kit/tools/stills.sh    # refresh mockups + stills
```
Capture needs ≥ 4–5 s wait after each navigation; the scripts handle it. Check the result with a contact sheet before using it. Then
re-verify BRIEF §2 (no real user data, no AI shown as working).

## Typical jobs
* **Change a headline / tag:** edit the generator (`tools/gen-promo-scene.mjs` or `tools/gen-hero.mjs`), regenerate, preview with `still.mjs`. Keep texts in `copy.json` in sync.
* **Add a format (e.g. 21:9):** add it to `FORMATS` in `gen-hero.mjs`, add a layout per variant, `node tools/gen-hero.mjs && bash tools/stills.sh`.
* **Make a shorter/vertical video:** write a scene JSON (copy a hero scene, give it several stations), set `format`, add an `audio` block, `SCENE=… OUT=… bash tools/build.sh`.
* **Swap the soundtrack:** `NO_AUDIO=1 bash tools/build.sh`, then mux your own track with ffmpeg.

## Licensing / provenance
Screens show the app's own demo data (mock mode); the icon is the app's icon; fonts Inter and Space Grotesk are SIL OFL 1.1 (bundled in
`engine/fonts/`); the music is synthesized by `audio/audio.py` (no samples, no third-party material).

## Size
≈ 31 MB of sources (mockups 16 MB, screenshots 9 MB, stills 5 MB, brand 0.5 MB, engine + fonts 0.4 MB). Don't commit videos or frames.
