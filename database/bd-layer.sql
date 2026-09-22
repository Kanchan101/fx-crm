-- ═══════════════════════════════════════════════════════
-- FX CONSULTING CRM — BUSINESS DEVELOPMENT LAYER
-- Additive migration. Does NOT alter existing tables.
-- Run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════

-- BD OPPORTUNITIES — the sales funnel that sits ABOVE delivery.
-- One row = one thing the BD team is trying to win or grow at a client
-- (a new account, a new mandate, an MSA, an expansion).
CREATE TABLE IF NOT EXISTS bd_opportunities (
    id SERIAL PRIMARY KEY,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    stage VARCHAR(30) NOT NULL DEFAULT 'Prospecting',
        -- Prospecting | Qualified | Proposal | Negotiation | Won | Lost
    value DECIMAL(14,2) DEFAULT 0,          -- estimated fee value, in rupees
    owner_id INTEGER REFERENCES team(id),   -- BD owner
    source VARCHAR(120),
    next_step VARCHAR(300),
    expected_close DATE,
    lost_reason VARCHAR(200),
    notes TEXT,
    last_stage_at TIMESTAMPTZ DEFAULT NOW(),-- for idle / no-touch detection
    created_by INTEGER REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BD TASKS — the BD team's to-dos (calls, follow-ups, proposals to send).
-- Optionally linked to an opportunity and/or a client.
CREATE TABLE IF NOT EXISTS bd_tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    opportunity_id INTEGER REFERENCES bd_opportunities(id) ON DELETE CASCADE,
    client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE,
    owner_id INTEGER REFERENCES team(id),   -- assignee
    due_date DATE,
    done BOOLEAN DEFAULT FALSE,
    completed_by INTEGER REFERENCES team(id),
    completed_at TIMESTAMPTZ,
    created_by INTEGER REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for board / dashboard queries
CREATE INDEX IF NOT EXISTS idx_bd_opps_stage   ON bd_opportunities(stage);
CREATE INDEX IF NOT EXISTS idx_bd_opps_client  ON bd_opportunities(client_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_owner   ON bd_opportunities(owner_id);
CREATE INDEX IF NOT EXISTS idx_bd_opps_updated ON bd_opportunities(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_tasks_owner  ON bd_tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_bd_tasks_done   ON bd_tasks(done);
CREATE INDEX IF NOT EXISTS idx_bd_tasks_due    ON bd_tasks(due_date);

-- Row Level Security (match the pattern used by the rest of the schema)
ALTER TABLE bd_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_tasks         ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON bd_opportunities;
DROP POLICY IF EXISTS "service_role_all" ON bd_tasks;
CREATE POLICY "service_role_all" ON bd_opportunities FOR ALL USING (true);
CREATE POLICY "service_role_all" ON bd_tasks         FOR ALL USING (true);

-- ── OPTIONAL: seed a few opportunities from your existing open jobs, so the
-- ── board isn't empty on first open. Safe to skip or delete. It creates a
-- ── Qualified opportunity for each open requirement that doesn't have one yet.
-- INSERT INTO bd_opportunities (client_id, title, stage, value, owner_id, source, created_by)
-- SELECT j.client_id,
--        j.title,
--        'Qualified',
--        COALESCE(j.ctc_max, 0) * (COALESCE(c.fee_percent, 8.33) / 100.0) * GREATEST(COALESCE(j.positions, 1), 1),
--        j.recruiter_id,
--        'Imported from open requirement',
--        j.recruiter_id
-- FROM jobs j
-- JOIN clients c ON c.id = j.client_id
-- WHERE j.status = 'Open'
--   AND NOT EXISTS (SELECT 1 FROM bd_opportunities o WHERE o.client_id = j.client_id AND o.title = j.title);
