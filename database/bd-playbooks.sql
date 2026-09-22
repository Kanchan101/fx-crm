-- ═══════════════════════════════════════════════════════
-- FX CRM — BD LAYER UPDATE 3
-- Stores AI-generated account playbooks. Additive + idempotent.
-- Run once in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS bd_playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_name VARCHAR(200) NOT NULL,   -- the company we want to win (e.g. Flipkart)
    sector VARCHAR(120),
    playbook JSONB NOT NULL,             -- the structured strategy Claude generated
    created_by UUID REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bd_playbooks_created ON bd_playbooks(created_at DESC);

ALTER TABLE bd_playbooks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON bd_playbooks;
CREATE POLICY "service_role_all" ON bd_playbooks FOR ALL USING (true);
