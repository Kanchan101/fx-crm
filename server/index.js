const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Node 18+ has native fetch, for older versions try node-fetch
let nodeFetch;
try { nodeFetch = typeof globalThis.fetch === 'function' ? globalThis.fetch : require('node-fetch'); } catch(e) { nodeFetch = null; }

const app = express();
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB per file
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ── Config ─────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const JWT_SECRET = process.env.JWT_SECRET || 'fx-crm-dev-secret-change-in-prod';

// ── Auth Middleware ────────────────────────────────────
const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Role check middleware
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' });
  next();
};

// Valid candidate statuses
const VALID_STATUSES = ['New', 'Screening', 'Account Manager Rejected', 'Submitted to Client', 'HR Review', 'Interview Stage', 'HR Discussion', 'Offer', 'Joined', 'Not Joined'];

// ════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query('SELECT * FROM team WHERE email = $1 AND is_active = true', [email]);
    if (!result.rows[0]) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign(
      { id: user.id, name: user.name, role: user.role, email: user.email },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_color: user.avatar_color } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query('SELECT id, name, email, role, phone, avatar_color FROM team WHERE id = $1', [req.user.id]);
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', auth, async (req, res) => {
  try {
    const isRecruiter = req.user.role === 'Recruiter';
    const userId = req.user.id;

    const [clients, candidates, jobs, pipeline, placements, todayInterviews] = await Promise.all([
      pool.query("SELECT COUNT(*) FILTER (WHERE status = 'Active') as active FROM clients"),
      isRecruiter
        ? pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE pipeline_status = 'New') as new FROM candidates WHERE owner_id = $1", [userId])
        : pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE pipeline_status = 'New') as new FROM candidates"),
      isRecruiter
        ? pool.query("SELECT COUNT(*) FILTER (WHERE status = 'Open') as open FROM jobs WHERE recruiter_id = $1", [userId])
        : pool.query("SELECT COUNT(*) FILTER (WHERE status = 'Open') as open FROM jobs"),
      pool.query("SELECT stage, COUNT(*) as count FROM pipeline GROUP BY stage"),
      pool.query("SELECT COUNT(*) as total, COALESCE(SUM(fee_amount), 0) as revenue FROM placements WHERE EXTRACT(YEAR FROM joining_date) = 2026"),
      pool.query("SELECT COUNT(*) as count FROM interviews WHERE interview_date = CURRENT_DATE"),
    ]);

    res.json({
      clients: clients.rows[0],
      candidates: candidates.rows[0],
      jobs: jobs.rows[0],
      pipeline: pipeline.rows,
      placements: placements.rows[0],
      todayInterviews: parseInt(todayInterviews.rows[0].count),
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// ════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════

app.get('/api/clients', auth, async (req, res) => {
  const { status, tier, search } = req.query;
  let query = 'SELECT * FROM clients WHERE 1=1';
  const params = [];
  if (status) { params.push(status); query += ` AND status = $${params.length}`; }
  if (tier) { params.push(tier); query += ` AND tier = $${params.length}`; }
  if (search) { params.push(`%${search}%`); query += ` AND (company_name ILIKE $${params.length} OR industry ILIKE $${params.length})`; }
  query += ' ORDER BY company_name';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.post('/api/clients', auth, requireRole('Super Admin', 'Account Manager'), async (req, res) => {
  const { company_name, industry, tier, poc_name, poc_role, email, phone, location, fee_percent, payment_terms, contract_end } = req.body;
  const result = await pool.query(
    `INSERT INTO clients (company_name, industry, tier, poc_name, poc_role, email, phone, location, fee_percent, payment_terms, contract_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [company_name, industry, tier || 'Silver', poc_name, poc_role, email, phone, location, fee_percent || 8.33, payment_terms || 'Net 30', contract_end]
  );
  res.json(result.rows[0]);
});

app.put('/api/clients/:id', auth, requireRole('Super Admin', 'Account Manager'), async (req, res) => {
  const fields = req.body;
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  sets.push(`updated_at = NOW()`);
  const result = await pool.query(
    `UPDATE clients SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...Object.values(fields)]
  );
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// CANDIDATES — with CV upload + assessment
// ════════════════════════════════════════════════════════

app.get('/api/candidates', auth, async (req, res) => {
  const { status, source, search, owner, page = 1, limit = 50 } = req.query;
  let query = `SELECT c.*, t.name as owner_name, t2.name as assessor_name 
               FROM candidates c 
               LEFT JOIN team t ON c.owner_id = t.id 
               LEFT JOIN team t2 ON c.assessed_by = t2.id WHERE 1=1`;
  const params = [];
  if (status && status !== 'All') { params.push(status); query += ` AND c.pipeline_status = $${params.length}`; }
  if (source) { params.push(source); query += ` AND c.source = $${params.length}`; }
  if (owner) { params.push(parseInt(owner)); query += ` AND c.owner_id = $${params.length}`; }
  if (search) { params.push(`%${search}%`); query += ` AND (c.name ILIKE $${params.length} OR c.role ILIKE $${params.length} OR c.email ILIKE $${params.length})`; }

  const countQ = query.replace(/SELECT.*FROM/, 'SELECT COUNT(*) FROM');
  const countResult = await pool.query(countQ, params);
  const total = parseInt(countResult.rows[0].count);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);
  query += ` ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
  const result = await pool.query(query, params);
  res.json({ data: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
});

// Add candidate with full assessment form
app.post('/api/candidates', auth, async (req, res) => {
  try {
    const {
      name, email, phone, role, experience, skills, location,
      current_ctc, expected_ctc, current_ctc_fixed, current_ctc_variable,
      expected_ctc_fixed, expected_ctc_variable, notice_period, source,
      last_working_day, holding_offer, holding_offer_details,
      referral_name, referral_phone,
      score_soft_skills, score_stability, score_technical, score_relevant_exp,
      assessment_notes, job_id
    } = req.body;

    // Calculate overall score
    const scores = [score_soft_skills, score_stability, score_technical, score_relevant_exp].filter(s => s != null);
    const resume_score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) : 0;

    const result = await pool.query(
      `INSERT INTO candidates (
        name, email, phone, role, experience, skills, location,
        current_ctc, expected_ctc, current_ctc_fixed, current_ctc_variable,
        expected_ctc_fixed, expected_ctc_variable, notice_period, source,
        last_working_day, holding_offer, holding_offer_details,
        referral_name, referral_phone, referral_bonus_eligible,
        score_soft_skills, score_stability, score_technical, score_relevant_exp,
        assessment_notes, assessed_by, assessed_at, resume_score,
        owner_id, pipeline_status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,NOW(),$28,$29,'New'
      ) RETURNING *`,
      [
        name, email, phone, role, experience, skills || [], location,
        current_ctc, expected_ctc, current_ctc_fixed, current_ctc_variable,
        expected_ctc_fixed, expected_ctc_variable, notice_period, source || 'Direct',
        last_working_day, holding_offer || false, holding_offer_details,
        referral_name, referral_phone, !!(referral_name),
        score_soft_skills, score_stability, score_technical, score_relevant_exp,
        assessment_notes, req.user.id, resume_score, req.user.id
      ]
    );

    // Log status history
    await pool.query(
      `INSERT INTO candidate_status_history (candidate_id, from_status, to_status, changed_by, changed_by_role, notes)
       VALUES ($1, NULL, 'New', $2, $3, 'Candidate added')`,
      [result.rows[0].id, req.user.id, req.user.role]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Add candidate error:', err);
    res.status(500).json({ error: 'Failed to add candidate', details: err.message });
  }
});

// ── CV Upload endpoint ────────────────────────────────
app.post('/api/candidates/:id/upload-cv', auth, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const candidateId = req.params.id;
    const result = await pool.query(
      `INSERT INTO cv_uploads (candidate_id, uploaded_by, file_name, file_size, file_type, storage_path, parsed_status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *`,
      [candidateId, req.user.id, req.file.originalname, req.file.size, req.file.mimetype, req.file.path]
    );

    // Update candidate resume_url
    await pool.query('UPDATE candidates SET resume_url = $1 WHERE id = $2', [req.file.path, candidateId]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('CV upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Upload CV + create candidate in one step
app.post('/api/candidates/upload-with-cv', auth, upload.single('cv'), async (req, res) => {
  try {
    const data = JSON.parse(req.body.data || '{}');
    const {
      name, email, phone, role, experience, location, source,
      current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
      notice_period, last_working_day, holding_offer, holding_offer_details,
      referral_name, referral_phone,
      score_soft_skills, score_stability, score_technical, score_relevant_exp,
      assessment_notes, job_id
    } = data;

    const scores = [score_soft_skills, score_stability, score_technical, score_relevant_exp].filter(s => s != null);
    const resume_score = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) : 0;

    // Create candidate
    const candidateResult = await pool.query(
      `INSERT INTO candidates (
        name, email, phone, role, experience, location, source,
        current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
        notice_period, last_working_day, holding_offer, holding_offer_details,
        referral_name, referral_phone, referral_bonus_eligible,
        score_soft_skills, score_stability, score_technical, score_relevant_exp,
        assessment_notes, assessed_by, assessed_at, resume_score,
        owner_id, pipeline_status, resume_url
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,NOW(),$25,$26,'New',$27
      ) RETURNING *`,
      [
        name, email, phone, role, experience, location, source || 'Direct',
        current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
        notice_period, last_working_day, holding_offer || false, holding_offer_details,
        referral_name, referral_phone, !!(referral_name),
        score_soft_skills, score_stability, score_technical, score_relevant_exp,
        assessment_notes, req.user.id, resume_score, req.user.id, req.file?.path || null
      ]
    );

    const candidate = candidateResult.rows[0];

    // Save CV upload record
    if (req.file) {
      await pool.query(
        `INSERT INTO cv_uploads (candidate_id, uploaded_by, file_name, file_size, file_type, storage_path, parsed_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
        [candidate.id, req.user.id, req.file.originalname, req.file.size, req.file.mimetype, req.file.path]
      );
    }

    // Log status
    await pool.query(
      `INSERT INTO candidate_status_history (candidate_id, from_status, to_status, changed_by, changed_by_role, notes)
       VALUES ($1, NULL, 'New', $2, $3, $4)`,
      [candidate.id, req.user.id, req.user.role, `Candidate added with CV by ${req.user.name}`]
    );

    res.json(candidate);
  } catch (err) {
    console.error('Upload with CV error:', err);
    res.status(500).json({ error: 'Failed to create candidate', details: err.message });
  }
});

// ── Change candidate status ───────────────────────────
app.put('/api/candidates/:id/status', auth, async (req, res) => {
  try {
    const { status, notes, job_id } = req.body;
    const candidateId = req.params.id;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Get current candidate
    const current = await pool.query('SELECT pipeline_status, owner_id FROM candidates WHERE id = $1', [candidateId]);
    if (!current.rows[0]) return res.status(404).json({ error: 'Candidate not found' });

    const candidate = current.rows[0];

    // Permission check: Account Manager cannot change status of candidates sourced by others
    // But Super Admin can change anything
    if (req.user.role === 'Account Manager' && candidate.owner_id && candidate.owner_id !== req.user.id) {
      // Account managers CAN still review and reject, but cannot change status of other's candidates
      // Actually per requirement: "Account manager should NOT change status of candidates sourced by recruiter and by himself"
      // This means only recruiters change status? Let me re-read...
      // "Recruiter should be able to change status" — so recruiters change, AMs don't change status at all
      // But that seems odd. Let me implement: AM can only reject (Account Manager Rejected), recruiter handles the rest
      if (status !== 'Account Manager Rejected') {
        return res.status(403).json({ error: 'Account Managers can only reject candidates. Recruiter manages the pipeline status.' });
      }
    }

    // Update status
    await pool.query('UPDATE candidates SET pipeline_status = $1, updated_at = NOW() WHERE id = $2', [status, candidateId]);

    // Log history
    await pool.query(
      `INSERT INTO candidate_status_history (candidate_id, job_id, from_status, to_status, changed_by, changed_by_role, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [candidateId, job_id || null, candidate.pipeline_status, status, req.user.id, req.user.role, notes]
    );

    res.json({ success: true, from: candidate.pipeline_status, to: status });
  } catch (err) {
    console.error('Status change error:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Get candidate status history
app.get('/api/candidates/:id/history', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT csh.*, t.name as changed_by_name
    FROM candidate_status_history csh
    LEFT JOIN team t ON csh.changed_by = t.id
    WHERE csh.candidate_id = $1
    ORDER BY csh.changed_at DESC
  `, [req.params.id]);
  res.json(result.rows);
});

// ════════════════════════════════════════════════════════
// JOBS — with Job Descriptions + sharing
// ════════════════════════════════════════════════════════

app.get('/api/jobs', auth, async (req, res) => {
  const { status, priority, search, recruiter_id } = req.query;
  let query = `SELECT j.*, c.company_name as client_name, t.name as recruiter_name
               FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
               LEFT JOIN team t ON j.recruiter_id = t.id WHERE 1=1`;
  const params = [];
  if (status && status !== 'All') { params.push(status); query += ` AND j.status = $${params.length}`; }
  if (priority) { params.push(priority); query += ` AND j.priority = $${params.length}`; }
  if (recruiter_id) { params.push(parseInt(recruiter_id)); query += ` AND j.recruiter_id = $${params.length}`; }
  if (search) { params.push(`%${search}%`); query += ` AND (j.title ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`; }
  query += ' ORDER BY j.posted_date DESC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.post('/api/jobs', auth, requireRole('Super Admin', 'Account Manager'), async (req, res) => {
  const { title, client_id, location, job_type, ctc_min, ctc_max, positions, skills_required,
          priority, deadline, description, recruiter_id, job_description, responsibilities, qualifications, benefits } = req.body;
  const result = await pool.query(
    `INSERT INTO jobs (title, client_id, location, job_type, ctc_min, ctc_max, positions,
     skills_required, priority, deadline, description, recruiter_id, job_description, responsibilities, qualifications, benefits)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
    [title, client_id, location, job_type || 'Permanent', ctc_min, ctc_max, positions || 1,
     skills_required || [], priority || 'Medium', deadline, description, recruiter_id,
     job_description, responsibilities, qualifications, benefits]
  );
  res.json(result.rows[0]);
});

// Update job (including JD and assignment)
app.put('/api/jobs/:id', auth, requireRole('Super Admin', 'Account Manager'), async (req, res) => {
  const fields = req.body;
  const keys = Object.keys(fields);
  const sets = keys.map((k, i) => `${k} = $${i + 2}`);
  sets.push('updated_at = NOW()');
  const result = await pool.query(
    `UPDATE jobs SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...Object.values(fields)]
  );
  res.json(result.rows[0]);
});

// Get job with full description
app.get('/api/jobs/:id', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT j.*, c.company_name as client_name, t.name as recruiter_name
    FROM jobs j LEFT JOIN clients c ON j.client_id = c.id
    LEFT JOIN team t ON j.recruiter_id = t.id
    WHERE j.id = $1
  `, [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Job not found' });
  res.json(result.rows[0]);
});

// Generate shareable JD link
app.get('/api/jobs/:id/share', auth, async (req, res) => {
  const result = await pool.query('SELECT title, job_description, location, skills_required FROM jobs WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Job not found' });
  const job = result.rows[0];

  // Generate text for LinkedIn/job boards
  const shareText = `🔔 Hiring: ${job.title}\n📍 ${job.location}\n\n${job.job_description || 'Job description not available'}\n\nSkills: ${(job.skills_required || []).join(', ')}\n\nApply now! Contact: careers@fxconsulting.in`;

  res.json({
    text: shareText,
    linkedin_url: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://fxconsulting.in')}&title=${encodeURIComponent(job.title)}&summary=${encodeURIComponent(shareText.substring(0, 256))}`,
    iimjobs_url: `https://www.iimjobs.com/postjob`,
  });
});

// ════════════════════════════════════════════════════════
// PIPELINE
// ════════════════════════════════════════════════════════

app.get('/api/pipeline', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT p.*, c.name as candidate_name, c.phone as candidate_phone,
           j.title as job_title, cl.company_name as client_name,
           t.name as recruiter_name
    FROM pipeline p
    JOIN candidates c ON p.candidate_id = c.id
    JOIN jobs j ON p.job_id = j.id
    LEFT JOIN clients cl ON j.client_id = cl.id
    LEFT JOIN team t ON p.recruiter_id = t.id
    ORDER BY p.stage_changed_at DESC
  `);
  res.json(result.rows);
});

app.put('/api/pipeline/:id/stage', auth, async (req, res) => {
  const { stage, notes } = req.body;
  const { id } = req.params;
  const current = await pool.query('SELECT stage FROM pipeline WHERE id = $1', [id]);
  if (!current.rows[0]) return res.status(404).json({ error: 'Pipeline entry not found' });
  await pool.query('UPDATE pipeline SET stage = $1, notes = $2, stage_changed_at = NOW() WHERE id = $3', [stage, notes, id]);
  await pool.query(
    'INSERT INTO pipeline_history (pipeline_id, from_stage, to_stage, changed_by, notes) VALUES ($1,$2,$3,$4,$5)',
    [id, current.rows[0].stage, stage, req.user.id, notes]
  );
  res.json({ success: true });
});

// ════════════════════════════════════════════════════════
// INTERVIEWS — daily/weekly/monthly views
// ════════════════════════════════════════════════════════

app.get('/api/interviews', auth, async (req, res) => {
  const { view, date, recruiter_id } = req.query;
  let dateFilter = '';
  const params = [];

  if (view === 'daily' && date) {
    params.push(date);
    dateFilter = `AND i.interview_date = $${params.length}`;
  } else if (view === 'weekly' && date) {
    params.push(date, date);
    dateFilter = `AND i.interview_date >= $${params.length - 1}::date AND i.interview_date < ($${params.length}::date + INTERVAL '7 days')`;
  } else if (view === 'monthly' && date) {
    params.push(date);
    dateFilter = `AND DATE_TRUNC('month', i.interview_date) = DATE_TRUNC('month', $${params.length}::date)`;
  }

  if (recruiter_id) {
    params.push(parseInt(recruiter_id));
    dateFilter += ` AND i.recruiter_id = $${params.length}`;
  }

  const result = await pool.query(`
    SELECT i.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone,
           j.title as job_title, cl.company_name as client_name, t.name as recruiter_name
    FROM interviews i
    JOIN candidates c ON i.candidate_id = c.id
    JOIN jobs j ON i.job_id = j.id
    LEFT JOIN clients cl ON j.client_id = cl.id
    LEFT JOIN team t ON i.recruiter_id = t.id
    WHERE 1=1 ${dateFilter}
    ORDER BY i.interview_date, i.interview_time
  `, params);
  res.json(result.rows);
});

app.post('/api/interviews', auth, async (req, res) => {
  const { candidate_id, job_id, interview_date, interview_time, interview_type, mode, meet_link, interviewer_name, interviewer_email } = req.body;
  const result = await pool.query(
    `INSERT INTO interviews (candidate_id, job_id, interview_date, interview_time, interview_type, mode, meet_link, interviewer_name, interviewer_email, recruiter_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [candidate_id, job_id, interview_date, interview_time, interview_type, mode || 'Google Meet', meet_link, interviewer_name, interviewer_email, req.user.id]
  );

  // Update candidate status to Interview Stage
  await pool.query("UPDATE candidates SET pipeline_status = 'Interview Stage' WHERE id = $1", [candidate_id]);
  await pool.query(
    `INSERT INTO candidate_status_history (candidate_id, job_id, to_status, changed_by, changed_by_role, notes)
     VALUES ($1, $2, 'Interview Stage', $3, $4, $5)`,
    [candidate_id, job_id, req.user.id, req.user.role, `Interview scheduled for ${interview_date}`]
  );

  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════

// Daily sourcing report
app.get('/api/reports/daily-sourcing', auth, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const result = await pool.query(`
    SELECT 
      t.name as recruiter_name, t.role as recruiter_role,
      COUNT(*) as candidates_submitted,
      COUNT(DISTINCT csh.candidate_id) as unique_candidates,
      ARRAY_AGG(DISTINCT c.name) as candidate_names
    FROM candidate_status_history csh
    JOIN team t ON csh.changed_by = t.id
    JOIN candidates c ON csh.candidate_id = c.id
    WHERE csh.to_status = 'Submitted to Client'
      AND DATE(csh.changed_at) = $1
    GROUP BY t.name, t.role
    ORDER BY candidates_submitted DESC
  `, [targetDate]);
  res.json({ date: targetDate, data: result.rows });
});

// Daily interview report
app.get('/api/reports/daily-interviews', auth, async (req, res) => {
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];
  const result = await pool.query(`
    SELECT 
      t.name as recruiter_name, t.role as recruiter_role,
      COUNT(DISTINCT i.candidate_id) as unique_interviews,
      ARRAY_AGG(DISTINCT c.name) as candidate_names,
      ARRAY_AGG(DISTINCT cl.company_name) as clients
    FROM interviews i
    JOIN team t ON i.recruiter_id = t.id
    JOIN candidates c ON i.candidate_id = c.id
    JOIN jobs j ON i.job_id = j.id
    LEFT JOIN clients cl ON j.client_id = cl.id
    WHERE i.interview_date = $1
    GROUP BY t.name, t.role
    ORDER BY unique_interviews DESC
  `, [targetDate]);
  res.json({ date: targetDate, data: result.rows });
});

// Weekly/monthly summary
app.get('/api/reports/summary', auth, async (req, res) => {
  const { period } = req.query; // 'week' or 'month'
  const interval = period === 'month' ? '30 days' : '7 days';

  const [sourcing, interviews, placements] = await Promise.all([
    pool.query(`
      SELECT t.name, COUNT(*) as submitted
      FROM candidate_status_history csh
      JOIN team t ON csh.changed_by = t.id
      WHERE csh.to_status = 'Submitted to Client' AND csh.changed_at > NOW() - $1::interval
      GROUP BY t.name ORDER BY submitted DESC
    `, [interval]),
    pool.query(`
      SELECT t.name, COUNT(DISTINCT i.candidate_id) as interviews
      FROM interviews i JOIN team t ON i.recruiter_id = t.id
      WHERE i.interview_date > CURRENT_DATE - $1::interval
      GROUP BY t.name ORDER BY interviews DESC
    `, [interval]),
    pool.query(`
      SELECT t.name, COUNT(*) as joined
      FROM candidate_status_history csh
      JOIN team t ON csh.changed_by = t.id
      WHERE csh.to_status = 'Joined' AND csh.changed_at > NOW() - $1::interval
      GROUP BY t.name ORDER BY joined DESC
    `, [interval]),
  ]);

  res.json({
    period,
    sourcing: sourcing.rows,
    interviews: interviews.rows,
    placements: placements.rows,
  });
});

// Revenue report
app.get('/api/reports/revenue', auth, requireRole('Super Admin', 'Account Manager'), async (req, res) => {
  const byClient = await pool.query(`
    SELECT c.company_name, COALESCE(SUM(p.fee_amount), 0) as revenue, COUNT(p.id) as placements
    FROM clients c LEFT JOIN placements p ON c.id = p.client_id
    GROUP BY c.id, c.company_name ORDER BY revenue DESC
  `);
  res.json({ byClient: byClient.rows });
});

// ════════════════════════════════════════════════════════
// TEAM
// ════════════════════════════════════════════════════════

app.get('/api/team', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT t.*,
      (SELECT COUNT(*) FROM candidates c WHERE c.owner_id = t.id AND c.pipeline_status NOT IN ('Joined','Not Joined')) as active_candidates,
      (SELECT COUNT(*) FROM candidate_status_history csh WHERE csh.changed_by = t.id AND csh.to_status = 'Submitted to Client' AND csh.changed_at > NOW() - INTERVAL '30 days') as monthly_submissions,
      (SELECT COUNT(*) FROM candidate_status_history csh WHERE csh.changed_by = t.id AND csh.to_status = 'Joined') as total_placements,
      (SELECT COALESCE(SUM(pl.fee_amount), 0) FROM placements pl WHERE pl.recruiter_id = t.id) as total_revenue
    FROM team t WHERE t.is_active = true ORDER BY t.id
  `);
  res.json(result.rows);
});

// ════════════════════════════════════════════════════════
// WHATSAPP
// ════════════════════════════════════════════════════════

app.get('/api/whatsapp/threads', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT ON (wm.candidate_id) wm.*, c.name as candidate_name
    FROM whatsapp_messages wm JOIN candidates c ON wm.candidate_id = c.id
    ORDER BY wm.candidate_id, wm.sent_at DESC
  `);
  res.json(result.rows);
});

app.post('/api/whatsapp/send', auth, async (req, res) => {
  const { candidate_id, phone, message, template_name } = req.body;
  const result = await pool.query(
    `INSERT INTO whatsapp_messages (candidate_id, phone, direction, message, template_name, status)
     VALUES ($1, $2, 'outbound', $3, $4, 'sent') RETURNING *`,
    [candidate_id, phone, message, template_name]
  );
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// AI — Claude-powered CV parsing & JD matching
// ════════════════════════════════════════════════════════

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const callClaude = async (prompt) => {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const fetchFn = globalThis.fetch || nodeFetch;
  if (!fetchFn) throw new Error('fetch not available - upgrade to Node 18+');
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text || '';
};

// Parse CV text → extract candidate details
app.post('/api/ai/parse-cv', auth, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 30) return res.status(400).json({ error: 'CV text too short' });

    const prompt = `You are an expert Indian recruitment CV parser. Extract candidate details from this resume text accurately.

RESUME TEXT:
${text.substring(0, 5000)}

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation before or after. Just the JSON:
{
  "name": "candidate full name",
  "email": "email or empty string",
  "phone": "phone with +91 prefix or empty string",
  "location": "current city or empty string",
  "experience": "total years like 5 yrs or empty string",
  "current_role": "current/latest job title or empty string",
  "current_company": "current/latest company or empty string",
  "skills": ["skill1", "skill2", "skill3"],
  "education": "highest degree and college or empty string"
}

Rules:
- Name: person's full name only, never company name or document title
- Phone: always add +91 prefix for Indian 10-digit numbers
- Location: current city of residence, not hometown
- Experience: total professional experience in years
- Skills: top 8 technical and professional skills found in CV
- If not found, use empty string or empty array`;

    const response = await callClaude(prompt);
    const clean = response.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error('AI parse error:', err.message);
    res.status(500).json({ error: 'AI parsing failed: ' + err.message });
  }
});

// Match CV against Job Description
app.post('/api/ai/match-jd', auth, async (req, res) => {
  try {
    const { cvText, jobDescription, jobTitle } = req.body;
    if (!cvText || !jobTitle) return res.status(400).json({ error: 'CV text and job title required' });

    const prompt = `You are a senior recruitment consultant. Analyze how well this candidate's CV matches the job requirements.

JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription || 'Not provided'}

CANDIDATE CV:
${cvText.substring(0, 4000)}

Respond ONLY with valid JSON. No markdown, no backticks:
{
  "match_percentage": <number 0-100>,
  "summary": "2-3 sentence match summary",
  "matching_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "experience_match": "one line about experience fit",
  "recommendation": "Strong Match" or "Good Match" or "Partial Match" or "Weak Match"
}`;

    const response = await callClaude(prompt);
    const clean = response.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    res.json(parsed);
  } catch (err) {
    console.error('AI match error:', err.message);
    res.status(500).json({ error: 'AI matching failed: ' + err.message });
  }
});

// ════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════

app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW(), pg_database_size(current_database()) as db_size');
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: 'connected',
      db_size_mb: Math.round(parseInt(dbCheck.rows[0].db_size) / 1024 / 1024),
    });
  } catch {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'disconnected' });
  }
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  FX CRM API v2 running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});
