-- ═══════════════════════════════════════════════════════
-- FX CRM — COMPLETE BD SCHEMA (run once; safe to re-run)
-- Creates/ensures every table & column the BD module needs.
-- Nothing is dropped; existing data is untouched.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Prospect companies (live only in BD until onboarded as clients)
CREATE TABLE IF NOT EXISTS bd_prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    sector VARCHAR(120),
    notes TEXT,
    onboarded_client_id UUID REFERENCES clients(id),
    created_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Opportunities (the pipeline)
CREATE TABLE IF NOT EXISTS bd_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    stage VARCHAR(30) NOT NULL DEFAULT 'Prospecting',
    value DECIMAL(14,2) DEFAULT 0,
    owner_id UUID REFERENCES team(id),
    source VARCHAR(120),
    next_step VARCHAR(300),
    expected_close DATE,
    lost_reason VARCHAR(200),
    notes TEXT,
    last_stage_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bd_opportunities ADD COLUMN IF NOT EXISTS prospect_name VARCHAR(200);
ALTER TABLE bd_opportunities ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES bd_prospects(id);

-- Tasks (activities)
CREATE TABLE IF NOT EXISTS bd_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(300) NOT NULL,
    opportunity_id UUID REFERENCES bd_opportunities(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    owner_id UUID REFERENCES team(id),
    due_date DATE,
    done BOOLEAN DEFAULT FALSE,
    completed_by UUID REFERENCES team(id),
    completed_at TIMESTAMPTZ,
    created_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Strategy playbooks
CREATE TABLE IF NOT EXISTS bd_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_name VARCHAR(200) NOT NULL,
    sector VARCHAR(120),
    playbook JSONB NOT NULL,
    created_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Client handover notes (BD)
CREATE TABLE IF NOT EXISTS bd_account_notes (
    client_id UUID PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
    notes TEXT,
    updated_by UUID REFERENCES team(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-person BD access + contact authority
ALTER TABLE team         ADD COLUMN IF NOT EXISTS bd_access BOOLEAN DEFAULT false;
ALTER TABLE client_spocs ADD COLUMN IF NOT EXISTS bd_authority VARCHAR(40);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bd_opps_stage    ON bd_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_bd_opps_client   ON bd_opportunities(client_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_owner    ON bd_opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_prospect ON bd_opportunities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_bd_tasks_owner   ON bd_tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_bd_tasks_done    ON bd_tasks(done);
CREATE INDEX IF NOT EXISTS idx_bd_prospects_name ON bd_prospects(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_bd_pcontacts_prospect ON bd_prospect_contacts(prospect_id);

-- Row Level Security
ALTER TABLE bd_prospects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_prospect_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_opportunities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_tasks             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_playbooks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_account_notes     ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bd_prospects','bd_prospect_contacts','bd_opportunities','bd_tasks','bd_playbooks','bd_account_notes']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "service_role_all" ON %I', t);
    EXECUTE format('CREATE POLICY "service_role_all" ON %I FOR ALL USING (true)', t);
  END LOOP;
END $$;

-- Migrate any old free-text prospects into real prospect records
INSERT INTO bd_prospects (name)
SELECT DISTINCT TRIM(o.prospect_name)
FROM bd_opportunities o
WHERE o.client_id IS NULL AND o.prospect_id IS NULL
  AND o.prospect_name IS NOT NULL AND TRIM(o.prospect_name) <> ''
  AND NOT EXISTS (SELECT 1 FROM bd_prospects p WHERE LOWER(p.name) = LOWER(TRIM(o.prospect_name)));

UPDATE bd_opportunities o
SET prospect_id = p.id
FROM bd_prospects p
WHERE o.client_id IS NULL AND o.prospect_id IS NULL
  AND o.prospect_name IS NOT NULL
  AND LOWER(TRIM(o.prospect_name)) = LOWER(p.name);
