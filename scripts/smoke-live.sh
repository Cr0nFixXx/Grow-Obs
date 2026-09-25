#!/usr/bin/env bash
# Live-Smoke-Test gegen eine laufende Instanz (Preview/Prod). Legt Testdaten an und räumt sie wieder auf.
# Nutzung: BASE=https://… EMAIL=… PASSWORD=… bash scripts/smoke-live.sh
set -uo pipefail
B="${BASE:?BASE fehlt}/api"
json() { node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const x=JSON.parse(d);console.log($1)})"; }
echo "health:      $(curl -s "$B/health" | json 'x.dataMode')"
T=$(curl -s -H Content-Type:application/json -X POST "$B/auth/login" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" | json 'x.token')
H="Authorization: Bearer $T"
echo "login:       ${T:0:12}…"
UP=$(curl -s -H "$H" -H "Content-Type: image/png" --data-binary @public/icon-192.png "$B/media"); P=$(echo "$UP" | json 'x.path')
echo "upload:      $P ($(echo "$UP" | json 'x.size') B)"
echo "serve:       $(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$B$P")"
echo "fake-png:    $(printf '<svg xmlns=\"http://www.w3.org/2000/svg\"/>        ' | curl -s -o /dev/null -w '%{http_code}' -H "$H" -H 'Content-Type: image/png' --data-binary @- "$B/media") (erwartet 415)"
GID=$(curl -s -H "$H" "$B/grows" | json 'x[0].id')
echo "grow photo:  $(curl -s -H "$H" -H Content-Type:application/json -X POST "$B/grows/$GID/photos" -d "{\"url\":\"$P\"}" | json "x.gallery.includes('$P') ? 'in Galerie' : 'FEHLT'")"
PID=$(curl -s -H "$H" -H Content-Type:application/json -X POST "$B/social/posts" -d "{\"text\":\"Smoke-Test Foto\",\"image\":\"$P\"}" | json 'x.id')
echo "post+image:  $PID"
OLD=$(curl -s -H "$H" "$B/auth/me" | json 'JSON.stringify({name:x.name,title:x.title,avatar:x.avatar})')
echo "profile:     $(curl -s -H "$H" -H Content-Type:application/json -X PATCH "$B/auth/me" -d "{\"avatar\":\"$P\"}" | json 'x.avatar')"
SID=$(curl -s "$B/strains" | json 'x[0].id')
echo "collect:     $(curl -s -H "$H" -X POST "$B/strains/$SID/collect" | json 'x.collected') → $(curl -s -H "$H" "$B/strains/collection" | json 'x.length') in Sammlung"
# Aufräumen
curl -s -o /dev/null -H "$H" -X POST "$B/strains/$SID/collect"
curl -s -o /dev/null -H "$H" -H Content-Type:application/json -X PATCH "$B/auth/me" -d "$OLD"
echo "SMOKE_CLEANUP post=$PID media=$P grow=$GID"
