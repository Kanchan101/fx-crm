-- ═══════════════════════════════════════════════════════
-- FX CRM — INTERVIEW FOLLOW-UP
-- Adds a daily follow-up status + remark to each interview,
-- so recruiters can record Confirmed / No Show / Not Responding
-- and the reason. Additive + idempotent. Run once in Supabase.
-- ═══════════════════════════════════════════════════════

ALTER TABLE interviews ADD COLUMN IF NOT EXISTS followup_status  VARCHAR(30);
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS followup_remark  TEXT;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS followup_updated_at TIMESTAMPTZ;
ALTER TABLE interviews ADD COLUMN IF NOT EXISTS followup_updated_by UUID REFERENCES team(id);

CREATE INDEX IF NOT EXISTS idx_interviews_date ON interviews(interview_date);
