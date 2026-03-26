const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db');
const { uploadCV } = require('../lib/storage');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + Math.round(Math.random() * 1E6) + path.extname(file.originalname));
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

// GET /api/public/jobs/:id — public JD with meta info
router.get('/jobs/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT j.title, j.location, j.type, j.exp_min, j.exp_max, j.description, j.skills,
        j.positions_count, j.status,
        c.name as client_name, c.industry as client_industry, c.location as client_location
       FROM jobs j JOIN clients c ON c.id = j.client_id
       WHERE j.id = $1 AND j.status = 'Open'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found or closed' });
    }

    const job = result.rows[0];
    res.json({
      title: job.title,
      company: job.client_name,
      industry: job.client_industry,
      location: job.location || job.client_location,
      type: job.type,
      experience: `${job.exp_min}-${job.exp_max} years`,
      exp_min: job.exp_min,
      exp_max: job.exp_max,
      skills: job.skills,
      description: job.description,
      positions: job.positions_count,
      posted_by: 'FX Consulting',
    });
  } catch (err) {
    console.error('Public JD error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/public/jobs/:id/apply — candidate applies without login
router.post('/jobs/:id/apply', upload.single('cv'), async (req, res) => {
  try {
    const { name, email, phone, location, experience_years, current_company, current_role } = req.body;

    if (!name || !email || !req.file) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Name, email, and CV are required' });
    }

    // Verify job exists and is open
    const jobResult = await query('SELECT id, title, status FROM jobs WHERE id = $1', [req.params.id]);
    if (jobResult.rows.length === 0 || jobResult.rows[0].status !== 'Open') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Position is not open' });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(req.file.originalname).toLowerCase();

    // Extract text from CV
    let extractedText = '';
    try {
      if (ext === '.pdf') {
        const pdfModule = require('pdf-parse');
        const pdfFn = typeof pdfModule === 'function' ? pdfModule : pdfModule.default;
        const pdfData = await pdfFn(fileBuffer);
        extractedText = pdfData.text;
      } else if (ext === '.docx' || ext === '.doc') {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      }
    } catch (e) {
      console.error('CV text extraction error:', e.message);
    }

    // Upload to Supabase Storage
    let cvStoragePath = null;
    try {
      cvStoragePath = await uploadCV(fileBuffer, req.file.originalname, name);
    } catch (e) {
      console.error('CV storage error:', e.message);
    }

    // Clean CV text
    let safeCvText = null;
    if (extractedText) {
      safeCvText = '';
      for (let i = 0; i < extractedText.length; i++) {
        const code = extractedText.charCodeAt(i);
        if (code > 31 || code === 10 || code === 13 || code === 9) safeCvText += extractedText[i];
      }
    }

    // Clean phone
    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : null;

    const result = await transaction(async (client) => {
      // Check if candidate already exists by email
      const existing = await client.query('SELECT id FROM candidates WHERE LOWER(email) = LOWER($1)', [email.trim()]);

      let candidateId;
      if (existing.rows.length > 0) {
        candidateId = existing.rows[0].id;
        // Update CV if new one uploaded
        if (cvStoragePath) {
          await client.query(
            'UPDATE candidates SET cv_url = $1, cv_text = COALESCE($2, cv_text), updated_at = NOW() WHERE id = $3',
            [cvStoragePath, safeCvText, candidateId]
          );
        }
      } else {
        const cr = await client.query(
          `INSERT INTO candidates (name, email, phone, location, experience_years, "current_role", current_company, cv_text, cv_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
          [name.trim(), email.trim(), cleanPhone, location || null, parseFloat(experience_years) || null,
           current_role || null, current_company || null, safeCvText, cvStoragePath]
        );
        candidateId = cr.rows[0].id;
      }

      // Add to pipeline for this job
      await client.query(
        'INSERT INTO pipeline (candidate_id, job_id, status) VALUES ($1, $2, $3) ON CONFLICT (candidate_id, job_id) DO NOTHING',
        [candidateId, req.params.id, 'New']
      );

      await client.query(
        'INSERT INTO candidate_status_history (candidate_id, job_id, new_status) VALUES ($1, $2, $3)',
        [candidateId, req.params.id, 'New']
      );

      await client.query(
        'INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)',
        ['PUBLIC_APPLY', 'candidate', candidateId, JSON.stringify({ name, email, job_id: req.params.id, job_title: jobResult.rows[0].title })]
      );

      return candidateId;
    });

    // Clean up local file
    fs.unlinkSync(filePath);

    console.log('[Apply] Candidate applied:', name, email, 'for job:', jobResult.rows[0].title);

    res.json({ success: true, message: 'Application submitted successfully' });
  } catch (err) {
    console.error('Public apply error:', err);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

module.exports = router;
