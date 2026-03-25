#!/bin/bash
# FX CRM Phase 4 — Candidates Module with AI CV Parsing
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-phase4.sh

set -e
echo "🚀 FX CRM Phase 4 — Candidates + AI CV Parsing"
echo ""

# ========================
# BACKEND: Install new dependencies
# ========================
cd server
echo "📦 Installing pdf-parse and mammoth for CV extraction..."
npm install pdf-parse mammoth @anthropic-ai/sdk 2>/dev/null || npm install pdf-parse mammoth 2>/dev/null
cd ..
echo "✅ Dependencies installed"

# ========================
# BACKEND: server/routes/candidates.js
# ========================
cat > server/routes/candidates.js << 'ENDOFFILE'
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
      const pdfParse = require('pdf-parse');
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
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
ENDOFFILE
echo "✅ server/routes/candidates.js"

# ========================
# Install multer for file uploads
# ========================
cd server && npm install multer 2>/dev/null && cd ..
echo "✅ multer installed"

# ========================
# BACKEND: Update server/index.js
# ========================
cat > server/index.js << 'ENDOFFILE'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const teamRoutes = require('./routes/team');
const requirementRoutes = require('./routes/requirements');
const candidateRoutes = require('./routes/candidates');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const allowedOrigins = [
  'http://localhost:3000',
  'https://crm.fxconsulting.in',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many login attempts, try again later' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', authenticate, clientRoutes);
app.use('/api/team', authenticate, teamRoutes);
app.use('/api/requirements', authenticate, requirementRoutes);
app.use('/api/candidates', authenticate, candidateRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => { console.log(`FX CRM API running on port ${PORT}`); });
ENDOFFILE
echo "✅ server/index.js (added candidates route)"

# ========================
# FRONTEND: Candidates page with CV Upload + AI Parse + Form
# ========================
cat > "src/app/(dashboard)/candidates/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  Users, Plus, Search, Upload, FileText, X, AlertCircle, Sparkles,
  MapPin, Phone, Mail, Briefcase, ChevronDown, Eye, Check,
  Loader2, ChevronRight, Star,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Candidate {
  id: string; name: string; email: string; phone: string; location: string;
  experience_years: number; skills: string; current_role: string; current_company: string;
  education: string; owner_name: string; pipeline_count: number; pipeline_statuses: string;
  mapped_positions: string; created_at: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
}

interface Requirement {
  id: string; title: string; client_name: string; location: string; ctc_min: number; ctc_max: number;
}

const emptyForm = {
  name: '', email: '', phone: '', location: '', experience_years: '',
  skills: '', current_role: '', current_company: '', education: '',
  current_ctc_fixed: '', current_ctc_variable: '', expected_ctc_fixed: '', expected_ctc_variable: '',
  notice_period: '', last_working_day: '', holding_offer: false, holding_offer_details: '',
  referral_name: '', referral_phone: '', referral_bonus_eligible: false,
  assessment_soft_skills: '', assessment_stability: '', assessment_technical: '', assessment_experience: '',
  job_id: '', cv_text: '',
};

export default function CandidatesPage() {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // CV parsing state
  const [cvStep, setCvStep] = useState<'upload' | 'parsing' | 'form'>('upload');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvParsing, setCvParsing] = useState(false);
  const [cvRawText, setCvRawText] = useState('');

  // JD matching state
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ownerFilter === 'mine') params.set('owner', 'mine');
      const res = await fetch(`${API}/api/candidates?${params}`, { headers: headers() });
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, ownerFilter]);

  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/requirements?status=Open`, { headers: headers() });
      const data = await res.json();
      setRequirements(data.requirements || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

  const openAddModal = () => {
    setForm(emptyForm);
    setCvStep('upload');
    setCvFile(null);
    setCvRawText('');
    setMatchResult(null);
    setError('');
    setShowModal(true);
  };

  // Handle CV file drop/select
  const handleCvFile = async (file: File) => {
    setCvFile(file);
    setCvStep('parsing');
    setCvParsing(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('cv', file);

      const res = await fetch(`${API}/api/candidates/parse-cv`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');

      const p = data.parsed || {};
      setCvRawText(data.raw_text || '');
      setForm(f => ({
        ...f,
        name: p.name || f.name,
        email: p.email || f.email,
        phone: (p.phone || '').replace(/\D/g, '').slice(-10) || f.phone,
        location: p.location || f.location,
        experience_years: p.experience_years ? String(p.experience_years) : f.experience_years,
        skills: p.skills || f.skills,
        current_role: p.current_role || f.current_role,
        current_company: p.current_company || f.current_company,
        education: p.education || f.education,
        cv_text: data.raw_text || '',
      }));
      setCvStep('form');
    } catch (err: any) {
      setError(err.message);
      setCvStep('upload');
    } finally {
      setCvParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleCvFile(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleCvFile(file);
  };

  // JD Matching
  const handleMatch = async () => {
    if (!form.job_id || !form.cv_text) return;
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await fetch(`${API}/api/candidates/match`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ cv_text: form.cv_text, job_id: form.job_id }),
      });
      const data = await res.json();
      setMatchResult(data);
    } catch (err) { console.error(err); }
    finally { setMatching(false); }
  };

  // Save candidate
  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        experience_years: parseFloat(form.experience_years) || null,
        current_ctc_fixed: parseFloat(form.current_ctc_fixed) || null,
        current_ctc_variable: parseFloat(form.current_ctc_variable) || null,
        expected_ctc_fixed: parseFloat(form.expected_ctc_fixed) || null,
        expected_ctc_variable: parseFloat(form.expected_ctc_variable) || null,
        assessment_soft_skills: parseInt(form.assessment_soft_skills) || null,
        assessment_stability: parseInt(form.assessment_stability) || null,
        assessment_technical: parseInt(form.assessment_technical) || null,
        assessment_experience: parseInt(form.assessment_experience) || null,
        ai_match_percent: matchResult?.match_percent || null,
        ai_match_details: matchResult || null,
      };
      const res = await fetch(`${API}/api/candidates`, {
        method: 'POST', headers: headers(), body: JSON.stringify(payload),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowModal(false);
      fetchCandidates();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const avgScore = (c: Candidate) => {
    const s = [c.assessment_soft_skills, c.assessment_stability, c.assessment_technical, c.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</p>
        <button onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Candidate
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, skills..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        <button onClick={() => setOwnerFilter(ownerFilter === 'mine' ? 'all' : 'mine')}
          className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            ownerFilter === 'mine' ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200')}>
          {ownerFilter === 'mine' ? 'My Candidates' : 'All Candidates'}
        </button>
      </div>

      {/* Candidate list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No candidates yet</p>
          <p className="text-gray-400 text-xs mt-1">Upload a CV to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow overflow-hidden">
              <div className="p-4 flex items-center gap-4 cursor-pointer" onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}>
                <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {c.name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{c.name}</h3>
                    {c.pipeline_count > 0 && (
                      <span className="badge badge-open">{c.pipeline_count} position{c.pipeline_count > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                    {c.current_role && <span>{c.current_role}{c.current_company ? ` @ ${c.current_company}` : ''}</span>}
                    {c.experience_years && <span>{c.experience_years}y exp</span>}
                    {c.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{c.location}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {avgScore(c) && (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">{avgScore(c)}</p>
                      <p className="text-[9px] text-gray-400">SCORE</p>
                    </div>
                  )}
                  <div className="text-right text-xs text-gray-400">
                    <p>{c.owner_name}</p>
                    <p>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <ChevronDown className={clsx('w-4 h-4 text-gray-300 transition-transform', expandedId === c.id && 'rotate-180')} />
                </div>
              </div>
              {expandedId === c.id && (
                <div className="border-t border-gray-50 px-4 py-3 bg-gray-50/50">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                    <div><span className="text-gray-400">Email:</span> <span className="text-gray-700">{c.email || '—'}</span></div>
                    <div><span className="text-gray-400">Phone:</span> <span className="text-gray-700">{c.phone || '—'}</span></div>
                    <div><span className="text-gray-400">Skills:</span> <span className="text-gray-700">{c.skills?.substring(0, 60) || '—'}</span></div>
                    <div><span className="text-gray-400">Education:</span> <span className="text-gray-700">{c.education?.substring(0, 40) || '—'}</span></div>
                    <div><span className="text-gray-400">Mapped:</span> <span className="text-gray-700">{c.mapped_positions || '—'}</span></div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== ADD CANDIDATE MODAL ===== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl my-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {cvStep === 'upload' ? 'Step 1: Upload CV' : cvStep === 'parsing' ? 'Parsing with AI...' : 'Step 2: Review & Save'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5">
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

              {/* STEP 1: CV Upload */}
              {cvStep === 'upload' && (
                <div>
                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 hover:border-fx-400 rounded-xl p-12 text-center cursor-pointer transition-colors group"
                  >
                    <Upload className="w-10 h-10 text-gray-300 group-hover:text-fx-500 mx-auto mb-3 transition-colors" />
                    <p className="text-sm font-medium text-gray-700">Drag & drop CV here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse · PDF, DOC, DOCX · Max 10MB</p>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
                  </div>
                  <div className="text-center mt-4">
                    <button onClick={() => setCvStep('form')} className="text-xs text-gray-400 hover:text-gray-600 underline">
                      Skip CV upload — fill form manually
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 1.5: Parsing */}
              {cvStep === 'parsing' && (
                <div className="py-16 text-center">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 border-2 border-fx-200 rounded-full animate-ping" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-fx-600 animate-pulse" />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-gray-700">AI is parsing the CV...</p>
                  <p className="text-xs text-gray-400 mt-1">Extracting name, skills, experience, contact info</p>
                  {cvFile && <p className="text-xs text-fx-600 mt-3">{cvFile.name}</p>}
                </div>
              )}

              {/* STEP 2: Form */}
              {cvStep === 'form' && (
                <div className="space-y-5">
                  {cvFile && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                      <Check className="w-4 h-4" />
                      <span className="font-medium">CV parsed:</span> {cvFile.name}
                      <span className="text-emerald-500 text-xs ml-auto">AI auto-filled fields below</span>
                    </div>
                  )}

                  {/* Basic Info */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Basic Information</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                        <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Phone (10 digits)</label>
                        <input type="tel" value={form.phone}
                          onChange={(e) => setForm({...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} placeholder="9876543210" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                        <input type="text" value={form.location} onChange={(e) => setForm({...form, location: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Experience (years)</label>
                        <input type="number" step="0.5" value={form.experience_years}
                          onChange={(e) => setForm({...form, experience_years: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Education</label>
                        <input type="text" value={form.education} onChange={(e) => setForm({...form, education: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Current Role</label>
                        <input type="text" value={form.current_role} onChange={(e) => setForm({...form, current_role: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Current Company</label>
                        <input type="text" value={form.current_company} onChange={(e) => setForm({...form, current_company: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Skills</label>
                      <input type="text" value={form.skills} onChange={(e) => setForm({...form, skills: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Java, Spring Boot, AWS..." />
                    </div>
                  </div>

                  {/* Requirement Mapping + AI Match */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Map to Requirement</p>
                    <div className="flex gap-3">
                      <select value={form.job_id} onChange={(e) => { setForm({...form, job_id: e.target.value}); setMatchResult(null); }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="">Select open position (optional)</option>
                        {requirements.map(r => (
                          <option key={r.id} value={r.id}>{r.title} — {r.client_name} ({r.location})</option>
                        ))}
                      </select>
                      {form.job_id && form.cv_text && (
                        <button onClick={handleMatch} disabled={matching}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors">
                          {matching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          AI Match
                        </button>
                      )}
                    </div>
                    {matchResult && (
                      <div className="mt-3 p-3 bg-violet-50 rounded-lg border border-violet-100">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-2xl font-bold text-violet-700">{matchResult.match_percent}%</div>
                          <div className="flex-1">
                            <div className="h-2 bg-violet-200 rounded-full overflow-hidden">
                              <div className={clsx('h-full rounded-full', matchResult.match_percent >= 70 ? 'bg-emerald-500' : matchResult.match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                                style={{width: `${matchResult.match_percent}%`}} />
                            </div>
                          </div>
                        </div>
                        {matchResult.summary && <p className="text-xs text-violet-700 mb-2">{matchResult.summary}</p>}
                        <div className="flex gap-4 text-xs">
                          {matchResult.matching_skills?.length > 0 && (
                            <div>
                              <p className="text-emerald-600 font-medium mb-1">Matching:</p>
                              <div className="flex flex-wrap gap-1">
                                {matchResult.matching_skills.map((s: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px]">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                          {matchResult.missing_skills?.length > 0 && (
                            <div>
                              <p className="text-red-500 font-medium mb-1">Missing:</p>
                              <div className="flex flex-wrap gap-1">
                                {matchResult.missing_skills.map((s: string, i: number) => (
                                  <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px]">{s}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* CTC */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Compensation (LPA)</p>
                    <div className="grid grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Current Fixed</label>
                        <input type="number" value={form.current_ctc_fixed} onChange={(e) => setForm({...form, current_ctc_fixed: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Current Variable</label>
                        <input type="number" value={form.current_ctc_variable} onChange={(e) => setForm({...form, current_ctc_variable: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Expected Fixed</label>
                        <input type="number" value={form.expected_ctc_fixed} onChange={(e) => setForm({...form, expected_ctc_fixed: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-400 mb-1">Expected Variable</label>
                        <input type="number" value={form.expected_ctc_variable} onChange={(e) => setForm({...form, expected_ctc_variable: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Notice + Holding */}
                  <div className="border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Notice Period</label>
                        <input type="text" value={form.notice_period} onChange={(e) => setForm({...form, notice_period: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="30 days" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Last Working Day</label>
                        <input type="date" value={form.last_working_day} onChange={(e) => setForm({...form, last_working_day: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Holding Offer?</label>
                        <div className="flex items-center gap-3 mt-1.5">
                          <label className="flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={form.holding_offer as boolean}
                              onChange={(e) => setForm({...form, holding_offer: e.target.checked})} className="rounded" />
                            <span className="text-sm text-gray-600">Yes</span>
                          </label>
                        </div>
                      </div>
                    </div>
                    {form.holding_offer && (
                      <div className="mt-2">
                        <input type="text" value={form.holding_offer_details}
                          onChange={(e) => setForm({...form, holding_offer_details: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Offer details..." />
                      </div>
                    )}
                  </div>

                  {/* Referral */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Referral</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Referral Name</label>
                        <input type="text" value={form.referral_name} onChange={(e) => setForm({...form, referral_name: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Referral Phone</label>
                        <input type="tel" value={form.referral_phone}
                          onChange={(e) => setForm({...form, referral_phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Bonus Eligible?</label>
                        <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer">
                          <input type="checkbox" checked={form.referral_bonus_eligible as boolean}
                            onChange={(e) => setForm({...form, referral_bonus_eligible: e.target.checked})} className="rounded" />
                          <span className="text-sm text-gray-600">Yes</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Assessment */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assessment (1-10)</p>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'assessment_soft_skills', label: 'Soft Skills' },
                        { key: 'assessment_stability', label: 'Stability' },
                        { key: 'assessment_technical', label: 'Technical' },
                        { key: 'assessment_experience', label: 'Experience' },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-[10px] text-gray-400 mb-1">{label}</label>
                          <input type="number" min="1" max="10"
                            value={(form as any)[key]}
                            onChange={(e) => setForm({...form, [key]: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {cvStep === 'form' && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save Candidate
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/candidates/page.tsx"

echo ""
echo "=========================================="
echo "🎉 Phase 4 setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Restart backend: cd server && Ctrl+C && node index.js"
echo "  2. Frontend auto-reloads"
echo "  3. Test: Candidates → Add Candidate → drag-drop a CV"
echo "  4. Watch AI parse the CV and auto-fill fields"
echo "  5. Select a requirement → click AI Match → see match %"
echo "  6. Deploy: git add . && git commit -m 'Phase 4: Candidates + AI' && git push"
echo ""
