const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
require('dotenv').config();

const app = express();
const upload = multer({ dest: 'uploads/', limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

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

// ════════════════════════════════════════════════════════
// AUTH ROUTES
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
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar_color: user.avatar_color },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT id, name, email, role, phone, avatar_color FROM team WHERE id = $1',
    [req.user.id]
  );
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════

app.get('/api/dashboard/stats', auth, async (req, res) => {
  try {
    const [clients, candidates, jobs, pipeline, placements, recentCVs] = await Promise.all([
      pool.query("SELECT COUNT(*) FILTER (WHERE status = 'Active') as active, COUNT(*) as total FROM clients"),
      pool.query("SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = 'Active') as active, COUNT(*) FILTER (WHERE status = 'In Pipeline') as in_pipeline FROM candidates"),
      pool.query("SELECT COUNT(*) FILTER (WHERE status = 'Open') as open, SUM(CASE WHEN status = 'Open' THEN positions - filled ELSE 0 END) as open_positions FROM jobs"),
      pool.query("SELECT stage, COUNT(*) as count FROM pipeline GROUP BY stage ORDER BY CASE stage WHEN 'Sourced' THEN 1 WHEN 'Screening' THEN 2 WHEN 'Submitted to Client' THEN 3 WHEN 'Client Interview' THEN 4 WHEN 'Technical Round' THEN 5 WHEN 'HR Round' THEN 6 WHEN 'Offer Negotiation' THEN 7 WHEN 'Offer Accepted' THEN 8 WHEN 'Joined' THEN 9 END"),
      pool.query("SELECT COUNT(*) as total, COALESCE(SUM(fee_amount), 0) as revenue FROM placements WHERE EXTRACT(YEAR FROM joining_date) = 2026"),
      pool.query("SELECT COUNT(*) as week_count FROM cv_processing_log WHERE processed_at > NOW() - INTERVAL '7 days'"),
    ]);

    res.json({
      clients: clients.rows[0],
      candidates: candidates.rows[0],
      jobs: jobs.rows[0],
      pipeline: pipeline.rows,
      placements: placements.rows[0],
      weekCVs: parseInt(recentCVs.rows[0].week_count) || 0,
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

app.get('/api/clients/:id', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM clients WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Client not found' });
  res.json(result.rows[0]);
});

app.post('/api/clients', auth, async (req, res) => {
  const { company_name, industry, tier, poc_name, poc_role, email, phone, location, fee_percent, payment_terms, contract_end } = req.body;
  const result = await pool.query(
    `INSERT INTO clients (company_name, industry, tier, poc_name, poc_role, email, phone, location, fee_percent, payment_terms, contract_end)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [company_name, industry, tier || 'Silver', poc_name, poc_role, email, phone, location, fee_percent || 8.33, payment_terms || 'Net 30', contract_end]
  );
  res.json(result.rows[0]);
});

app.put('/api/clients/:id', auth, async (req, res) => {
  const fields = req.body;
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`);
  sets.push(`updated_at = NOW()`);
  const result = await pool.query(
    `UPDATE clients SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...Object.values(fields)]
  );
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// CANDIDATES
// ════════════════════════════════════════════════════════

app.get('/api/candidates', auth, async (req, res) => {
  const { status, source, search, page = 1, limit = 50 } = req.query;
  let query = 'SELECT * FROM candidates WHERE 1=1';
  const params = [];
  if (status && status !== 'All') { params.push(status); query += ` AND status = $${params.length}`; }
  if (source) { params.push(source); query += ` AND source = $${params.length}`; }
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (name ILIKE $${params.length} OR role ILIKE $${params.length} OR email ILIKE $${params.length})`;
  }
  // Count total
  const countResult = await pool.query(query.replace('SELECT *', 'SELECT COUNT(*)'), params);
  const total = parseInt(countResult.rows[0].count);

  const offset = (parseInt(page) - 1) * parseInt(limit);
  params.push(parseInt(limit), offset);
  query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const result = await pool.query(query, params);
  res.json({ data: result.rows, total, page: parseInt(page), limit: parseInt(limit) });
});

app.get('/api/candidates/:id', auth, async (req, res) => {
  const result = await pool.query('SELECT * FROM candidates WHERE id = $1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Candidate not found' });
  res.json(result.rows[0]);
});

app.post('/api/candidates', auth, async (req, res) => {
  const { name, email, phone, role, experience, skills, location, current_ctc, expected_ctc, notice_period, source } = req.body;
  const result = await pool.query(
    `INSERT INTO candidates (name, email, phone, role, experience, skills, location, current_ctc, expected_ctc, notice_period, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [name, email, phone, role, experience, skills || [], location, current_ctc, expected_ctc, notice_period, source || 'Direct']
  );
  res.json(result.rows[0]);
});

app.put('/api/candidates/:id', auth, async (req, res) => {
  const fields = req.body;
  const sets = Object.keys(fields).map((k, i) => `${k} = $${i + 2}`);
  sets.push(`updated_at = NOW()`);
  const result = await pool.query(
    `UPDATE candidates SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
    [req.params.id, ...Object.values(fields)]
  );
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// JOBS
// ════════════════════════════════════════════════════════

app.get('/api/jobs', auth, async (req, res) => {
  const { status, priority, search } = req.query;
  let query = `SELECT j.*, c.company_name as client_name, t.name as recruiter_name
               FROM jobs j
               LEFT JOIN clients c ON j.client_id = c.id
               LEFT JOIN team t ON j.recruiter_id = t.id
               WHERE 1=1`;
  const params = [];
  if (status && status !== 'All') { params.push(status); query += ` AND j.status = $${params.length}`; }
  if (priority) { params.push(priority); query += ` AND j.priority = $${params.length}`; }
  if (search) { params.push(`%${search}%`); query += ` AND (j.title ILIKE $${params.length} OR c.company_name ILIKE $${params.length})`; }
  query += ' ORDER BY j.posted_date DESC';
  const result = await pool.query(query, params);
  res.json(result.rows);
});

app.post('/api/jobs', auth, async (req, res) => {
  const { title, client_id, location, job_type, ctc_min, ctc_max, positions, skills_required, priority, deadline, description, recruiter_id } = req.body;
  const result = await pool.query(
    `INSERT INTO jobs (title, client_id, location, job_type, ctc_min, ctc_max, positions, skills_required, priority, deadline, description, recruiter_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
    [title, client_id, location, job_type || 'Permanent', ctc_min, ctc_max, positions || 1, skills_required || [], priority || 'Medium', deadline, description, recruiter_id]
  );
  res.json(result.rows[0]);
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

app.post('/api/pipeline', auth, async (req, res) => {
  const { candidate_id, job_id, stage, score, notes } = req.body;
  const result = await pool.query(
    `INSERT INTO pipeline (candidate_id, job_id, stage, score, recruiter_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [candidate_id, job_id, stage || 'Sourced', score || 0, req.user.id, notes]
  );
  res.json(result.rows[0]);
});

app.put('/api/pipeline/:id/stage', auth, async (req, res) => {
  const { stage, notes } = req.body;
  const { id } = req.params;

  const current = await pool.query('SELECT stage FROM pipeline WHERE id = $1', [id]);
  if (!current.rows[0]) return res.status(404).json({ error: 'Pipeline entry not found' });

  await pool.query(
    `UPDATE pipeline SET stage = $1, notes = $2, stage_changed_at = NOW() WHERE id = $3`,
    [stage, notes, id]
  );

  await pool.query(
    `INSERT INTO pipeline_history (pipeline_id, from_stage, to_stage, changed_by, notes)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, current.rows[0].stage, stage, req.user.id, notes]
  );

  res.json({ success: true, from: current.rows[0].stage, to: stage });
});

// ════════════════════════════════════════════════════════
// INTERVIEWS
// ════════════════════════════════════════════════════════

app.get('/api/interviews', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT i.*, c.name as candidate_name, c.email as candidate_email, c.phone as candidate_phone,
           j.title as job_title, cl.company_name as client_name, t.name as recruiter_name
    FROM interviews i
    JOIN candidates c ON i.candidate_id = c.id
    JOIN jobs j ON i.job_id = j.id
    LEFT JOIN clients cl ON j.client_id = cl.id
    LEFT JOIN team t ON i.recruiter_id = t.id
    ORDER BY i.interview_date, i.interview_time
  `);
  res.json(result.rows);
});

app.post('/api/interviews', auth, async (req, res) => {
  const { candidate_id, job_id, interview_date, interview_time, interview_type, mode, meet_link, interviewer_name, interviewer_email } = req.body;
  const result = await pool.query(
    `INSERT INTO interviews (candidate_id, job_id, interview_date, interview_time, interview_type, mode, meet_link, interviewer_name, interviewer_email, recruiter_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [candidate_id, job_id, interview_date, interview_time, interview_type || 'Screening', mode || 'Google Meet', meet_link, interviewer_name, interviewer_email, req.user.id]
  );
  res.json(result.rows[0]);
});

app.put('/api/interviews/:id', auth, async (req, res) => {
  const { status, feedback, rating } = req.body;
  const result = await pool.query(
    `UPDATE interviews SET status = COALESCE($1, status), feedback = COALESCE($2, feedback), rating = COALESCE($3, rating) WHERE id = $4 RETURNING *`,
    [status, feedback, rating, req.params.id]
  );
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// WHATSAPP
// ════════════════════════════════════════════════════════

app.get('/api/whatsapp/threads', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT DISTINCT ON (wm.candidate_id)
      wm.*, c.name as candidate_name
    FROM whatsapp_messages wm
    JOIN candidates c ON wm.candidate_id = c.id
    ORDER BY wm.candidate_id, wm.sent_at DESC
  `);
  res.json(result.rows);
});

app.get('/api/whatsapp/messages/:candidateId', auth, async (req, res) => {
  const result = await pool.query(
    'SELECT * FROM whatsapp_messages WHERE candidate_id = $1 ORDER BY sent_at ASC',
    [req.params.candidateId]
  );
  res.json(result.rows);
});

app.post('/api/whatsapp/send', auth, async (req, res) => {
  const { candidate_id, phone, message, template_name } = req.body;

  // Save to DB
  const result = await pool.query(
    `INSERT INTO whatsapp_messages (candidate_id, phone, direction, message, template_name, status)
     VALUES ($1, $2, 'outbound', $3, $4, 'sent') RETURNING *`,
    [candidate_id, phone, message, template_name]
  );

  // TODO: Send via Twilio/Meta API when configured
  // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_TOKEN);
  // await twilio.messages.create({
  //   body: message,
  //   from: `whatsapp:${process.env.TWILIO_WHATSAPP}`,
  //   to: `whatsapp:${phone}`,
  // });

  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// CV BULK UPLOAD
// ════════════════════════════════════════════════════════

app.post('/api/cv/upload', auth, upload.array('cvs', 100), async (req, res) => {
  const results = [];
  for (const file of (req.files || [])) {
    const logResult = await pool.query(
      `INSERT INTO cv_processing_log (source, file_name, file_size, parsed_status, processed_by)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [req.body.source || 'upload', file.originalname, file.size, req.user.id]
    );
    results.push(logResult.rows[0]);
  }
  res.json({ queued: results.length, files: results });
});

app.get('/api/cv/stats', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE parsed_status = 'success') as parsed,
      COUNT(*) FILTER (WHERE is_duplicate = true) as duplicates,
      COUNT(*) FILTER (WHERE parsed_status = 'pending') as pending,
      COUNT(*) FILTER (WHERE match_score > 70) as high_match
    FROM cv_processing_log
    WHERE processed_at > NOW() - INTERVAL '7 days'
  `);
  res.json(result.rows[0]);
});

// ════════════════════════════════════════════════════════
// TEAM
// ════════════════════════════════════════════════════════

app.get('/api/team', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT t.*,
      (SELECT COUNT(*) FROM pipeline p WHERE p.recruiter_id = t.id AND p.stage NOT IN ('Joined','Offer Accepted')) as active_pipeline,
      (SELECT COUNT(*) FROM placements pl WHERE pl.recruiter_id = t.id AND EXTRACT(YEAR FROM pl.joining_date) = 2026) as ytd_placements,
      (SELECT COALESCE(SUM(pl.fee_amount), 0) FROM placements pl WHERE pl.recruiter_id = t.id AND EXTRACT(YEAR FROM pl.joining_date) = 2026) as ytd_revenue
    FROM team t
    WHERE t.is_active = true
    ORDER BY t.id
  `);
  res.json(result.rows);
});

// ════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════

app.get('/api/reports/revenue', auth, async (req, res) => {
  const byClient = await pool.query(`
    SELECT c.company_name, COALESCE(SUM(p.fee_amount), 0) as revenue, COUNT(p.id) as placements
    FROM clients c LEFT JOIN placements p ON c.id = p.client_id
    GROUP BY c.id, c.company_name ORDER BY revenue DESC
  `);
  const byIndustry = await pool.query(`
    SELECT c.industry, COALESCE(SUM(p.fee_amount), 0) as revenue
    FROM clients c LEFT JOIN placements p ON c.id = p.client_id
    GROUP BY c.industry ORDER BY revenue DESC
  `);
  res.json({ byClient: byClient.rows, byIndustry: byIndustry.rows });
});

app.get('/api/reports/sourcing', auth, async (req, res) => {
  const result = await pool.query(`
    SELECT source, COUNT(*) as count,
      ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM candidates) * 100, 1) as percentage
    FROM candidates GROUP BY source ORDER BY count DESC
  `);
  res.json(result.rows);
});

// ════════════════════════════════════════════════════════
// HEALTH CHECK
// ════════════════════════════════════════════════════════

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'connected' });
  } catch {
    res.json({ status: 'ok', timestamp: new Date().toISOString(), database: 'disconnected' });
  }
});

// ── Start ──────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n  FX CRM API running on port ${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});
