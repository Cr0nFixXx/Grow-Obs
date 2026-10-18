#!/usr/bin/env bash
# Full pipeline: frames (2 parallel Chromium workers) -> synthesized music -> H.264/AAC mp4.
# Needs: node + playwright (npm ci), python3 with numpy/scipy/Pillow/imageio-ffmpeg, assets in promo/assets.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d promo/syslibs ] && export LD_LIBRARY_PATH="$PWD/promo/syslibs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
FFMPEG=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>/dev/null || command -v ffmpeg)
TOTAL=${TOTAL_FRAMES:-1320}                 # 44 s * 30 fps
HALF=$((TOTAL / 2))
OUT=${OUT:-promo/GrowObserver-Promo.mp4}
FRAMES=promo/.frames
rm -rf "$FRAMES"; mkdir -p "$FRAMES"

node promo/render.mjs 0 "$HALF" "$FRAMES" 1 90 > promo/.render-1.log 2>&1 & p1=$!
node promo/render.mjs "$HALF" "$TOTAL" "$FRAMES" 1 90 > promo/.render-2.log 2>&1 & p2=$!
wait $p1; wait $p2
[ "$(ls "$FRAMES" | wc -l)" -eq "$TOTAL" ] || { echo "frame count mismatch"; exit 1; }

python3 promo/audio.py

# -threads 2 + small lookahead keep memory low (a 2 GB sandbox kills the default x264 settings)
"$FFMPEG" -y -loglevel error -framerate 30 -i "$FRAMES/f%05d.jpg" -i promo/music.wav \
  -c:v libx264 -preset faster -crf 18 -threads 2 -x264-params "rc-lookahead=10:ref=2:bframes=2" \
  -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -shortest -movflags +faststart "$OUT"
rm -rf "$FRAMES" promo/.render-*.log
echo "wrote $OUT"
