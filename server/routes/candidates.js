const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadCV } = require('../lib/storage');
const { parseCV: aiParseCV, matchCVtoJD } = require('../lib/ai');

const router = express.Router();

// POST /api/candidates/check-duplicate — check if candidate already exists
router.post('/check-duplicate', authenticate, async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) return res.json({ duplicate: false });

    const conditions = [];
    const params = [];
    let idx = 1;

    if (email && email.trim()) {
      conditions.push('LOWER(ca.email) = LOWER($' + idx++ + ')');
      params.push(email.trim());
    }
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        conditions.push('ca.phone = $' + idx++);
        params.push(cleanPhone);
      }
    }

    if (conditions.length === 0) return res.json({ duplicate: false });

    const result = await query(
      'SELECT ca.id, ca.name, ca.email, ca.phone, ca.location, ca.experience_years, ' +
      'ca."current_role", ca.current_company, ca.created_at, t.name as uploaded_by, ' +
      '(SELECT string_agg(DISTINCT j.title, \', \') FROM pipeline p JOIN jobs j ON j.id = p.job_id WHERE p.candidate_id = ca.id) as mapped_positions, ' +
      '(SELECT string_agg(DISTINCT p.status, \', \') FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_statuses ' +
      'FROM candidates ca LEFT JOIN team t ON t.id = ca.owner_id ' +
      'WHERE ' + conditions.join(' OR ') + ' ORDER BY ca.created_at DESC',
      params
    );

    if (result.rows.length > 0) {
      res.json({ duplicate: true, matches: result.rows });
    } else {
      res.json({ duplicate: false });
    }
  } catch (err) {
    console.error('Duplicate check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1E6)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX allowed'));
  }
});

// POST /api/candidates/parse-cv
router.post('/parse-cv', authenticate, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let extractedText = '';

    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfModule = require('pdf-parse');
      const pdfFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
      const pdfData = await pdfFn(dataBuffer);
      extractedText = pdfData.text;
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    }

    if (!extractedText || extractedText.trim().length < 20) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Could not extract text from CV' });
    }

    // Upload raw file to Supabase Storage
    const fileBuffer = fs.readFileSync(filePath);
    let cvStoragePath = null;
    try {
      cvStoragePath = await uploadCV(fileBuffer, req.file.originalname, '');
    } catch (uploadErr) {
      console.error('[CV Upload] Storage error:', uploadErr.message);
    }

    // Parse with Claude AI
    let parsedData = {};
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (ANTHROPIC_API_KEY) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{ role: 'user', content: `Parse this CV/resume text and extract the following information. Return ONLY a JSON object with these exact keys, no markdown, no explanation:
{
  "name": "full name",
  "email": "email address",
  "phone": "10 digit phone number only, no country code, no +91, no spaces",
  "location": "city or location",
  "experience_years": number,
  "skills": "comma separated skills",
  "current_role": "current job title/designation",
  "current_company": "current company name",
  "education": "highest education with institution"
}
Rules:
- Phone: Extract ONLY 10 digits. Remove +91, 0, spaces, dashes.
- Experience: Calculate from work history or extract if mentioned. Return as number.
- If any field is not found, use empty string "" for text or 0 for numbers.

CV TEXT:
${extractedText.substring(0, 8000)}` }]
          })
        });
        const aiResult = await response.json();
        const aiText = aiResult.content?.[0]?.text || '';
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsedData = JSON.parse(jsonMatch[0]);
      } catch (aiErr) {
        console.error('AI parsing error:', aiErr);
      }
    }

    // If we got a name from parsing, re-upload with proper name
    if (parsedData.name && cvStoragePath) {
      try {
        const renamedPath = await uploadCV(fileBuffer, req.file.originalname, parsedData.name);
        if (renamedPath) cvStoragePath = renamedPath;
      } catch (e) { /* keep original path */ }
    }

    await query(
      'INSERT INTO cv_processing_log (file_name, file_size, processing_status, parsed_data, processed_by) VALUES ($1,$2,$3,$4,$5)',
      [req.file.originalname, req.file.size, 'parsed', JSON.stringify(parsedData), req.user.id]
    );

    // Clean up local file
    fs.unlinkSync(filePath);

    res.json({
      parsed: parsedData,
      raw_text: extractedText.substring(0, 10000),
      file_name: req.file.originalname,
      cv_storage_path: cvStoragePath,
    });
  } catch (err) {
    console.error('Parse CV error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message || 'Failed to parse CV' });
  }
});

// POST /api/candidates/match
router.post('/match', authenticate, async (req, res) => {
  try {
    const { cv_text, job_id } = req.body;
    if (!cv_text || !job_id) return res.status(400).json({ error: 'CV text and job ID required' });

    const jobResult = await query('SELECT j.*, c.name as client_name FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [job_id]);
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobResult.rows[0];
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.json({ match_percent: 0, matching_skills: [], missing_skills: [], summary: 'AI not configured' });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: `Compare CV against JD. Return ONLY JSON:
{"match_percent": number, "matching_skills": ["skill1"], "missing_skills": ["skill1"], "summary": "2-3 sentences"}

JOB: ${job.title} at ${job.client_name}, Location: ${job.location}, Exp: ${job.exp_min}-${job.exp_max}y
Skills: ${job.skills || ''}, Desc: ${(job.description || '').substring(0, 2000)}

CV: ${cv_text.substring(0, 6000)}` }]
      })
    });
    const aiResult = await response.json();
    const aiText = aiResult.content?.[0]?.text || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    let matchData = { match_percent: 0, matching_skills: [], missing_skills: [], summary: 'Could not analyze' };
    if (jsonMatch) matchData = JSON.parse(jsonMatch[0]);
    res.json(matchData);
  } catch (err) { console.error('Match error:', err); res.status(500).json({ error: 'Matching failed' }); }
});

// GET /api/candidates
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, owner, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 50;
    const offset = (pageNum - 1) * pageSize;

    let sql = `SELECT ca.*, t.name as owner_name,
      (SELECT COUNT(*) FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_count,
      (SELECT string_agg(DISTINCT p.status, ', ') FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_statuses,
      (SELECT string_agg(DISTINCT j.title || ' (' || cl.name || ')', ', ') FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients cl ON cl.id = j.client_id WHERE p.candidate_id = ca.id) as mapped_positions
      FROM candidates ca LEFT JOIN team t ON t.id = ca.owner_id WHERE 1=1`;
    const params = []; let idx = 1;

    if (search) { sql += ` AND (LOWER(ca.name) LIKE $${idx} OR LOWER(ca.email) LIKE $${idx} OR ca.phone LIKE $${idx} OR LOWER(ca.skills) LIKE $${idx})`; params.push(`%${search.toLowerCase()}%`); idx++; }
    if (owner === 'mine') { sql += ` AND ca.owner_id = $${idx++}`; params.push(req.user.id); }
    sql += ` ORDER BY ca.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);

    const result = await query(sql, params);
    let countSql = 'SELECT COUNT(*) FROM candidates ca WHERE 1=1';
    const countParams = []; let cIdx = 1;
    if (search) { countSql += ` AND (LOWER(ca.name) LIKE $${cIdx} OR LOWER(ca.email) LIKE $${cIdx} OR ca.phone LIKE $${cIdx})`; countParams.push(`%${search.toLowerCase()}%`); cIdx++; }
    if (owner === 'mine') { countSql += ` AND ca.owner_id = $${cIdx++}`; countParams.push(req.user.id); }
    const countResult = await query(countSql, countParams);

    res.json({ candidates: result.rows, total: parseInt(countResult.rows[0].count), page: pageNum });
  } catch (err) { console.error('List candidates error:', err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/candidates/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT ca.*, t.name as owner_name FROM candidates ca LEFT JOIN team t ON t.id = ca.owner_id WHERE ca.id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const pipeline = await query(
      'SELECT p.*, j.title as job_title, j.location as job_location, c.name as client_name FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients c ON c.id = j.client_id WHERE p.candidate_id = $1 ORDER BY p.updated_at DESC', [req.params.id]);
    const history = await query(
      'SELECT csh.*, t.name as changed_by_name, j.title as job_title FROM candidate_status_history csh LEFT JOIN team t ON t.id = csh.changed_by LEFT JOIN jobs j ON j.id = csh.job_id WHERE csh.candidate_id = $1 ORDER BY csh.created_at DESC LIMIT 20', [req.params.id]);
    res.json({ candidate: result.rows[0], pipeline: pipeline.rows, history: history.rows });
  } catch (err) { console.error('Get candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/candidates
router.post('/', authenticate, async (req, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Name required' });
    let safeCvText = null;
    if (b.cv_text && typeof b.cv_text === 'string') {
      safeCvText = '';
      for (let i = 0; i < b.cv_text.length; i++) {
        const code = b.cv_text.charCodeAt(i);
        if (code > 31 || code === 10 || code === 13 || code === 9) safeCvText += b.cv_text[i];
      }
    }
    console.log('[Candidate] Saving:', b.name, 'cv_storage_path:', b.cv_storage_path || 'NONE');
    const result = await transaction(async (client) => {
      const cr = await client.query(
        'INSERT INTO candidates (name, email, phone, location, experience_years, skills, "current_role", current_company, education, current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable, notice_period, last_working_day, holding_offer, holding_offer_details, referral_name, referral_phone, referral_bonus_eligible, assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience, cv_text, cv_url, owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *',
        [b.name, b.email, b.phone, b.location, b.experience_years || null, b.skills, b.current_role, b.current_company, b.education, b.current_ctc_fixed || null, b.current_ctc_variable || null, b.expected_ctc_fixed || null, b.expected_ctc_variable || null, b.notice_period, b.last_working_day || null, b.holding_offer || false, b.holding_offer_details, b.referral_name, b.referral_phone, b.referral_bonus_eligible || false, b.assessment_soft_skills || null, b.assessment_stability || null, b.assessment_technical || null, b.assessment_experience || null, safeCvText, b.cv_storage_path || null, req.user.id]
      );
      const candidate = cr.rows[0];
      console.log('[Candidate] Saved OK:', candidate.name, 'cv_url:', candidate.cv_url || 'STILL NULL');
      if (b.job_id) {
        await client.query('INSERT INTO pipeline (candidate_id, job_id, status, ai_match_percent, ai_match_details, updated_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [candidate.id, b.job_id, 'AM Review Pending', b.ai_match_percent || null, b.ai_match_details ? JSON.stringify(b.ai_match_details) : null, req.user.id]);
        await client.query('INSERT INTO candidate_status_history (candidate_id, job_id, new_status, changed_by) VALUES ($1,$2,$3,$4)', [candidate.id, b.job_id, 'AM Review Pending', req.user.id]);
      }
      await client.query('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'CREATE', 'candidate', candidate.id, JSON.stringify({ name: b.name })]);
      return candidate;
    });
    res.status(201).json({ candidate: result });
  } catch (err) { console.error('Create candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const existing = await query('SELECT owner_id FROM candidates WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    if (existing.rows[0].owner_id !== req.user.id && req.user.role !== 'Super Admin') return res.status(403).json({ error: 'Only owner or Super Admin can edit' });

    const {
      name, email, phone, location, experience_years, skills,
      current_role, current_company, education,
      current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
      notice_period, last_working_day, holding_offer, holding_offer_details,
      referral_name, referral_phone, referral_bonus_eligible,
      assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience
    } = req.body;

    const result = await query(
      `UPDATE candidates SET name=$1, email=$2, phone=$3, location=$4, experience_years=$5, skills=$6,
        "current_role"=$7, current_company=$8, education=$9,
        current_ctc_fixed=$10, current_ctc_variable=$11, expected_ctc_fixed=$12, expected_ctc_variable=$13,
        notice_period=$14, last_working_day=$15, holding_offer=$16, holding_offer_details=$17,
        referral_name=$18, referral_phone=$19, referral_bonus_eligible=$20,
        assessment_soft_skills=$21, assessment_stability=$22, assessment_technical=$23, assessment_experience=$24,
        updated_at=NOW() WHERE id=$25 RETURNING *`,
      [name, email, phone, location, experience_years || null, skills,
       current_role, current_company, education,
       current_ctc_fixed || null, current_ctc_variable || null,
       expected_ctc_fixed || null, expected_ctc_variable || null,
       notice_period, last_working_day || null, holding_offer || false, holding_offer_details,
       referral_name, referral_phone, referral_bonus_eligible || false,
       assessment_soft_skills || null, assessment_stability || null,
       assessment_technical || null, assessment_experience || null, req.params.id]
    );
    res.json({ candidate: result.rows[0] });
  } catch (err) { console.error('Update candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

// DELETE candidate — Super Admin only
router.delete('/:id', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    // Remove from all pipelines first
    await query('DELETE FROM pipeline WHERE candidate_id = $1', [req.params.id]);
    // Remove interviews
    try { await query('DELETE FROM interviews WHERE candidate_id = $1', [req.params.id]); } catch(e) {}
    // Delete candidate
    const result = await query('DELETE FROM candidates WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'DELETE', 'candidate', req.params.id, JSON.stringify({ name: result.rows[0].name })]);
    res.json({ message: 'Candidate deleted' });
  } catch (err) { console.error('Delete candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
