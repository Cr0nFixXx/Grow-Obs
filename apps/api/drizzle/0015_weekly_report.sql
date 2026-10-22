-- Hand-reviewed (B-71): Wochenreport als Opt-in je Konto; `weekly_report_week` (ISO-Woche, z. B. 2026-W43) verhindert Doppelversand.
-- Idempotent (IF NOT EXISTS): kann vorab von Hand eingespielt werden, wenn SKIP_MIGRATIONS=true gesetzt ist.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weekly_report" boolean DEFAULT false NOT NULL;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "weekly_report_week" text;
