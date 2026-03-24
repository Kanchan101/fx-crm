-- ═══════════════════════════════════════════════════════
-- FX CONSULTING CRM — DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════

-- TEAM (recruiters)
CREATE TABLE team (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(200) UNIQUE NOT NULL,
    password_hash VARCHAR(200),
    role VARCHAR(50) DEFAULT 'Recruiter',
    phone VARCHAR(20),
    avatar_color VARCHAR(10) DEFAULT '#3B82F6',
    revenue_target DECIMAL(12,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CLIENTS
CREATE TABLE clients (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(200) NOT NULL,
    industry VARCHAR(100),
    tier VARCHAR(20) DEFAULT 'Silver',
    poc_name VARCHAR(100),
    poc_role VARCHAR(100),
    email VARCHAR(200),
    phone VARCHAR(20),
    location VARCHAR(100),
    status VARCHAR(20) DEFAULT 'Active',
    contract_end DATE,
    payment_terms VARCHAR(50) DEFAULT 'Net 30',
    fee_percent DECIMAL(5,2) DEFAULT 8.33,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CANDIDATES
CREATE TABLE candidates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    phone VARCHAR(20),
    role VARCHAR(200),
    experience VARCHAR(50),
    skills TEXT[],
    location VARCHAR(100),
    current_ctc VARCHAR(50),
    expected_ctc VARCHAR(50),
    notice_period VARCHAR(50),
    source VARCHAR(50) DEFAULT 'Direct',
    resume_url TEXT,
    resume_text TEXT,
    resume_score INTEGER DEFAULT 0,
    status VARCHAR(30) DEFAULT 'Active',
    whatsapp_opted BOOLEAN DEFAULT FALSE,
    naukri_id VARCHAR(50),
    linkedin_url TEXT,
    tags TEXT[],
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- JOB REQUIREMENTS
CREATE TABLE jobs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL,
    location VARCHAR(100),
    job_type VARCHAR(20) DEFAULT 'Permanent',
    ctc_min DECIMAL(10,2),
    ctc_max DECIMAL(10,2),
    positions INTEGER DEFAULT 1,
    filled INTEGER DEFAULT 0,
    submitted INTEGER DEFAULT 0,
    shortlisted INTEGER DEFAULT 0,
    skills_required TEXT[],
    description TEXT,
    priority VARCHAR(20) DEFAULT 'Medium',
    status VARCHAR(20) DEFAULT 'Open',
    recruiter_id INTEGER REFERENCES team(id),
    posted_date DATE DEFAULT CURRENT_DATE,
    deadline DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PIPELINE (candidate journey through stages)
CREATE TABLE pipeline (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    stage VARCHAR(50) NOT NULL DEFAULT 'Sourced',
    score INTEGER DEFAULT 0,
    recruiter_id INTEGER REFERENCES team(id),
    notes TEXT,
    interview_date TIMESTAMPTZ,
    stage_changed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(candidate_id, job_id)
);

-- PIPELINE HISTORY (audit trail — who moved what when)
CREATE TABLE pipeline_history (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER REFERENCES pipeline(id) ON DELETE CASCADE,
    from_stage VARCHAR(50),
    to_stage VARCHAR(50),
    changed_by INTEGER REFERENCES team(id),
    notes TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

-- INTERVIEWS
CREATE TABLE interviews (
    id SERIAL PRIMARY KEY,
    pipeline_id INTEGER REFERENCES pipeline(id),
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
    job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
    interview_date DATE NOT NULL,
    interview_time TIME NOT NULL,
    interview_type VARCHAR(50) DEFAULT 'Screening',
    mode VARCHAR(50) DEFAULT 'Google Meet',
    meet_link TEXT,
    interviewer_name VARCHAR(200),
    interviewer_email VARCHAR(200),
    status VARCHAR(30) DEFAULT 'Scheduled',
    feedback TEXT,
    rating INTEGER,
    scorecard JSONB,
    recruiter_id INTEGER REFERENCES team(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- WHATSAPP MESSAGES
CREATE TABLE whatsapp_messages (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(id) ON DELETE SET NULL,
    phone VARCHAR(20) NOT NULL,
    direction VARCHAR(10) NOT NULL, -- inbound / outbound
    message TEXT NOT NULL,
    template_name VARCHAR(100),
    status VARCHAR(20) DEFAULT 'sent',
    external_id VARCHAR(100),
    sent_at TIMESTAMPTZ DEFAULT NOW()
);

-- PLACEMENTS (revenue tracking)
CREATE TABLE placements (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(id),
    job_id INTEGER REFERENCES jobs(id),
    client_id INTEGER REFERENCES clients(id),
    recruiter_id INTEGER REFERENCES team(id),
    joining_date DATE,
    offered_ctc DECIMAL(10,2),
    fee_percent DECIMAL(5,2),
    fee_amount DECIMAL(12,2),
    invoice_number VARCHAR(50),
    invoice_status VARCHAR(30) DEFAULT 'Pending',
    invoice_date DATE,
    payment_received BOOLEAN DEFAULT FALSE,
    payment_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- CV PROCESSING LOG (track bulk uploads)
CREATE TABLE cv_processing_log (
    id SERIAL PRIMARY KEY,
    candidate_id INTEGER REFERENCES candidates(id),
    source VARCHAR(50),
    file_name VARCHAR(200),
    file_size INTEGER,
    parsed_status VARCHAR(20) DEFAULT 'pending',
    match_score INTEGER,
    matched_job_ids INTEGER[],
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of INTEGER REFERENCES candidates(id),
    processed_by INTEGER REFERENCES team(id),
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ACTIVITY LOG (track everything)
CREATE TABLE activity_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(30) NOT NULL, -- client, candidate, job, pipeline
    entity_id INTEGER NOT NULL,
    action VARCHAR(50) NOT NULL, -- created, updated, stage_changed, etc.
    details JSONB,
    performed_by INTEGER REFERENCES team(id),
    performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES (for fast queries at 10K CVs/week scale)
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_candidates_skills ON candidates USING GIN(skills);
CREATE INDEX idx_candidates_status ON candidates(status);
CREATE INDEX idx_candidates_source ON candidates(source);
CREATE INDEX idx_candidates_email ON candidates(email);
CREATE INDEX idx_candidates_phone ON candidates(phone);
CREATE INDEX idx_candidates_created ON candidates(created_at DESC);

CREATE INDEX idx_pipeline_stage ON pipeline(stage);
CREATE INDEX idx_pipeline_job ON pipeline(job_id);
CREATE INDEX idx_pipeline_candidate ON pipeline(candidate_id);
CREATE INDEX idx_pipeline_changed ON pipeline(stage_changed_at DESC);

CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_client ON jobs(client_id);
CREATE INDEX idx_jobs_priority ON jobs(priority);
CREATE INDEX idx_jobs_deadline ON jobs(deadline);

CREATE INDEX idx_interviews_date ON interviews(interview_date);
CREATE INDEX idx_interviews_status ON interviews(status);

CREATE INDEX idx_whatsapp_candidate ON whatsapp_messages(candidate_id);
CREATE INDEX idx_whatsapp_phone ON whatsapp_messages(phone);

CREATE INDEX idx_cv_log_date ON cv_processing_log(processed_at DESC);
CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id);

-- ═══════════════════════════════════════════════════════
-- ENABLE ROW LEVEL SECURITY (Supabase)
-- ═══════════════════════════════════════════════════════

ALTER TABLE team ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE placements ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated service role
CREATE POLICY "service_role_all" ON team FOR ALL USING (true);
CREATE POLICY "service_role_all" ON clients FOR ALL USING (true);
CREATE POLICY "service_role_all" ON candidates FOR ALL USING (true);
CREATE POLICY "service_role_all" ON jobs FOR ALL USING (true);
CREATE POLICY "service_role_all" ON pipeline FOR ALL USING (true);
CREATE POLICY "service_role_all" ON interviews FOR ALL USING (true);
CREATE POLICY "service_role_all" ON whatsapp_messages FOR ALL USING (true);
CREATE POLICY "service_role_all" ON placements FOR ALL USING (true);
