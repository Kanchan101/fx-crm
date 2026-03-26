#!/bin/bash
# FX CRM — LinkedIn Meta Tags + Public Apply Form
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-apply.sh

set -e
echo "🚀 FX CRM — LinkedIn Preview + Public Apply"
echo ""

# ========================
# BACKEND: Public apply endpoint (no auth)
# ========================
cat > server/routes/public.js << 'EOF'
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
EOF
echo "✅ server/routes/public.js (with apply endpoint)"

# ========================
# FRONTEND: Public JD page with dynamic meta + apply form
# ========================

# First create a server component for meta tags
cat > "src/app/jobs/[id]/layout.tsx" << 'ENDOFFILE'
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    const res = await fetch(`${apiUrl}/api/public/jobs/${params.id}`, { cache: 'no-store' });
    if (!res.ok) throw new Error('Not found');
    const job = await res.json();

    const title = `${job.title} at ${job.company} — ${job.location}`;
    const description = `${job.title} | ${job.company} | ${job.location} | ${job.experience} experience | Skills: ${job.skills || 'Various'} | Apply now via FX Consulting`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        siteName: 'FX Consulting — Recruitment',
        url: `https://crm.fxconsulting.in/jobs/${params.id}`,
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    };
  } catch {
    return {
      title: 'Job Opportunity — FX Consulting',
      description: 'Apply for exciting career opportunities via FX Consulting',
    };
  }
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
ENDOFFILE
echo "✅ src/app/jobs/[id]/layout.tsx (dynamic meta tags)"

# Now the page with apply form
cat > "src/app/jobs/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Briefcase, Clock, Building2, Upload, Check, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function PublicJDPage() {
  const params = useParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Apply form
  const [showApply, setShowApply] = useState(false);
  const [applyForm, setApplyForm] = useState({ name: '', email: '', phone: '', location: '', experience_years: '', current_company: '', current_role: '' });
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [applyError, setApplyError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/public/jobs/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error);
        else setJob(data);
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [params.id]);

  const handleApply = async () => {
    if (!applyForm.name.trim() || !applyForm.email.trim() || !cvFile) {
      setApplyError('Name, email, and CV are required');
      return;
    }
    setSubmitting(true);
    setApplyError('');
    try {
      const formData = new FormData();
      formData.append('cv', cvFile);
      formData.append('name', applyForm.name.trim());
      formData.append('email', applyForm.email.trim());
      if (applyForm.phone) formData.append('phone', applyForm.phone.replace(/\D/g, '').slice(-10));
      if (applyForm.location) formData.append('location', applyForm.location);
      if (applyForm.experience_years) formData.append('experience_years', applyForm.experience_years);
      if (applyForm.current_company) formData.append('current_company', applyForm.current_company);
      if (applyForm.current_role) formData.append('current_role', applyForm.current_role);

      const res = await fetch(`${API}/api/public/jobs/${params.id}/apply`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setApplyError(data.error || 'Failed to submit');
      }
    } catch (err) {
      setApplyError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="w-8 h-8 text-gray-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Position Not Available</h1>
          <p className="text-gray-500">{error || 'This position has been closed or removed.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#1e3a5f] via-[#2d5a8e] to-[#1e3a5f] text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="max-w-3xl mx-auto px-6 py-12 relative z-10">
          <div className="flex items-center gap-2 text-blue-200 text-sm mb-3">
            <Building2 className="w-4 h-4" />
            <span>{job.company}</span>
            {job.industry && <><span className="opacity-50">·</span><span>{job.industry}</span></>}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-5 leading-tight">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-blue-100">
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg"><MapPin className="w-4 h-4" />{job.location}</span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg"><Briefcase className="w-4 h-4" />{job.type}</span>
            <span className="flex items-center gap-1.5 bg-white/10 px-3 py-1.5 rounded-lg"><Clock className="w-4 h-4" />{job.experience}</span>
            {job.positions > 1 && <span className="bg-white/10 px-3 py-1.5 rounded-lg">{job.positions} positions</span>}
          </div>

          {/* Apply CTA in hero */}
          {!submitted && (
            <button onClick={() => { setShowApply(true); setTimeout(() => document.getElementById('apply-section')?.scrollIntoView({ behavior: 'smooth' }), 100); }}
              className="mt-8 inline-flex items-center gap-2 px-8 py-3 bg-white text-[#1e3a5f] rounded-xl text-sm font-bold hover:bg-blue-50 transition-colors shadow-lg shadow-black/20">
              <Upload className="w-5 h-5" /> Apply Now — Upload Your CV
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        {/* Skills */}
        {job.skills && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Required Skills</h2>
            <div className="flex flex-wrap gap-2">
              {job.skills.split(',').map((s: string, i: number) => (
                <span key={i} className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">{s.trim()}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {job.description && (
          <div>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Job Description</h2>
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{job.description}</p>
            </div>
          </div>
        )}

        {/* Apply Section */}
        <div id="apply-section">
          {submitted ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-emerald-900 mb-2">Application Submitted</h2>
              <p className="text-sm text-emerald-700">Thank you for your interest in the <strong>{job.title}</strong> position at <strong>{job.company}</strong>. Our recruitment team will review your CV and get back to you shortly.</p>
              <p className="text-xs text-emerald-600 mt-4">— FX Consulting</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <button onClick={() => setShowApply(!showApply)}
                className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors text-left">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Apply for this position</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Upload your CV and our team will review it</p>
                </div>
                <ChevronDown className={clsx('w-5 h-5 text-gray-400 transition-transform', showApply && 'rotate-180')} />
              </button>

              {showApply && (
                <div className="px-6 pb-6 space-y-4 border-t border-gray-100 pt-4">
                  {applyError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />{applyError}
                    </div>
                  )}

                  {/* CV Upload */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Upload CV *</label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) setCvFile(f); }}
                      className={clsx(
                        'border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                        cvFile ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 hover:border-blue-400'
                      )}
                    >
                      {cvFile ? (
                        <div className="flex items-center justify-center gap-2 text-emerald-700">
                          <Check className="w-5 h-5" />
                          <span className="text-sm font-medium">{cvFile.name}</span>
                          <button onClick={e => { e.stopPropagation(); setCvFile(null); }} className="text-xs text-emerald-500 underline ml-2">Change</button>
                        </div>
                      ) : (
                        <>
                          <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-600">Drag & drop or click to upload</p>
                          <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX — Max 10MB</p>
                        </>
                      )}
                      <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) setCvFile(f); }} className="hidden" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                      <input type="text" value={applyForm.name} onChange={e => setApplyForm({...applyForm, name: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="Your full name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                      <input type="email" value={applyForm.email} onChange={e => setApplyForm({...applyForm, email: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="you@email.com" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                      <input type="tel" value={applyForm.phone} onChange={e => setApplyForm({...applyForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="10 digit number" maxLength={10} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                      <input type="text" value={applyForm.location} onChange={e => setApplyForm({...applyForm, location: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="City" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Experience (years)</label>
                      <input type="number" value={applyForm.experience_years} onChange={e => setApplyForm({...applyForm, experience_years: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="e.g. 5" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Current Company</label>
                      <input type="text" value={applyForm.current_company} onChange={e => setApplyForm({...applyForm, current_company: e.target.value})}
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="Company name" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Current Role</label>
                    <input type="text" value={applyForm.current_role} onChange={e => setApplyForm({...applyForm, current_role: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm" placeholder="Your current designation" />
                  </div>

                  <button onClick={handleApply} disabled={submitting}
                    className="w-full py-3 bg-[#1e3a5f] hover:bg-[#2d5a8e] disabled:bg-gray-300 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {submitting ? 'Submitting...' : 'Submit Application'}
                  </button>

                  <p className="text-xs text-gray-400 text-center">By submitting, you agree to share your CV with FX Consulting for recruitment purposes.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
          <p>Powered by <strong>FX Consulting</strong> — Recruitment Consulting</p>
          <p className="mt-1">fxconsulting.in</p>
        </div>
      </div>
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/jobs/[id]/page.tsx (with apply form)"

# ========================
# Also fix the build error from requirements page
# ========================
cat > fix-build.js << 'EOF'
const fs = require('fs');
const fp = 'src/app/(dashboard)/requirements/page.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Remove all shareJob references
c = c.replace(/import ShareJD[^\n]*\n/g, '');

// Remove shareJob state line
const lines = c.split('\n');
const filtered = lines.filter(function(l) {
  if (l.includes('shareJob') && l.includes('useState')) return false;
  return true;
});
c = filtered.join('\n');

// Remove ShareJD component block
c = c.replace(/\s*\{shareJob[\s\S]*?<\/ShareJD>\s*\)\s*\)\}/g, '');

// Remove setShareJob calls - replace button with router.push
c = c.replace(
  /onClick=\{[^}]*setShareJob[^}]*\}/g,
  'onClick={(e) => { e.stopPropagation(); router.push("/requirements/" + req.id); }}'
);

fs.writeFileSync(fp, c);

// Verify no shareJob references remain except in comments
const remaining = c.split('\n').filter(function(l) { return l.includes('shareJob') && !l.includes('//'); });
if (remaining.length > 0) {
  console.log('WARNING - shareJob still found:');
  remaining.forEach(function(l) { console.log('  ', l.trim()); });
} else {
  console.log('Clean - no shareJob references');
}
EOF
node fix-build.js
rm fix-build.js
echo "✅ Requirements list page fixed"

echo ""
echo "=========================================="
echo "Done! Restart backend:"
echo "  cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "Then build + deploy:"
echo "  npm run build && git add . && git commit -m 'Public apply + LinkedIn meta' && git push"
echo ""
echo "What's new:"
echo "  1. LinkedIn shows: 'Staff DevOps Engineer at Locus — Bangalore'"
echo "     instead of 'FX CRM — FX Consulting'"
echo ""
echo "  2. Public JD page has Apply form:"
echo "     - Candidates upload CV + fill name, email, phone"
echo "     - CV stored in Supabase, candidate created in CRM"
echo "     - Auto-added to pipeline as 'New' for that position"
echo "     - No login needed — works like an ATS"
echo ""
echo "  3. Requirements list share button fixed"
echo "=========================================="
