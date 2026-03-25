require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool, query } = require('./db');

const TEAM = [
  { name: 'Kanchan Singh Kuwarbi', email: 'kanchan.singh@fxconsulting.in', password: 'Kanchan@FX2026', role: 'Super Admin' },
  { name: 'Kavita Kaushik', email: 'kavita.kaushik@fxconsulting.in', password: 'Kavita@FX2026', role: 'Account Manager' },
  { name: 'Abhishek Joshua', email: 'abhishek@fxconsulting.in', password: 'Abhishek@FX2026', role: 'Account Manager' },
  { name: 'Radhika Pasricha', email: 'radhika@fxconsulting.in', password: 'Radhika@FX2026', role: 'Account Manager' },
  { name: 'Neha Brijwal', email: 'neha@fxconsulting.in', password: 'Neha@FX2026', role: 'Account Manager' },
  { name: 'Saurabh Gangolia', email: 'g.saurabh@fxconsulting.in', password: 'Saurabh@FX2026', role: 'Recruiter' },
  { name: 'Karan Negi', email: 'karan@fxconsulting.in', password: 'Karan@FX2026', role: 'Recruiter' },
  { name: 'Bhumika Durgapal', email: 'bhumika@fxconsulting.in', password: 'Bhumika@FX2026', role: 'Account Manager' },
  { name: 'Jyoti Adhikari', email: 'jyoti@fxconsulting.in', password: 'Jyoti@FX2026', role: 'Recruiter' },
  { name: 'Priya Chhimwal', email: 'priya@fxconsulting.in', password: 'Priya@FX2026', role: 'Recruiter' },
];

const CLIENTS = [
  { name: 'BB', industry: 'Technology', vertical: 'IT', domain: 'IT Product', spoc_name: 'Nidhi', location: 'Bangalore', tier: 'Gold', fee_percent: 8.33, payment_terms: 'Net 30' },
  { name: 'StatusNeo', industry: 'IT Services', vertical: 'IT', domain: 'IT Services', spoc_name: 'Rishabh', location: 'Mumbai', tier: 'Silver', fee_percent: 8.33, payment_terms: 'Net 30' },
  { name: 'Shaadi.com', industry: 'Internet', vertical: 'IT', domain: 'Internet', spoc_name: 'Naazish Butt', location: 'Mumbai', tier: 'Silver', fee_percent: 8.33, payment_terms: 'Net 30' },
  { name: 'TT', industry: 'HVAC / Engineering', vertical: 'Non-IT', domain: 'HVAC', spoc_name: 'Hrishab', location: 'Pan India', tier: 'Platinum', fee_percent: 8.33, payment_terms: 'Net 30' },
];

const POSITIONS = [
  { title: 'Sr EM Bigdata', client: 'BB', location: 'Bangalore', priority: 'High' },
  { title: 'Lead Data Analyst', client: 'BB', location: 'Bangalore', priority: 'High' },
  { title: 'PE Mobile', client: 'BB', location: 'Bangalore', priority: 'High' },
  { title: 'Product Analyst', client: 'BB', location: 'Bangalore', priority: 'Medium' },
  { title: 'Solution Architect Java', client: 'StatusNeo', location: 'Mumbai', priority: 'High' },
  { title: 'Data Scientist', client: 'Shaadi.com', location: 'Mumbai', priority: 'Medium' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Noida', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Greater Noida', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Chandigarh', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Hyderabad', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Ahmedabad', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Mumbai', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Kolkata', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Chennai', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Gurugram', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Vizag', priority: 'High' },
  { title: 'Sr. Service Engineer', client: 'TT', location: 'Bangalore', priority: 'High' },
  { title: 'Asst Project Manager', client: 'TT', location: 'Pan India', priority: 'High' },
  { title: 'HVAC Sales', client: 'TT', location: 'Pan India', priority: 'Medium' },
  { title: 'Unitary Sales Leader', client: 'TT', location: 'Pan India', priority: 'High' },
  { title: 'Zonal Head ELV', client: 'TT', location: 'Pan India', priority: 'Critical' },
  { title: 'VRF Sales', client: 'TT', location: 'Pan India', priority: 'Medium' },
  { title: 'AHU Sales', client: 'TT', location: 'Pan India', priority: 'Medium' },
  { title: 'Service Sales', client: 'TT', location: 'Pan India', priority: 'Medium' },
  { title: 'Unitary Sales', client: 'TT', location: 'Pan India', priority: 'Medium' },
  { title: 'Data Center Engineer', client: 'TT', location: 'Pan India', priority: 'High' },
];

async function seed() {
  console.log('Starting seed...\n');

  // Drop everything clean
  console.log('Dropping old tables...');
  await query('DROP SCHEMA public CASCADE');
  await query('CREATE SCHEMA public');
  await query('GRANT ALL ON SCHEMA public TO postgres');
  await query('GRANT ALL ON SCHEMA public TO public');
  console.log('Clean schema ready\n');

  // ---- TEAM ----
  await query(`
    CREATE TABLE team (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(30) NOT NULL,
      phone VARCHAR(15),
      is_active BOOLEAN DEFAULT true,
      last_login TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ team table');

  // ---- CLIENTS ----
  await query(`
    CREATE TABLE clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      industry VARCHAR(100),
      vertical VARCHAR(20),
      domain VARCHAR(100),
      spoc_name VARCHAR(100),
      spoc_role VARCHAR(100),
      spoc_email VARCHAR(150),
      spoc_phone VARCHAR(15),
      location VARCHAR(200),
      tier VARCHAR(20),
      fee_percent DECIMAL(5,2),
      payment_terms VARCHAR(50),
      contract_end_date DATE,
      status VARCHAR(20) DEFAULT 'Active',
      notes TEXT,
      created_by UUID REFERENCES team(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ clients table');

  // ---- JOBS ----
  await query(`
    CREATE TABLE jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(200) NOT NULL,
      client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
      location VARCHAR(200),
      type VARCHAR(50) DEFAULT 'Full Time',
      ctc_min DECIMAL(12,2) DEFAULT 0,
      ctc_max DECIMAL(12,2) DEFAULT 0,
      exp_min INTEGER DEFAULT 0,
      exp_max INTEGER DEFAULT 0,
      description TEXT,
      skills TEXT,
      priority VARCHAR(20) DEFAULT 'Medium',
      deadline DATE,
      positions_count INTEGER DEFAULT 1,
      status VARCHAR(20) DEFAULT 'Open',
      internal_notes TEXT,
      created_by UUID REFERENCES team(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ jobs table');

  // ---- JOB ASSIGNMENTS ----
  await query(`
    CREATE TABLE job_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
      team_member_id UUID REFERENCES team(id) ON DELETE CASCADE,
      assigned_by UUID REFERENCES team(id),
      assigned_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(job_id, team_member_id)
    )
  `);
  console.log('+ job_assignments table');

  // ---- CANDIDATES ----
  // Note: "current_role" is a reserved word in PostgreSQL, so we quote it
  await query(`
    CREATE TABLE candidates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(150) NOT NULL,
      email VARCHAR(200),
      phone VARCHAR(15),
      location VARCHAR(200),
      experience_years DECIMAL(4,1),
      skills TEXT,
      "current_role" VARCHAR(200),
      current_company VARCHAR(200),
      education TEXT,
      current_ctc_fixed DECIMAL(12,2),
      current_ctc_variable DECIMAL(12,2),
      expected_ctc_fixed DECIMAL(12,2),
      expected_ctc_variable DECIMAL(12,2),
      notice_period VARCHAR(50),
      last_working_day DATE,
      holding_offer BOOLEAN DEFAULT false,
      holding_offer_details TEXT,
      referral_name VARCHAR(100),
      referral_phone VARCHAR(15),
      referral_bonus_eligible BOOLEAN DEFAULT false,
      assessment_soft_skills INTEGER,
      assessment_stability INTEGER,
      assessment_technical INTEGER,
      assessment_experience INTEGER,
      cv_url TEXT,
      cv_text TEXT,
      owner_id UUID REFERENCES team(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ candidates table');

  // ---- PIPELINE ----
  await query(`
    CREATE TABLE pipeline (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
      job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
      status VARCHAR(50) DEFAULT 'New',
      ai_match_percent DECIMAL(5,2),
      ai_match_details JSONB,
      notes TEXT,
      updated_by UUID REFERENCES team(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(candidate_id, job_id)
    )
  `);
  console.log('+ pipeline table');

  // ---- STATUS HISTORY ----
  await query(`
    CREATE TABLE candidate_status_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pipeline_id UUID REFERENCES pipeline(id) ON DELETE CASCADE,
      candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
      job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
      old_status VARCHAR(50),
      new_status VARCHAR(50) NOT NULL,
      changed_by UUID REFERENCES team(id),
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ candidate_status_history table');

  // ---- INTERVIEWS ----
  await query(`
    CREATE TABLE interviews (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pipeline_id UUID REFERENCES pipeline(id) ON DELETE CASCADE,
      candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
      job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
      interview_date DATE NOT NULL,
      interview_time TIME,
      type VARCHAR(50),
      mode VARCHAR(50),
      interviewer_name VARCHAR(150),
      meeting_link TEXT,
      notes TEXT,
      outcome VARCHAR(30),
      scheduled_by UUID REFERENCES team(id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ interviews table');

  // ---- PLACEMENTS ----
  await query(`
    CREATE TABLE placements (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      pipeline_id UUID REFERENCES pipeline(id),
      candidate_id UUID REFERENCES candidates(id),
      job_id UUID REFERENCES jobs(id),
      client_id UUID REFERENCES clients(id),
      joining_date DATE,
      offered_ctc DECIMAL(12,2),
      fee_percent DECIMAL(5,2),
      invoice_amount DECIMAL(12,2),
      payment_status VARCHAR(30) DEFAULT 'Pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ placements table');

  // ---- ACTIVITY LOG ----
  await query(`
    CREATE TABLE activity_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES team(id),
      action VARCHAR(50) NOT NULL,
      entity_type VARCHAR(50),
      entity_id UUID,
      details JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ activity_log table');

  // ---- CV PROCESSING LOG ----
  await query(`
    CREATE TABLE cv_processing_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      candidate_id UUID REFERENCES candidates(id),
      file_name VARCHAR(255),
      file_size INTEGER,
      processing_status VARCHAR(30) DEFAULT 'pending',
      parsed_data JSONB,
      error_message TEXT,
      processed_by UUID REFERENCES team(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  console.log('+ cv_processing_log table');

  console.log('\nAll 11 tables created!\n');

  // ======== SEED DATA ========

  console.log('Seeding team members...');
  for (const m of TEAM) {
    const hash = await bcrypt.hash(m.password, 12);
    await query(
      'INSERT INTO team (name, email, password_hash, role) VALUES ($1,$2,$3,$4)',
      [m.name, m.email, hash, m.role]
    );
    console.log('  + ' + m.name + ' (' + m.role + ')');
  }

  console.log('\nSeeding clients...');
  const clientIds = {};
  for (const c of CLIENTS) {
    const r = await query(
      'INSERT INTO clients (name,industry,vertical,domain,spoc_name,location,tier,fee_percent,payment_terms) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
      [c.name, c.industry, c.vertical, c.domain, c.spoc_name, c.location, c.tier, c.fee_percent, c.payment_terms]
    );
    clientIds[c.name] = r.rows[0].id;
    console.log('  + ' + c.name + ' (' + c.tier + ')');
  }

  console.log('\nSeeding positions...');
  let count = 0;
  for (const p of POSITIONS) {
    const cid = clientIds[p.client];
    if (!cid) continue;
    await query(
      'INSERT INTO jobs (title, client_id, location, type, priority, status) VALUES ($1,$2,$3,$4,$5,$6)',
      [p.title, cid, p.location, 'Full Time', p.priority, 'Open']
    );
    count++;
  }
  console.log('  + ' + count + ' positions seeded');

  // ======== VIEWS ========
  console.log('\nCreating report views...');

  await query(`
    CREATE OR REPLACE VIEW daily_sourcing_report AS
    SELECT DATE(csh.created_at) as report_date, t.id as team_member_id, t.name as team_member,
      t.role, COUNT(DISTINCT csh.candidate_id) as candidates_submitted
    FROM candidate_status_history csh JOIN team t ON t.id = csh.changed_by
    WHERE csh.new_status = 'Submitted to Client'
    GROUP BY DATE(csh.created_at), t.id, t.name, t.role ORDER BY report_date DESC
  `);

  await query(`
    CREATE OR REPLACE VIEW daily_interview_report AS
    SELECT i.interview_date as report_date, t.id as team_member_id, t.name as team_member,
      t.role, COUNT(DISTINCT i.candidate_id) as interviews_count
    FROM interviews i JOIN team t ON t.id = i.scheduled_by
    GROUP BY i.interview_date, t.id, t.name, t.role ORDER BY report_date DESC
  `);

  console.log('  + views created');

  console.log('\n========================================');
  console.log('SEED COMPLETE!');
  console.log('10 team members, 4 clients, ' + count + ' positions');
  console.log('========================================\n');

  await pool.end();
}

seed().catch((err) => { console.error('Seed failed:', err); process.exit(1); });
