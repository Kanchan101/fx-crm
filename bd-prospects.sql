-- ═══════════════════════════════════════════════════════
-- FX CRM — BD LAYER UPDATE 5
-- Prospects become first-class BD companies (NOT clients) with their own
-- contacts and notes. They become clients only on onboarding.
-- Additive + idempotent. Run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- A prospect company: lives only in BD until onboarded.
CREATE TABLE IF NOT EXISTS bd_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    sector VARCHAR(120),
    notes TEXT,
    onboarded_client_id UUID REFERENCES clients(id),  -- set once they become a client
    created_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- People at a prospect (separate from client contacts until onboarding).
CREATE TABLE IF NOT EXISTS bd_prospect_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID REFERENCES bd_prospects(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    designation VARCHAR(120),
    email VARCHAR(200),
    phone VARCHAR(50),
    authority VARCHAR(40),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Opportunities now point to a prospect OR a client.
ALTER TABLE bd_opportunities ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES bd_prospects(id);

CREATE INDEX IF NOT EXISTS idx_bd_prospects_name ON bd_prospects(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_bd_pcontacts_prospect ON bd_prospect_contacts(prospect_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_prospect ON bd_opportunities(prospect_id);

ALTER TABLE bd_prospects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_prospect_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON bd_prospects;
DROP POLICY IF EXISTS "service_role_all" ON bd_prospect_contacts;
CREATE POLICY "service_role_all" ON bd_prospects         FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bd_prospect_contacts FOR ALL USING (true);

-- ── Migrate existing free-text prospects into real prospect records ──
-- 1) create a prospect for each distinct company name that was typed in
INSERT INTO bd_prospects (name)
SELECT DISTINCT TRIM(o.prospect_name)
FROM bd_opportunities o
WHERE o.client_id IS NULL
  AND o.prospect_name IS NOT NULL AND TRIM(o.prospect_name) <> ''
  AND o.prospect_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM bd_prospects p WHERE LOWER(p.name) = LOWER(TRIM(o.prospect_name)));

-- 2) link those opportunities to their prospect
UPDATE bd_opportunities o
SET prospect_id = p.id
FROM bd_prospects p
WHERE o.client_id IS NULL AND o.prospect_id IS NULL
  AND o.prospect_name IS NOT NULL
  AND LOWER(TRIM(o.prospect_name)) = LOWER(p.name);
