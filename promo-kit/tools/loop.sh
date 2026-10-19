#!/usr/bin/env bash
# Seamless looping clip (MP4 + GIF) from a hero scene. The scene gets "loop": <seconds>, which switches the engine into
# loop mode (all periodic motion snaps to whole cycles per period, particle drift off) – so frame L equals frame 0 and
# the clip loops without cross-fade ghosting. Extra loop motion is added on top of the hero layout: camera orbit (loopCam),
# phone/window float + sway, optional screen scrolling (loopScroll, off by default), scrolling floor grid and drifting glows. Renders L frames starting after the enter animations have settled.
#   bash tools/loop.sh [hero-name]            default: devices-16x9   (any scenes/hero-<name>.json)
# Env: MOTION (strength multiplier, default 0.6 = calm; 1 lively, 1.6 wild), SCROLL (px the phone screens scroll down and back, default 0 = off, try 520), L (frames, default 150 = 5 s @ 30 fps), START (first frame, default 105 = 3.5 s), PM
# Output: loops/<name>.mp4 (1280 px wide), loops/<name>.gif (640 px wide, 15 fps)
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=${1:-devices-16x9}; L=${L:-150}; START=${START:-105}
PM=${PM:-$HOME/.cache/pm}; W=$PM/loop-$NAME
[ -d "$PM/syslibs" ] && export LD_LIBRARY_PATH="$PM/syslibs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
FFMPEG=$(python3 -c "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())" 2>/dev/null || command -v ffmpeg)
[ -n "$FFMPEG" ] || { echo "ffmpeg not found (pip install imageio-ffmpeg)"; exit 1; }
rm -rf "$W"; mkdir -p "$W/raw" loops
node -e "
const fs=require('fs');const s=JSON.parse(fs.readFileSync('scenes/hero-$NAME.json'));const K=+'${MOTION:-0.6}';
s.loop=$L/30; s.stations[0].dur=($START+$L)/30+1;
s.loopCam={yaw:7*K,pitch:1.4*K,roll:.9*K,x:120*K,y:10*K,zoom:.03*K}; s.loopFloor=3;
let i=0; for(const o of s.stations[0].objects){ if(o.type==='text') o.at[1]+=50*K; if(!o.pose) continue; o.pose.floatPhase=i*1.9; i++;
  if(o.type==='phone'){o.pose.float=2.6*K;o.pose.sway=10*K;if(+'${SCROLL:-0}')o.loopScroll=+'${SCROLL:-0}';} else if(o.type==='window'){o.pose.float=1.6*K;o.pose.sway=4*K;} }
fs.writeFileSync('$W/scene.json',JSON.stringify(s));"
node tools/render.mjs --scene "$W/scene.json" --out "$W/raw" --from "$START" --to $((START+L)) --q 93 >/dev/null
"$FFMPEG" -y -loglevel error -framerate 30 -start_number "$START" -i "$W/raw/f%05d.jpg" -vf scale=1280:-2:flags=lanczos \
  -c:v libx264 -preset slow -crf 23 -pix_fmt yuv420p -movflags +faststart "loops/$NAME.mp4"
"$FFMPEG" -y -loglevel error -framerate 30 -start_number "$START" -i "$W/raw/f%05d.jpg" \
  -vf "fps=15,scale=640:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" "loops/$NAME.gif"
rm -rf "$W"; ls -la loops/"$NAME".*
