# Creative brief – Grow|Observer promo

Hand-off brief for an agent (or human) who produces promo material for the **Grow|Observer** app with this kit.
Read this first, then `README.md`. Technical details of the engine: `docs/ENGINE.md`.

## 1. Product in one paragraph
Grow|Observer is a web app / installable PWA for home growers: grow diary with phase timeline, dashboard (active grows, open tasks,
costs, health), community (forum, feed, hall of fame, marketplace, wiki, strain collection), direct messages, cost calculator and yield
simulation, edge-swipe drawer menu on mobile. UI language is **German**. Audience: German-speaking home growers, 18+.

## 2. Hard rules (honesty) — do not break
1. **Demo data only.** All screenshots come from the app's mock mode ("Max", "Lena B.", "HazyDream"…). Keep the legend
   **"Screens mit Demo-Daten"** visible in every shot that shows app screens.
2. **No invented numbers or claims.** The mock landing page contains fake stats (12.400 Grower, 3.200 Showcases, 98 % KI-Treffer) – never use them.
   The KPI values visible in screenshots (2 Aktive Grows, 168 €, 94 % …) are demo values; show them only as part of the screenshot.
3. **Do not present the AI as working.** The AI assistant/chat is not a live feature (honest notice, input disabled). Do not advertise it, do not
   animate AI answers. (The mock dashboard still contains a "KI-Empfehlung" card and a "KI fragen" button; they are part of the screenshot, don't zoom into or call them out.)
4. **No store badges, no download links, no URL, no "in Entwicklung"/"Beta" status** in the outro. The outro is minimal: icon + wordmark + claim.
5. **Use the real icon** (`brand/icon.svg`, exact copy of the app's `public/icon.svg`: white leaf + crease on a green gradient squircle).
   Do not redraw it, do not add badges/dots.
6. Cannabis context: no consumption imagery, no medical or yield promises, no ads targeted at minors; check platform ad policies before paid use.

## 3. Look & feel
* **Dark green-neon kinetic:** near-black green background (`#090c09`), neon green accent (`#45bd5c` → highlight `#6ff28b`), white headlines with
  3D extrusion, perspective floor grid, floating particles, soft glows, subtle film grain and vignette.
* **Motion:** hard cuts on the beat with a camera whip (yaw/zoom/roll), objects fly in with overshoot, slow handheld drift between cuts,
  music at 128–140 BPM. Short, confident, no filler. Headlines ≤ 4 words per line, ≤ 2 lines.
* **Type:** Space Grotesk (headlines, wordmark), Inter (UI/body) – both bundled in `engine/fonts/` (SIL OFL).
* Tokens: `brand/tokens.json`.

## 4. Language
* **On-screen texts: German** (see `copy.json` – approved lines and the do-not-say list).
* Briefing, docs, file names: English.
* Tone: direct, calm, "du"-form, no hype superlatives, no emojis in headlines (emoji only as floating reactions in the chat scene).

## 5. Formats & deliverables this kit can produce
| Deliverable | How | Output |
|---|---|---|
| 60 s hero video 16:9 (1920×1080, 30 fps, 140 BPM) | `bash tools/build.sh` | `out/GrowObserver-promo.mp4` (~55 MB, ~30 min) |
| Key visuals (dashboard, diary, devices, logo × 16:9, 9:16, 1:1, 4:5) | `bash tools/stills.sh` | `stills/*.jpg` (already included) |
| Transparent device mockups (phone, browser) | `node tools/mockups.mjs` | `mockups/*.png` (already included) |
| Brand PNG/SVG | `node tools/brand.mjs` | `brand/` (already included) |
| New cut (teaser, vertical, other format) | write a scene JSON → `SCENE=… bash tools/build.sh` | any size/length |
| Music for any scene | `python3 audio/audio.py --scene … --out music.wav` | stereo WAV, 44.1 kHz |

Suggested next deliverables (not yet produced): 9:16 vertical cut (reuse station ideas with `gen-hero.mjs` layouts: text top, phone bottom, zoom ≥ 1.1),
15 s teaser (devices → diary → outro), animated GIF/loop of the hero still.

## 6. Story of the 60 s hero video (stations, ≈ 6.9 s each)
| # | id | On-screen (German) | Visual |
|---|---|---|---|
| 0 | intro | wordmark "Grow\|Observer", "MOBIL · DESKTOP · DEIN GROW" | camera flies through a ring tunnel to the extruded icon + wordmark |
| 1 | devices | "Ein Grow. Alle Geräte." | 3 phones + 2 browser windows in a 3D stage |
| 2 | desktop | "Dein Dashboard." | dashboard breaks into floating cards, cursor clicks |
| 3 | diary | "Jeder Tag. Dokumentiert." · tags "Tag 64 von 98", "Phase: Blüte" | three phones, grow detail |
| 4 | carousel | "Wissen teilen." | ring of 10 community screens (forum, feed, market, strains, hall, wiki) |
| 5 | chat | "Schreib mit Growern." · tags Direktnachrichten / Kostenrechner / Simulation | chat bubbles pop in, floating emojis, calc + simulation windows |
| 6 | pwa | "In Daumen-Reichweite." · tags Edge-Swipe-Menü / Installierbar (PWA) | edge swipe opens the drawer, "App installieren" highlight |
| 7 | hyperflight | – | screens stream past the camera (energy beat before the outro) |
| 8 | outro | wordmark + "Dein Grow. Auf jedem Gerät." | icon burst, minimal, no URL, no badges |

## 7. Quality checklist before you ship anything
- [ ] Legend "Screens mit Demo-Daten" visible; only demo data.
- [ ] No text from the do-not-say list in `copy.json`; no AI-as-feature; no store badges/URL/status.
- [ ] Icon unmodified (compare with `brand/icon.svg`).
- [ ] Headlines are not clipped at the frame edge (check every format; 9:16/1:1 are the usual offenders).
- [ ] Contact-sheet check of the full video (`tools/still.mjs` at ≥ 8 times + `tools/sheet.py`) before the long render.
- [ ] Audio: no clipping (peak ≤ −1 dBFS; the synth normalizes to 0.89), cuts land on the beat.
- [ ] File size sensible (hero mp4 ≈ 55 MB at CRF 22; raise CRF to 24 for ≈ 35 MB).
- [ ] Work files (frames) outside the repo; never commit mp4/frames.
