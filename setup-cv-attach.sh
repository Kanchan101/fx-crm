#!/bin/bash
# FX CRM — Hero Feature: CV Storage + PDF Attachments in Client Emails
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-cv-attach.sh

set -e
echo "🚀 FX CRM — Hero Feature: CV Attachments"
echo ""

# ========================
# Install Supabase client
# ========================
cd server && npm install @supabase/supabase-js 2>/dev/null && cd ..
echo "✅ @supabase/supabase-js installed"

# ========================
# BACKEND: Supabase Storage helper
# ========================
cat > server/lib/storage.js << 'EOF'
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

let supabase = null;
if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[Storage] Supabase Storage connected');
} else {
  console.warn('[Storage] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — CV storage disabled');
}

// Upload CV file to Supabase Storage
async function uploadCV(fileBuffer, fileName, candidateName) {
  if (!supabase) {
    console.warn('[Storage] Skipping upload — Supabase not configured');
    return null;
  }

  // Clean filename: CandidateName_OriginalName.ext
  const cleanName = candidateName
    ? candidateName.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)
    : 'candidate';
  const timestamp = Date.now();
  const ext = fileName.split('.').pop().toLowerCase();
  const storagePath = `${cleanName}_${timestamp}.${ext}`;

  const { data, error } = await supabase.storage
    .from('cvs')
    .upload(storagePath, fileBuffer, {
      contentType: ext === 'pdf' ? 'application/pdf' :
        ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
        'application/octet-stream',
      upsert: false,
    });

  if (error) {
    console.error('[Storage] Upload error:', error.message);
    return null;
  }

  console.log('[Storage] CV uploaded:', storagePath);
  return storagePath;
}

// Download CV from Supabase Storage — returns { buffer, fileName, contentType }
async function downloadCV(storagePath) {
  if (!supabase || !storagePath) return null;

  const { data, error } = await supabase.storage
    .from('cvs')
    .download(storagePath);

  if (error) {
    console.error('[Storage] Download error:', error.message);
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const ext = storagePath.split('.').pop().toLowerCase();

  return {
    buffer,
    fileName: storagePath,
    contentType: ext === 'pdf' ? 'application/pdf' :
      ext === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
      'application/octet-stream',
  };
}

// Get public URL (if bucket is public)
function getPublicUrl(storagePath) {
  if (!supabase || !storagePath) return null;
  const { data } = supabase.storage.from('cvs').getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

module.exports = { uploadCV, downloadCV, getPublicUrl };
EOF
echo "✅ server/lib/storage.js"

# ========================
# BACKEND: Update candidates.js — save CV file to Supabase Storage
# ========================
cat > server/routes/candidates.js << 'EOF'
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadCV } = require('../lib/storage');

const router = express.Router();

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
    const {
      name, email, phone, location, experience_years, skills,
      current_role, current_company, education,
      current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
      notice_period, last_working_day, holding_offer, holding_offer_details,
      referral_name, referral_phone, referral_bonus_eligible,
      assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience,
      cv_text, cv_storage_path, job_id, ai_match_percent, ai_match_details
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Name required' });

    const result = await transaction(async (client) => {
      const cr = await client.query(
        `INSERT INTO candidates (name, email, phone, location, experience_years, skills,
          "current_role", current_company, education,
          current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
          notice_period, last_working_day, holding_offer, holding_offer_details,
          referral_name, referral_phone, referral_bonus_eligible,
          assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience,
          cv_text, cv_url, owner_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *`,
        [name, email, phone, location, experience_years || null, skills,
         current_role, current_company, education,
         current_ctc_fixed || null, current_ctc_variable || null,
         expected_ctc_fixed || null, expected_ctc_variable || null,
         notice_period, last_working_day || null,
         holding_offer || false, holding_offer_details,
         referral_name, referral_phone, referral_bonus_eligible || false,
         assessment_soft_skills || null, assessment_stability || null,
         assessment_technical || null, assessment_experience || null,
         cv_text, cv_storage_path || null, req.user.id]
      );
      const candidate = cr.rows[0];

      if (job_id) {
        await client.query(
          'INSERT INTO pipeline (candidate_id, job_id, status, ai_match_percent, ai_match_details, updated_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
          [candidate.id, job_id, 'New', ai_match_percent || null, ai_match_details ? JSON.stringify(ai_match_details) : null, req.user.id]
        );
        await client.query(
          'INSERT INTO candidate_status_history (candidate_id, job_id, new_status, changed_by) VALUES ($1,$2,$3,$4)',
          [candidate.id, job_id, 'New', req.user.id]
        );
      }

      await client.query(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, 'CREATE', 'candidate', candidate.id, JSON.stringify({ name, job_id })]
      );
      return candidate;
    });

    res.status(201).json({ candidate: result });
  } catch (err) { console.error('Create candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

// PUT /api/candidates/:id
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

module.exports = router;
EOF
echo "✅ server/routes/candidates.js (CV stored in Supabase Storage)"

# ========================
# BACKEND: Update sendcv.js — attach actual PDF/DOCX files
# ========================
cat > server/routes/sendcv.js << 'EOF'
const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { Resend } = require('resend');
const { downloadCV } = require('../lib/storage');

const router = express.Router();

router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { job_id, spoc_emails, cc_emails, candidate_ids, custom_message } = req.body;
    if (!job_id || !spoc_emails || spoc_emails.length === 0) {
      return res.status(400).json({ error: 'Job ID and at least one SPOC email required' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured' });

    const jobResult = await query('SELECT j.*, c.name as client_name FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [job_id]);
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobResult.rows[0];

    // Get candidates
    let candidateSql, candidateParams;
    if (candidate_ids && candidate_ids.length > 0) {
      candidateSql = `SELECT ca.*, p.status, p.ai_match_percent FROM candidates ca
        JOIN pipeline p ON p.candidate_id = ca.id AND p.job_id = $1
        WHERE ca.id = ANY($2) ORDER BY ca.name`;
      candidateParams = [job_id, candidate_ids];
    } else {
      candidateSql = `SELECT ca.*, p.status, p.ai_match_percent FROM candidates ca
        JOIN pipeline p ON p.candidate_id = ca.id AND p.job_id = $1
        WHERE p.status = 'Submitted to Client' ORDER BY ca.name`;
      candidateParams = [job_id];
    }
    const candidates = await query(candidateSql, candidateParams);
    if (candidates.rows.length === 0) return res.status(400).json({ error: 'No candidates found' });

    // Download CV files for attachment
    console.log(`[SendCV] Preparing ${candidates.rows.length} CVs for attachment...`);
    const attachments = [];
    for (const c of candidates.rows) {
      if (c.cv_url) {
        try {
          const cvFile = await downloadCV(c.cv_url);
          if (cvFile) {
            // Create a clean filename: Name_Role.ext
            const cleanName = c.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
            const ext = c.cv_url.split('.').pop() || 'pdf';
            const attachName = `${cleanName}_${job.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.${ext}`;

            attachments.push({
              filename: attachName,
              content: cvFile.buffer,
              content_type: cvFile.contentType,
            });
            console.log(`[SendCV]   ✓ ${c.name} — ${attachName}`);
          } else {
            console.log(`[SendCV]   ✗ ${c.name} — download failed`);
          }
        } catch (dlErr) {
          console.error(`[SendCV]   ✗ ${c.name} — error:`, dlErr.message);
        }
      } else {
        console.log(`[SendCV]   ✗ ${c.name} — no CV stored`);
      }
    }

    // Build tracker HTML table
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    const hs = 'padding: 10px; font-size: 11px; font-weight: 700; color: white; background: #d97706; text-transform: uppercase; white-space: nowrap; border: 1px solid #b45309;';

    let tableRows = '';
    candidates.rows.forEach(c => {
      const ctcParts = [];
      if (c.current_ctc_fixed) ctcParts.push(c.current_ctc_fixed + ' LPA Fixed');
      if (c.current_ctc_variable) ctcParts.push('+ ' + c.current_ctc_variable + ' LPA Var');
      const ctcStr = ctcParts.length > 0 ? ctcParts.join(' ') : '-';
      const ectc = c.expected_ctc_fixed ? c.expected_ctc_fixed + ' LPA' : '-';
      const remark = c.holding_offer ? (c.holding_offer_details || 'Holding Offer') : 'No Offer';
      const rs = 'padding: 8px 10px; font-size: 12px; color: #374151; border: 1px solid #e5e7eb;';

      tableRows += `<tr>
        <td style="${rs}">${today}</td>
        <td style="${rs}">${job.title}</td>
        <td style="${rs} font-weight: 600;">${c.name}</td>
        <td style="${rs}">${c.phone || '-'}</td>
        <td style="${rs}"><a href="mailto:${c.email}" style="color: #4c6ef5;">${c.email || '-'}</a></td>
        <td style="${rs}">${c.current_company || '-'}</td>
        <td style="${rs}">${c.experience_years ? c.experience_years + ' Years' : '-'}</td>
        <td style="${rs}">${ctcStr}</td>
        <td style="${rs}">${ectc}</td>
        <td style="${rs}">${c.notice_period || '-'}</td>
        <td style="${rs}">${c.location || '-'}</td>
        <td style="${rs}">${remark}</td>
      </tr>`;
    });

    const spocFirstName = spoc_emails[0].split('@')[0].split('.')[0];
    const greeting = spocFirstName.charAt(0).toUpperCase() + spocFirstName.slice(1);

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
        <p style="font-size: 14px; color: #374151;">Hi ${greeting},</p>
        <p style="font-size: 14px; color: #374151;">${custom_message || `Please find attached CVs for <strong>${job.title}</strong> position.`}</p>
        <p style="font-size: 14px; color: #374151; margin-bottom: 16px;">Below details are for your reference :-</p>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin-bottom: 24px;">
          <thead><tr>
            <th style="${hs}">Date</th><th style="${hs}">Role</th><th style="${hs}">Name</th>
            <th style="${hs}">Contact No</th><th style="${hs}">Mail ID</th><th style="${hs}">Current Org</th>
            <th style="${hs}">Total Exp</th><th style="${hs}">Last CTC</th><th style="${hs}">ECTC</th>
            <th style="${hs}">Notice Period</th><th style="${hs}">Location</th><th style="${hs}">Remark</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="font-size: 14px; color: #374151;">Please share your feedback.</p>
        <p style="font-size: 14px; color: #374151; margin-top: 16px;"><strong>Regards</strong><br/>${req.user.name}<br/>FX Consulting</p>
      </div>`;

    const resend = new Resend(RESEND_API_KEY);
    const emailPayload = {
      from: `${req.user.name} <${req.user.email || 'notifications@fxconsulting.in'}>`,
      to: spoc_emails,
      subject: `CVs for Review || ${job.title}`,
      html: emailHtml,
    };

    if (cc_emails && cc_emails.length > 0) emailPayload.cc = cc_emails;

    // Add CV attachments
    if (attachments.length > 0) {
      emailPayload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        content_type: a.content_type,
      }));
      console.log(`[SendCV] Attaching ${attachments.length} CV files to email`);
    }

    const result = await resend.emails.send(emailPayload);

    if (result.error) {
      console.error('[SendCV] Resend error:', result.error);
      return res.status(400).json({ error: result.error.message });
    }

    console.log(`[SendCV] Email sent to ${spoc_emails.join(', ')} with ${attachments.length} attachments`);

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'SEND_CV', 'requirement', job_id, JSON.stringify({
        to: spoc_emails, cc: cc_emails, candidates: candidates.rows.map(c => c.name),
        attachments: attachments.length, job_title: job.title
      })]
    );

    res.json({
      success: true,
      sent_to: spoc_emails,
      candidates_count: candidates.rows.length,
      attachments_count: attachments.length,
    });
  } catch (err) {
    console.error('Send CV error:', err);
    res.status(500).json({ error: err.message || 'Failed to send' });
  }
});

module.exports = router;
EOF
echo "✅ server/routes/sendcv.js (with PDF attachments)"

# ========================
# FRONTEND: Update candidates page to pass cv_storage_path
# ========================
node -e "
const fs = require('fs');
const fp = 'src/app/(dashboard)/candidates/page.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Add cv_storage_path to form state
if (!c.includes('cv_storage_path')) {
  c = c.replace(
    \"job_id: '', cv_text: '',\",
    \"job_id: '', cv_text: '', cv_storage_path: '',\"
  );

  // Save cv_storage_path from parse response
  c = c.replace(
    \"cv_text: data.raw_text || '',\",
    \"cv_text: data.raw_text || '', cv_storage_path: data.cv_storage_path || '',\"
  );

  // Pass cv_storage_path in save payload
  c = c.replace(
    'ai_match_details: matchResult || null,',
    'ai_match_details: matchResult || null, cv_storage_path: form.cv_storage_path || null,'
  );

  fs.writeFileSync(fp, c);
  console.log('Updated candidates/page.tsx with cv_storage_path');
} else {
  console.log('candidates/page.tsx already has cv_storage_path');
}
"
echo "✅ candidates/page.tsx updated"

echo ""
echo "=========================================="
echo "🎉 Hero Feature: CV Attachments Complete!"
echo "=========================================="
echo ""
echo "IMPORTANT — Add these env vars to server/.env (and Render):"
echo "  SUPABASE_URL=https://YOUR_PROJECT.supabase.co"
echo "  SUPABASE_SERVICE_KEY=eyJhbG... (from Supabase > Settings > API > service_role key)"
echo ""
echo "Then run:"
echo "  cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "How it works now:"
echo "  1. Upload CV → file stored in Supabase Storage 'cvs' bucket"
echo "  2. Candidate saved with cv_url pointing to stored file"
echo "  3. 'Send CVs' to client → downloads PDFs from storage"
echo "  4. Email sent with tracker table + actual CV PDFs attached"
echo "  5. Client receives: tracker (your exact format) + PDF attachments"
echo ""
echo "Make sure Supabase Storage bucket 'cvs' exists:"
echo "  Supabase > Storage > Create bucket 'cvs' (public or private)"
echo ""
echo "Deploy: npm run build && git add . && git commit -m 'Hero: CV attachments' && git push"
echo ""
