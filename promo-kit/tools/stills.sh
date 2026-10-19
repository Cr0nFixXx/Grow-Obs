#!/usr/bin/env bash
# Renders every scenes/hero-*.json at t=3.5 s into stills/<name>.jpg (quality 94).
# Regenerate the scenes first with `node tools/gen-hero.mjs` if you changed layouts.
set -euo pipefail
cd "$(dirname "$0")/.."
PM=${PM:-$HOME/.cache/pm}
[ -d "$PM/syslibs" ] && export LD_LIBRARY_PATH="$PM/syslibs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
mkdir -p stills "$PM/stills-png"
for f in scenes/hero-*.json; do
  n=$(basename "$f" .json)
  node tools/still.mjs --scene "$f" --t 3.5 --png --out "$PM/stills-png" --prefix "$n-" >/dev/null
  python3 -c "from PIL import Image;Image.open('$PM/stills-png/${n}-t3_5.png').convert('RGB').save('stills/$n.jpg',quality=94,optimize=True)"
  echo "stills/$n.jpg"
done
