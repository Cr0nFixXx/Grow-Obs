#!/usr/bin/env bash
# Sandbox helper (no root): Chromium needs a few shared libraries and a colour-emoji font that
# minimal containers lack. Downloads the .deb files, unpacks them into promo/syslibs and ~/.fonts.
# Only needed when `node promo/render.mjs` fails with "error while loading shared libraries".
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d); mkdir -p promo/syslibs "$HOME/.fonts"
( cd "$tmp" && apt-get download libnspr4 libnss3 libatk1.0-0t64 libatk-bridge2.0-0t64 libxdamage1 libxkbcommon0 libasound2t64 libatspi2.0-0t64 fonts-noto-color-emoji )
for d in "$tmp"/*.deb; do dpkg -x "$d" promo/syslibs; done
cp promo/syslibs/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf "$HOME/.fonts/" && fc-cache -f || true
npx playwright install chromium
echo "done - build.sh picks up promo/syslibs automatically"
