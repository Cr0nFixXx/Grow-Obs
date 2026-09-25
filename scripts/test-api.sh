#!/usr/bin/env bash
# API-Integrationstests gegen eine WEGWERF-Datenbank (wird angelegt und danach gelöscht).
# Nutzung: npm run test:api:local   (benötigt lokalen PostgreSQL-Superuser, Standard: postgres/postgres)
set -uo pipefail
ADMIN_URL="${PG_ADMIN_URL:-postgresql://postgres:postgres@127.0.0.1:5432/postgres}"
psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS growobserver_test;" -c "DROP ROLE IF EXISTS grow_test;" >/dev/null
psql "$ADMIN_URL" -qc "CREATE ROLE grow_test LOGIN PASSWORD 'grow_test';" -c "CREATE DATABASE growobserver_test OWNER grow_test;" >/dev/null
TEST_DATABASE_URL=postgres://grow_test:grow_test@127.0.0.1:5432/growobserver_test npx vitest run --config vitest.backend.config.ts "$@"
status=$?
psql "$ADMIN_URL" -qc "DROP DATABASE IF EXISTS growobserver_test;" -c "DROP ROLE IF EXISTS grow_test;" >/dev/null
exit $status
