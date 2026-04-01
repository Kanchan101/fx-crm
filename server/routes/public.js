const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { query, transaction } = require('../db');
const { uploadCV } = require('../lib/storage');

const router = express.Router();


function cleanJDMetadata(description, title) {
  if (!description) return '';
  let lines = description.split('\n');
  let cleaned = [];
  let skipMode = true;
  
  // Known metadata patterns to strip from top of JD
  const metaPatterns = [
    /^(associate|senior|staff|lead|principal|junior|manager|director|head|vp|chief)/i,
    /^(commerce|engineering|product|design|data|sales|marketing|operations|finance)/i,
    /^(location|function|experience|reports to|department|team|division)/i,
    /^(bengaluru|bangalore|mumbai|delhi|noida|hyderabad|chennai|pune|gurugram|kolkata|pan india)/i,
    /^(india|remote|onsite|hybrid|full.?time|part.?time|contract)/i,
    /^\d+[–-]\d+\s*(years|yrs)/i,
    /^head of/i,
    /^(sr\.?|senior|junior|staff)\s/i,
  ];
  
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      if (!skipMode) cleaned.push('');
      continue;
    }
    
    if (skipMode) {
      // Check if this line matches metadata patterns
      const isMeta = metaPatterns.some(p => p.test(trimmed));
      const isShortMeta = trimmed.length < 60 && !trimmed.startsWith('•') && !trimmed.startsWith('-');
      
      // If line matches the job title itself, skip it
      if (title && trimmed.toLowerCase().includes(title.toLowerCase().substring(0, 20))) {
        continue;
      }
      
      if (isMeta && isShortMeta) continue;
      
      // Once we hit a real content line (About, The Role, etc.), stop skipping
      if (trimmed.match(/^(About|The Role|Overview|Summary|What|Key |This role|We are|Join|Position)/i) || trimmed.length > 80) {
        skipMode = false;
        cleaned.push(trimmed);
      } else if (isShortMeta) {
        continue;
      } else {
        skipMode = false;
        cleaned.push(trimmed);
      }
    } else {
      cleaned.push(trimmed);
    }
  }
  
  return cleaned.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function getPublicLabel(industry) {
  const ind = (industry || '').toLowerCase();
  if (ind.includes('hvac') || ind.includes('engineering')) return 'A world-leading manufacturing company in the HVAC space';
  if (ind.includes('internet')) return "One of India's leading internet companies";
  if (ind.includes('technology')) return 'A leading technology product company';
  if (ind.includes('it services')) return 'A prominent IT services company';
  if (ind.includes('telecom')) return 'A leading telecom company';
  if (ind.includes('healthcare')) return 'A leading healthcare company';
  if (industry) return 'A leading ' + industry + ' company';
  return 'A leading company';
}

function sanitizeJD(description, clientName, clientIndustry) {
  if (!description) return '';
  let clean = description;
  const label = getPublicLabel(clientIndustry);

  // All known client names and variations
  const nameMap = {
    'bb': ['bigbasket', 'big basket', 'BigBasket', 'Big Basket', 'BB', 'bb'],
    'tt': ['Trane Technologies', 'Trane', 'trane', 'TT', 'tt'],
    'statusneo': ['StatusNeo', 'statusneo', 'Status Neo'],
    'shaadi.com': ['Shaadi.com', 'shaadi', 'Shaadi'],
  };

  const lower = (clientName || '').toLowerCase();
  let allNames = [clientName];
  for (const [key, vals] of Object.entries(nameMap)) {
    if (lower === key || lower.includes(key)) {
      allNames = allNames.concat(vals);
    }
  }

  // Replace all name variations
  for (const name of allNames) {
    if (!name || name.length < 2) continue;
    const escaped = name.replace(/[.*+?${}()|[\]\\]/g, '\\$&');
    clean = clean.replace(new RegExp(escaped, 'gi'), label);
  }

  // Also catch [Company] placeholder
  clean = clean.replace(/\[Company\]/g, label);

  // Remove entire "About" section — everything between "About..." and "The Role" or "What You"
  clean = clean.replace(
    /About\s+(?:the\s+)?(?:Company|[\w\s.']+)\s*[\n\r]+[\s\S]*?(?=(?:The Role|What You Will|Key Responsibilities|Requirements|Qualifications|Position Overview|Role Overview|Job Summary))/i,
    'About the Company\n' + label + '.\n\n'
  );

  // If no "The Role" marker found, try removing just the about paragraph
  // Remove sentences that reveal identity
  const revealPhrases = [
    /India.s largest online grocery[^.]*\./gi,
    /part of the Tata[^.]*\./gi,
    /part of the [\w\s]+ Group[^.]*\./gi,
    /serve millions of households[^.]*\./gi,
    /delivering everyday essentials[^.]*\./gi,
    /across \d+\+? cities[^.]*\./gi,
    /Quick commerce at this scale[^.]*\./gi,
    /in under \d+ minutes[^.]*\./gi,
    /battle-tested across \d+\+? deployments[^.]*\./gi,
    /trusted by enterprises like[^.]*\./gi,
    /Why join[\s\S]*$/i,
  ];

  for (const pattern of revealPhrases) {
    clean = clean.replace(pattern, '');
  }

  // Clean up multiple blank lines
  clean = clean.replace(/\n{3,}/g, '\n\n').trim();

  return clean;
}

// File upload setup for apply
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

// GET /api/public/jobs/:id
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
    const publicLabel = getPublicLabel(job.client_industry);
    const cleanDescription = cleanJDMetadata(sanitizeJD(job.description, job.client_name, job.client_industry), job.title);

    res.json({
      title: job.title,
      full_title: job.title,
      company: publicLabel,
      industry: job.client_industry,
      location: job.location || job.client_location,
      type: job.type,
      experience: `${job.exp_min}-${job.exp_max} years`,
      exp_min: job.exp_min,
      exp_max: job.exp_max,
      skills: job.skills,
      description: cleanDescription,
      positions: job.positions_count,
      posted_by: 'FX Consulting',
    });
  } catch (err) {
    console.error('Public JD error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/public/jobs/:id/apply
router.post('/jobs/:id/apply', upload.single('cv'), async (req, res) => {
  try {
    const { name, email, phone, location, experience_years, current_company, current_role } = req.body;

    if (!name || !email || !req.file) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Name, email, and CV are required' });
    }

    const jobResult = await query('SELECT id, title, status FROM jobs WHERE id = $1', [req.params.id]);
    if (jobResult.rows.length === 0 || jobResult.rows[0].status !== 'Open') {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Position is not open' });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const ext = path.extname(req.file.originalname).toLowerCase();

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

    let cvStoragePath = null;
    try {
      cvStoragePath = await uploadCV(fileBuffer, req.file.originalname, name);
    } catch (e) {
      console.error('CV storage error:', e.message);
    }

    let safeCvText = null;
    if (extractedText) {
      safeCvText = '';
      for (let i = 0; i < extractedText.length; i++) {
        const code = extractedText.charCodeAt(i);
        if (code > 31 || code === 10 || code === 13 || code === 9) safeCvText += extractedText[i];
      }
    }

    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(-10) : null;

    const result = await transaction(async (client) => {
      const existing = await client.query('SELECT id FROM candidates WHERE LOWER(email) = LOWER($1)', [email.trim()]);

      let candidateId;
      if (existing.rows.length > 0) {
        candidateId = existing.rows[0].id;
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

      await client.query(
        'INSERT INTO pipeline (candidate_id, job_id, status) VALUES ($1, $2, $3) ON CONFLICT (candidate_id, job_id) DO NOTHING',
        [candidateId, req.params.id, 'AM Review Pending']
      );

      await client.query(
        'INSERT INTO candidate_status_history (candidate_id, job_id, new_status) VALUES ($1, $2, $3)',
        [candidateId, req.params.id, 'AM Review Pending']
      );

      await client.query(
        'INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4)',
        ['PUBLIC_APPLY', 'candidate', candidateId, JSON.stringify({ name, email, job_id: req.params.id, job_title: jobResult.rows[0].title })]
      );

      return candidateId;
    });

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
