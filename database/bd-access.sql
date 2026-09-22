-- ═══════════════════════════════════════════════════════
-- FX CRM — BD LAYER UPDATE 2
-- Adds: (1) prospect companies on opportunities,
--       (2) per-person BD access control.
-- Additive and idempotent. Run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════

-- (1) Let an opportunity name a brand-new company (a prospect) that is
--     not yet a formal client. client_id stays NULL for these.
ALTER TABLE bd_opportunities
    ADD COLUMN IF NOT EXISTS prospect_name VARCHAR(200);

-- (2) Per-person access to the BD Pipeline. Default OFF for everyone;
--     Super Admins always have access regardless of this flag.
ALTER TABLE team
    ADD COLUMN IF NOT EXISTS bd_access BOOLEAN DEFAULT false;
