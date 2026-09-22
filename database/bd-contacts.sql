-- ═══════════════════════════════════════════════════════
-- FX CRM — BD LAYER UPDATE 4
-- Contact buying-authority + persistent account handover notes.
-- Additive + idempotent. Run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Buying-authority / decision role on each contact (Champion, Gatekeeper, etc.)
-- Added to the existing client_spocs table used across the CRM.
ALTER TABLE client_spocs ADD COLUMN IF NOT EXISTS bd_authority VARCHAR(40);

-- One running handover-notes document per account, so a new BD executive
-- can read the history and pick up where the last one left off.
CREATE TABLE IF NOT EXISTS bd_account_notes (
    client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
    notes TEXT,
    updated_by UUID REFERENCES team(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bd_account_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON bd_account_notes;
CREATE POLICY "service_role_all" ON bd_account_notes FOR ALL USING (true);
