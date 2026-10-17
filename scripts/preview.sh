#!/usr/bin/env bash
# Startet die App als Preview (Produktions-Build, eingebettete API, PostgreSQL) auf 0.0.0.0:$PORT (Standard 3000).
#   npm run preview            – baut bei Bedarf und startet den Server (Vordergrund)
#   PREVIEW_REBUILD=1 npm run preview   – erzwingt einen neuen Build
# Nur für Entwicklung/Preview: JWT_SECRET ist ein festes Dev-Secret, die Datenbank eine lokale Wegwerf-DB.
set -euo pipefail
cd "$(dirname "$0")/.."

PORT="${PORT:-3000}"
DB_NAME="${PREVIEW_DB_NAME:-growobserver_dev}"
export DATABASE_URL="${DATABASE_URL:-postgres://grow_test:grow_test@127.0.0.1:5432/${DB_NAME}}"
# Die Vorschau läuft typischerweise in einem iframe unter fremder Domain → Cookie muss SameSite=None; Secure; Partitioned sein.
export COOKIE_SAMESITE="${COOKIE_SAMESITE:-none}"
# Der Sandbox-Proxy reicht weder Cookie noch Authorization an die App durch → Header-Fallback nur für die Vorschau.
export ALLOW_HEADER_SESSION="${ALLOW_HEADER_SESSION:-true}"
export JWT_SECRET="${JWT_SECRET:-preview-only-secret-not-for-production-0123456789abcdef}"

# 1) PostgreSQL bereitstellen (nur wenn lokal installiert und noch nicht erreichbar).
if command -v pg_isready >/dev/null && ! pg_isready -q -h 127.0.0.1 -p 5432; then
  if command -v pg_lsclusters >/dev/null; then
    read -r PGVER PGNAME _ < <(pg_lsclusters --no-header | head -1) || true
    [ -n "${PGVER:-}" ] && sudo pg_ctlcluster "$PGVER" "$PGNAME" start || true
    for _ in $(seq 1 20); do pg_isready -q -h 127.0.0.1 -p 5432 && break; sleep 0.5; done
  fi
fi
# 2) Rolle/DB anlegen, falls möglich (idempotent). Migrationen laufen beim ersten API-Request automatisch.
if command -v psql >/dev/null && command -v sudo >/dev/null && sudo -n -u postgres true 2>/dev/null; then
  sudo -u postgres psql -qtc "SELECT 1 FROM pg_roles WHERE rolname='grow_test'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE ROLE grow_test LOGIN SUPERUSER PASSWORD 'grow_test'"
  sudo -u postgres psql -qtc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 \
    || sudo -u postgres psql -qc "CREATE DATABASE ${DB_NAME} OWNER grow_test"
fi

# 3) Version prüfen, bauen (wenn nötig), starten.
node scripts/version.mjs check
if [ "${PREVIEW_REBUILD:-0}" = "1" ] || [ ! -f .next/BUILD_ID ] || [ version.json -nt .next/BUILD_ID ]; then
  npm run build
fi
echo "Preview: http://localhost:${PORT}  ($(node scripts/version.mjs show))"
exec node scripts/server.mjs -p "$PORT" -H 0.0.0.0
