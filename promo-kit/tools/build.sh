#!/usr/bin/env bash
# Renders a scene to an H.264/AAC mp4 (frames -> synthesized music -> mux). Default: the 60 s hero promo.
#   bash tools/build.sh                                   # scenes/promo-60s.json -> out/GrowObserver-promo.mp4
#   SCENE=scenes/my.json OUT=out/my.mp4 bash tools/build.sh
# Env: PM (work dir for frames, default ~/.cache/pm — keep it OUTSIDE the repo, 1800 JPGs ≈ 150 MB),
#      WORKERS (1-2 parallel Chromium workers, default 2), RESUME=1 (keep existing frames), NO_AUDIO=1.
# ~25-40 min on 2 cores. Run it in the background with a log file if your shell has a command timeout.
set -euo pipefail
cd "$(dirname "$0")/.."
PM=${PM:-$HOME/.cache/pm}
[ -d "$PM/syslibs" ] && export LD_LIBRARY_PATH="$PM/syslibs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
SCENE=${SCENE:-scenes/promo-60s.json}; OUT=${OUT:-out/GrowObserver-promo.mp4}; WORKERS=${WORKERS:-2}
FFMPEG=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>/dev/null || command -v ffmpeg)
FRAMES=$PM/frames; mkdir -p "$(dirname "$OUT")" "$FRAMES" "$PM"
[ -n "${RESUME:-}" ] || rm -f "$FRAMES"/f*.jpg
read -r TOTAL FPS < <(node -e "const s=require('./'+process.argv[1]);const d=s.stations.reduce((a,x)=>a+x.dur,0),f=(s.format&&s.format.fps)||30;console.log(Math.round(d*f),f)" "$SCENE")
echo "scene=$SCENE frames=$TOTAL fps=$FPS workers=$WORKERS"
pids=(); STEP=$(( (TOTAL + WORKERS - 1) / WORKERS ))
for ((w=0; w<WORKERS; w++)); do
  a=$((w*STEP)); b=$(( (w+1)*STEP )); [ $b -gt $TOTAL ] && b=$TOTAL
  node tools/render.mjs --scene "$SCENE" --out "$FRAMES" --from $a --to $b > "$PM/render-$w.log" 2>&1 & pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
[ "$(ls "$FRAMES"/f*.jpg | wc -l)" -eq "$TOTAL" ] || { echo "frame count mismatch — see $PM/render-*.log, then re-run with RESUME=1"; exit 1; }
if [ -z "${NO_AUDIO:-}" ]; then
  python3 audio/audio.py --scene "$SCENE" --out "$PM/music.wav"
  AIN=(-i "$PM/music.wav"); ACODEC=(-c:a aac -b:a 160k -shortest)
else AIN=(); ACODEC=(-an); fi
"$FFMPEG" -y -loglevel error -framerate "$FPS" -i "$FRAMES/f%05d.jpg" "${AIN[@]}" \
  -c:v libx264 -preset faster -crf 22 -threads 2 -x264-params "rc-lookahead=10:ref=2:bframes=2" \
  -pix_fmt yuv420p -r "$FPS" "${ACODEC[@]}" -movflags +faststart "$OUT"
rm -rf "$FRAMES"; echo "wrote $OUT"
