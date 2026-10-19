#!/usr/bin/env bash
# Checks / installs everything the kit needs. Safe to re-run.
#   bash tools/setup.sh
# Needs: Node >= 20, Python >= 3.10, internet (first run only). No root required.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "== node";   node -v | grep -E '^v(2[0-9]|[3-9][0-9])' >/dev/null || { echo "Node >= 20 required"; exit 1; }
echo "== npm deps (playwright)"
node -e "require('playwright')" 2>/dev/null || npm install --no-audit --no-fund
echo "== chromium"
npx playwright install chromium
echo "== python deps (numpy scipy pillow imageio-ffmpeg)"
python3 -c "import numpy, scipy, PIL, imageio_ffmpeg" 2>/dev/null || python3 -m pip install --user numpy scipy pillow imageio-ffmpeg
echo "== smoke test: one still"
PM=${PM:-$HOME/.cache/pm}; [ -d "$PM/syslibs" ] && export LD_LIBRARY_PATH="$PM/syslibs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
mkdir -p out && node tools/still.mjs --scene scenes/hero-logo-16x9.json --t 3.5 --out out --prefix smoke- >/dev/null && echo "OK -> out/ (delete it any time)"
echo "If Chromium fails with 'error while loading shared libraries': install the missing system libs (Debian: npx playwright install-deps chromium) or unpack the .debs into \$PM/syslibs."
