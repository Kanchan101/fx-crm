const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Multer config for CV uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E6)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX files are allowed'));
  }
});

// POST /api/candidates/parse-cv — Upload and parse CV with AI
router.post('/parse-cv', authenticate, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();
    let extractedText = '';

    // Extract text from CV
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfModule = require("pdf-parse");
      const pdfFn = typeof pdfModule === "function" ? pdfModule : pdfModule.default;
      const pdfData = await pdfFn(dataBuffer);
      extractedText = pdfData.text;
    } else if (ext === '.docx' || ext === '.doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    }

    if (!extractedText || extractedText.trim().length < 20) {
      // Clean up file
      fs.unlinkSync(filePath);
      return res.status(400).json({ error: 'Could not extract text from CV. Try a different file format.' });
    }

    // Parse with Claude AI
    let parsedData = {};
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (ANTHROPIC_API_KEY) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2000,
            messages: [{
              role: 'user',
              content: `Parse this CV/resume text and extract the following information. Return ONLY a JSON object with these exact keys, no markdown, no explanation:

{
  "name": "full name",
  "email": "email address",
  "phone": "10 digit phone number only, no country code, no +91, no spaces",
  "location": "city or location",
  "experience_years": number (total years of experience as a number),
  "skills": "comma separated skills",
  "current_role": "current job title/designation",
  "current_company": "current company name",
  "education": "highest education with institution"
}

Rules:
- Phone: Extract ONLY 10 digits. Remove +91, 0, spaces, dashes. If multiple numbers, pick mobile.
- Experience: Calculate from work history or extract if mentioned. Return as number.
- Skills: Extract technical and relevant skills, comma separated.
- If any field is not found, use empty string "" for text or 0 for numbers.

CV TEXT:
${extractedText.substring(0, 8000)}`
            }]
          })
        });

        const aiResult = await response.json();
        const aiText = aiResult.content?.[0]?.text || '';

        // Parse JSON from response
        const jsonMatch = aiText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsedData = JSON.parse(jsonMatch[0]);
        }
      } catch (aiErr) {
        console.error('AI parsing error:', aiErr);
        // Continue without AI — user can fill manually
      }
    }

    // Log the processing
    await query(
      `INSERT INTO cv_processing_log (file_name, file_size, processing_status, parsed_data, processed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.file.originalname, req.file.size, ANTHROPIC_API_KEY ? 'parsed' : 'text_only',
       JSON.stringify(parsedData), req.user.id]
    );

    // Clean up uploaded file (we extracted text, don't need file anymore for now)
    // In production, you'd upload to Supabase Storage
    fs.unlinkSync(filePath);

    res.json({
      parsed: parsedData,
      raw_text: extractedText.substring(0, 10000),
      file_name: req.file.originalname,
    });

  } catch (err) {
    console.error('Parse CV error:', err);
    // Clean up file on error
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: err.message || 'Failed to parse CV' });
  }
});

// POST /api/candidates/match — AI match CV vs JD
router.post('/match', authenticate, async (req, res) => {
  try {
    const { cv_text, job_id } = req.body;
    if (!cv_text || !job_id) return res.status(400).json({ error: 'CV text and job ID required' });

    const jobResult = await query(
      `SELECT j.*, c.name as client_name FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1`,
      [job_id]
    );
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobResult.rows[0];
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return res.json({ match_percent: 0, matching_skills: [], missing_skills: [], summary: 'AI matching not configured' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Compare this CV against the job description and return ONLY a JSON object:

{
  "match_percent": number (0-100),
  "matching_skills": ["skill1", "skill2"],
  "missing_skills": ["skill1", "skill2"],
  "summary": "2-3 sentence assessment"
}

JOB: ${job.title} at ${job.client_name}
Location: ${job.location}
Experience: ${job.exp_min}-${job.exp_max} years
Skills Required: ${job.skills || 'Not specified'}
Description: ${(job.description || '').substring(0, 2000)}

CV TEXT:
${cv_text.substring(0, 6000)}`
        }]
      })
    });

    const aiResult = await response.json();
    const aiText = aiResult.content?.[0]?.text || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    let matchData = { match_percent: 0, matching_skills: [], missing_skills: [], summary: 'Could not analyze' };
    if (jsonMatch) {
      matchData = JSON.parse(jsonMatch[0]);
    }

    res.json(matchData);
  } catch (err) {
    console.error('Match error:', err);
    res.status(500).json({ error: 'Matching failed' });
  }
});

// GET /api/candidates — list with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, status, job_id, owner, page, limit } = req.query;
    const pageNum = parseInt(page) || 1;
    const pageSize = parseInt(limit) || 50;
    const offset = (pageNum - 1) * pageSize;

    let sql = `
      SELECT ca.*,
        t.name as owner_name,
        (SELECT COUNT(*) FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_count,
        (SELECT string_agg(DISTINCT p.status, ', ') FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_statuses,
        (SELECT string_agg(DISTINCT j.title || ' (' || cl.name || ')', ', ')
         FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients cl ON cl.id = j.client_id
         WHERE p.candidate_id = ca.id) as mapped_positions
      FROM candidates ca
      LEFT JOIN team t ON t.id = ca.owner_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (search) {
      sql += ` AND (LOWER(ca.name) LIKE $${idx} OR LOWER(ca.email) LIKE $${idx} OR ca.phone LIKE $${idx} OR LOWER(ca.skills) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }
    if (owner === 'mine') {
      sql += ` AND ca.owner_id = $${idx++}`;
      params.push(req.user.id);
    }

    sql += ` ORDER BY ca.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(pageSize, offset);

    const result = await query(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) FROM candidates ca WHERE 1=1';
    const countParams = [];
    let cIdx = 1;
    if (search) {
      countSql += ` AND (LOWER(ca.name) LIKE $${cIdx} OR LOWER(ca.email) LIKE $${cIdx} OR ca.phone LIKE $${cIdx})`;
      countParams.push(`%${search.toLowerCase()}%`);
      cIdx++;
    }
    if (owner === 'mine') {
      countSql += ` AND ca.owner_id = $${cIdx++}`;
      countParams.push(req.user.id);
    }
    const countResult = await query(countSql, countParams);

    res.json({
      candidates: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: pageNum,
      pages: Math.ceil(parseInt(countResult.rows[0].count) / pageSize),
    });
  } catch (err) {
    console.error('List candidates error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/candidates/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT ca.*, t.name as owner_name FROM candidates ca
       LEFT JOIN team t ON t.id = ca.owner_id WHERE ca.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Candidate not found' });

    const pipeline = await query(
      `SELECT p.*, j.title as job_title, j.location as job_location, c.name as client_name
       FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients c ON c.id = j.client_id
       WHERE p.candidate_id = $1 ORDER BY p.updated_at DESC`,
      [req.params.id]
    );

    const history = await query(
      `SELECT csh.*, t.name as changed_by_name, j.title as job_title
       FROM candidate_status_history csh
       LEFT JOIN team t ON t.id = csh.changed_by
       LEFT JOIN jobs j ON j.id = csh.job_id
       WHERE csh.candidate_id = $1 ORDER BY csh.created_at DESC LIMIT 20`,
      [req.params.id]
    );

    res.json({
      candidate: result.rows[0],
      pipeline: pipeline.rows,
      history: history.rows,
    });
  } catch (err) {
    console.error('Get candidate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/candidates — create candidate + optional pipeline entry
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name, email, phone, location, experience_years, skills,
      current_role, current_company, education,
      current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
      notice_period, last_working_day, holding_offer, holding_offer_details,
      referral_name, referral_phone, referral_bonus_eligible,
      assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience,
      cv_text, job_id, ai_match_percent, ai_match_details
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Candidate name is required' });

    const result = await transaction(async (client) => {
      const candidateResult = await client.query(
        `INSERT INTO candidates (
          name, email, phone, location, experience_years, skills,
          "current_role", current_company, education,
          current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
          notice_period, last_working_day, holding_offer, holding_offer_details,
          referral_name, referral_phone, referral_bonus_eligible,
          assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience,
          cv_text, owner_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
        RETURNING *`,
        [name, email, phone, location, experience_years || null, skills,
         current_role, current_company, education,
         current_ctc_fixed || null, current_ctc_variable || null,
         expected_ctc_fixed || null, expected_ctc_variable || null,
         notice_period, last_working_day || null,
         holding_offer || false, holding_offer_details,
         referral_name, referral_phone, referral_bonus_eligible || false,
         assessment_soft_skills || null, assessment_stability || null,
         assessment_technical || null, assessment_experience || null,
         cv_text, req.user.id]
      );

      const candidate = candidateResult.rows[0];

      // If job_id provided, create pipeline entry
      if (job_id) {
        await client.query(
          `INSERT INTO pipeline (candidate_id, job_id, status, ai_match_percent, ai_match_details, updated_by)
           VALUES ($1, $2, 'New', $3, $4, $5) ON CONFLICT DO NOTHING`,
          [candidate.id, job_id, ai_match_percent || null, ai_match_details ? JSON.stringify(ai_match_details) : null, req.user.id]
        );

        await client.query(
          `INSERT INTO candidate_status_history (candidate_id, job_id, new_status, changed_by)
           VALUES ($1, $2, 'New', $3)`,
          [candidate.id, job_id, req.user.id]
        );
      }

      await client.query(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, 'CREATE', 'candidate', candidate.id, JSON.stringify({ name, job_id })]
      );

      return candidate;
    });

    res.status(201).json({ candidate: result });
  } catch (err) {
    console.error('Create candidate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/candidates/:id — update
router.put('/:id', authenticate, async (req, res) => {
  try {
    // Check ownership
    const existing = await query('SELECT owner_id FROM candidates WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const isOwner = existing.rows[0].owner_id === req.user.id;
    const isSuperAdmin = req.user.role === 'Super Admin';
    if (!isOwner && !isSuperAdmin) return res.status(403).json({ error: 'Only owner or Super Admin can edit' });

    const {
      name, email, phone, location, experience_years, skills,
      current_role, current_company, education,
      current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
      notice_period, last_working_day, holding_offer, holding_offer_details,
      referral_name, referral_phone, referral_bonus_eligible,
      assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience
    } = req.body;

    const result = await query(
      `UPDATE candidates SET
        name=$1, email=$2, phone=$3, location=$4, experience_years=$5, skills=$6,
        "current_role"=$7, current_company=$8, education=$9,
        current_ctc_fixed=$10, current_ctc_variable=$11, expected_ctc_fixed=$12, expected_ctc_variable=$13,
        notice_period=$14, last_working_day=$15, holding_offer=$16, holding_offer_details=$17,
        referral_name=$18, referral_phone=$19, referral_bonus_eligible=$20,
        assessment_soft_skills=$21, assessment_stability=$22, assessment_technical=$23, assessment_experience=$24,
        updated_at=NOW()
       WHERE id=$25 RETURNING *`,
      [name, email, phone, location, experience_years || null, skills,
       current_role, current_company, education,
       current_ctc_fixed || null, current_ctc_variable || null,
       expected_ctc_fixed || null, expected_ctc_variable || null,
       notice_period, last_working_day || null, holding_offer || false, holding_offer_details,
       referral_name, referral_phone, referral_bonus_eligible || false,
       assessment_soft_skills || null, assessment_stability || null,
       assessment_technical || null, assessment_experience || null,
       req.params.id]
    );

    res.json({ candidate: result.rows[0] });
  } catch (err) {
    console.error('Update candidate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
