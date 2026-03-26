#!/bin/bash
# FX CRM — Public JD Page + Job Board Sharing
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-share.sh

set -e
echo "🚀 FX CRM — Public JD + Job Board Sharing"
echo ""

# ========================
# BACKEND: Public JD endpoint (no auth needed)
# ========================
cat > server/routes/public.js << 'EOF'
const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/public/jobs/:id — public JD view (no auth)
router.get('/jobs/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT j.title, j.location, j.type, j.exp_min, j.exp_max, j.description, j.skills,
        j.priority, j.positions_count, j.status,
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
      skills: job.skills,
      description: job.description,
      positions: job.positions_count,
      posted_by: 'FX Consulting',
      apply_info: 'Send your CV to careers@fxconsulting.in',
    });
  } catch (err) {
    console.error('Public JD error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
EOF
echo "✅ server/routes/public.js"

# ========================
# BACKEND: Mount public route (no auth)
# ========================
node -e "
const fs = require('fs');
let c = fs.readFileSync('server/index.js', 'utf8');
if (!c.includes('publicRoutes')) {
  c = c.replace(
    \"const { authenticate } = require('./middleware/auth');\",
    \"const publicRoutes = require('./routes/public');\nconst { authenticate } = require('./middleware/auth');\"
  );
  c = c.replace(
    \"app.use('/api/auth'\",
    \"app.use('/api/public', publicRoutes);\napp.use('/api/auth'\"
  );
  fs.writeFileSync('server/index.js', c);
  console.log('Public route mounted');
} else { console.log('Already mounted'); }
"
echo "✅ server/index.js updated"

# ========================
# FRONTEND: Public JD page (no login required)
# ========================
mkdir -p "src/app/jobs/[id]"
cat > "src/app/jobs/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { MapPin, Briefcase, Clock, Building2, Share2, ExternalLink } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function PublicJDPage() {
  const params = useParams();
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Position Not Available</h1>
          <p className="text-gray-500">{error || 'This position has been closed or removed.'}</p>
        </div>
      </div>
    );
  }

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2d5a8e] text-white">
        <div className="max-w-3xl mx-auto px-6 py-10">
          <div className="flex items-center gap-2 text-blue-200 text-sm mb-4">
            <Building2 className="w-4 h-4" />
            <span>{job.company}</span>
            {job.industry && <><span>·</span><span>{job.industry}</span></>}
          </div>
          <h1 className="text-3xl font-bold mb-4">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-blue-100">
            <span className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{job.location}</span>
            <span className="flex items-center gap-1.5"><Briefcase className="w-4 h-4" />{job.type}</span>
            <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{job.experience}</span>
            {job.positions > 1 && <span>{job.positions} positions</span>}
          </div>
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
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
              {job.description}
            </div>
          </div>
        )}

        {/* Apply */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Interested?</h2>
          <p className="text-sm text-gray-600 mb-4">Send your CV to apply for this position.</p>
          <a href="mailto:careers@fxconsulting.in?subject=Application: ${job.title}"
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors">
            Apply Now — careers@fxconsulting.in
          </a>
        </div>

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 pt-4 border-t border-gray-100">
          <p>Posted by <strong>FX Consulting</strong> — Recruitment Consulting</p>
          <p className="mt-1">fxconsulting.in</p>
        </div>
      </div>
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/jobs/[id]/page.tsx (public JD page)"

# ========================
# FRONTEND: Share JD panel in requirement detail
# ========================
mkdir -p src/components
cat > src/components/ShareJD.tsx << 'ENDOFFILE'
'use client';

import { useState } from 'react';
import {
  X, Copy, Check, ExternalLink, Linkedin, MessageSquare, Mail, Globe, FileText,
} from 'lucide-react';
import clsx from 'clsx';

interface ShareJDProps {
  show: boolean;
  onClose: () => void;
  job: {
    id: string;
    title: string;
    client_name: string;
    location: string;
    exp_min: number;
    exp_max: number;
    ctc_min: number;
    ctc_max: number;
    skills: string;
    description: string;
    type: string;
    positions_count: number;
    client_industry: string;
  };
}

export default function ShareJD({ show, onClose, job }: ShareJDProps) {
  const [copied, setCopied] = useState('');

  if (!show) return null;

  const publicUrl = `https://crm.fxconsulting.in/jobs/${job.id}`;

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  // LinkedIn post text
  const linkedinPost = `🚀 We're Hiring: ${job.title}

📍 ${job.location} | ${job.type}
🏢 ${job.client_name}${job.client_industry ? ` (${job.client_industry})` : ''}
📅 Experience: ${job.exp_min}-${job.exp_max} years
${job.positions_count > 1 ? `👥 ${job.positions_count} positions\n` : ''}
${job.skills ? `🔧 Skills: ${job.skills}\n` : ''}
${job.description ? job.description.substring(0, 500) + (job.description.length > 500 ? '...' : '') : ''}

Interested? Apply here: ${publicUrl}

#hiring #${job.title.replace(/\s+/g, '').replace(/[^a-zA-Z]/g, '')} #jobs #recruitment #${job.location?.replace(/\s+/g, '') || 'India'}`;

  const linkedinShareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`;

  // WhatsApp text
  const whatsappText = `*${job.title}*
Company: ${job.client_name}
Location: ${job.location}
Experience: ${job.exp_min}-${job.exp_max} years
Type: ${job.type}
${job.skills ? `\nSkills: ${job.skills}` : ''}
${job.description ? `\n${job.description.substring(0, 600)}` : ''}

Apply: ${publicUrl}

_Shared by FX Consulting_`;

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(whatsappText)}`;

  // Job board formatted text (for IIMJobs, Hirist, Naukri etc)
  const jobBoardText = `Job Title: ${job.title}
Company: ${job.client_name}
Location: ${job.location}
Job Type: ${job.type}
Experience: ${job.exp_min}-${job.exp_max} years
No. of Positions: ${job.positions_count}

Skills Required:
${job.skills || 'Not specified'}

Job Description:
${job.description || 'Not specified'}

How to Apply:
Send your CV to careers@fxconsulting.in with subject "${job.title} Application"

About the Recruiter:
FX Consulting — Recruitment Consulting Firm
Website: fxconsulting.in`;

  // Email share
  const emailSubject = encodeURIComponent(`Job Opportunity: ${job.title} at ${job.client_name}`);
  const emailBody = encodeURIComponent(`Hi,\n\nCheck out this job opportunity:\n\n${job.title} at ${job.client_name}\nLocation: ${job.location}\nExperience: ${job.exp_min}-${job.exp_max} years\n\nView full JD: ${publicUrl}\n\nRegards,\nFX Consulting`);

  const platforms = [
    {
      id: 'linkedin-post',
      name: 'LinkedIn Post',
      icon: Linkedin,
      color: 'bg-[#0077B5] hover:bg-[#006699]',
      action: () => copyText(linkedinPost, 'linkedin-post'),
      label: 'Copy Post',
      description: 'Copy formatted post → paste on LinkedIn',
    },
    {
      id: 'linkedin-share',
      name: 'LinkedIn Share',
      icon: ExternalLink,
      color: 'bg-[#0077B5] hover:bg-[#006699]',
      action: () => window.open(linkedinShareUrl, '_blank'),
      label: 'Open LinkedIn',
      description: 'Share JD link directly on LinkedIn',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      icon: MessageSquare,
      color: 'bg-[#25D366] hover:bg-[#1da851]',
      action: () => window.open(whatsappShareUrl, '_blank'),
      label: 'Share',
      description: 'Send JD to WhatsApp group/contact',
    },
    {
      id: 'iimjobs',
      name: 'IIMJobs / Hirist / Naukri',
      icon: Globe,
      color: 'bg-orange-500 hover:bg-orange-600',
      action: () => copyText(jobBoardText, 'jobboard'),
      label: 'Copy JD',
      description: 'Copy formatted JD → paste on any job board',
    },
    {
      id: 'email',
      name: 'Email',
      icon: Mail,
      color: 'bg-gray-600 hover:bg-gray-700',
      action: () => window.open(`mailto:?subject=${emailSubject}&body=${emailBody}`, '_blank'),
      label: 'Compose Email',
      description: 'Open email client with JD details',
    },
    {
      id: 'link',
      name: 'Public Link',
      icon: Copy,
      color: 'bg-fx-600 hover:bg-fx-700',
      action: () => copyText(publicUrl, 'link'),
      label: 'Copy Link',
      description: publicUrl,
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Share JD</h2>
            <p className="text-xs text-gray-400 mt-0.5">{job.title} — {job.client_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {platforms.map((p) => {
            const Icon = p.icon;
            const isCopied = copied === p.id || (p.id === 'iimjobs' && copied === 'jobboard');
            return (
              <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0', p.color)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{p.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{p.description}</p>
                </div>
                <button onClick={p.action}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0',
                    isCopied ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>
                  {isCopied ? <span className="flex items-center gap-1"><Check className="w-3 h-3" /> Copied</span> : p.label}
                </button>
              </div>
            );
          })}
        </div>

        <div className="px-5 pb-5">
          <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>Tip:</strong> For IIMJobs, Hirist, Naukri — click "Copy JD" then paste into their job posting form. The public link works as the apply URL.
          </div>
        </div>
      </div>
    </div>
  );
}
ENDOFFILE
echo "✅ src/components/ShareJD.tsx"

# ========================
# FRONTEND: Add Share button to requirement detail
# ========================
node -e "
const fs = require('fs');
const fp = 'src/app/(dashboard)/requirements/[id]/page.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Add import
if (!c.includes('ShareJD')) {
  c = c.replace(
    \"import clsx from 'clsx';\",
    \"import clsx from 'clsx';\nimport ShareJD from '@/components/ShareJD';\"
  );

  // Add Share2 icon import
  c = c.replace(
    \"Copy, Mail, Phone, Send,\",
    \"Copy, Mail, Phone, Send, Share2,\"
  );

  // Add state
  c = c.replace(
    'const [copied, setCopied]',
    'const [showShare, setShowShare] = useState(false);\n  const [copied, setCopied]'
  );

  // Add Share button next to Copy JD
  c = c.replace(
    \"{copied === 'jd' ? 'Copied' : 'Copy JD'}\",
    \"{copied === 'jd' ? 'Copied' : 'Copy JD'}\n          </button>\n          <button onClick={() => setShowShare(true)} className=\\\"flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors\\\"><Share2 className=\\\"w-3 h-3\\\" /> Share JD\"
  );

  // Add ShareJD component before last closing div
  const lastDiv = c.lastIndexOf('</div>');
  const secondLastDiv = c.lastIndexOf('</div>', lastDiv - 1);
  c = c.substring(0, secondLastDiv) + \`
      {/* Share JD Modal */}
      {requirement && (
        <ShareJD
          show={showShare}
          onClose={() => setShowShare(false)}
          job={{
            id: requirement.id || (params.id as string),
            title: requirement.title,
            client_name: requirement.client_name,
            location: requirement.location,
            exp_min: requirement.exp_min,
            exp_max: requirement.exp_max,
            ctc_min: requirement.ctc_min,
            ctc_max: requirement.ctc_max,
            skills: requirement.skills,
            description: requirement.description,
            type: requirement.type,
            positions_count: requirement.positions_count,
            client_industry: requirement.client_industry || '',
          }}
        />
      )}
\` + c.substring(secondLastDiv);

  fs.writeFileSync(fp, c);
  console.log('Share button added to requirement detail');
} else {
  console.log('ShareJD already added');
}
"
echo "✅ Requirement detail — Share JD button added"

# ========================
# FRONTEND: Add Share button to requirements LIST page too
# ========================
node -e "
const fs = require('fs');
const fp = 'src/app/(dashboard)/requirements/page.tsx';
let c = fs.readFileSync(fp, 'utf8');

if (!c.includes('ShareJD')) {
  // Add import
  c = c.replace(
    \"import clsx from 'clsx';\",
    \"import clsx from 'clsx';\nimport ShareJD from '@/components/ShareJD';\"
  );

  // Add Share2 icon
  if (!c.includes('Share2')) {
    c = c.replace(
      'AlertCircle,',
      'AlertCircle, Share2,'
    );
  }

  // Add state
  c = c.replace(
    'const [saving, setSaving]',
    'const [shareJob, setShareJob] = useState<Requirement | null>(null);\n  const [saving, setSaving]'
  );

  // Add share button in each requirement row (before ChevronRight)
  c = c.replace(
    '<ChevronRight className=\"w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors\" />',
    \`<button onClick={(e) => { e.stopPropagation(); setShareJob(req); }}
                      className=\"w-8 h-8 rounded-lg hover:bg-blue-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity\">
                      <Share2 className=\"w-3.5 h-3.5 text-blue-500\" />
                    </button>
                    <ChevronRight className=\"w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors\" />\`
  );

  // Add ShareJD modal before last closing div of the page
  const lastReturn = c.lastIndexOf('</div>');
  const secondLast = c.lastIndexOf('</div>', lastReturn - 1);
  c = c.substring(0, secondLast) + \`
      {shareJob && (
        <ShareJD
          show={!!shareJob}
          onClose={() => setShareJob(null)}
          job={{
            id: shareJob.id,
            title: shareJob.title,
            client_name: shareJob.client_name,
            location: shareJob.location,
            exp_min: shareJob.exp_min,
            exp_max: shareJob.exp_max,
            ctc_min: shareJob.ctc_min,
            ctc_max: shareJob.ctc_max,
            skills: shareJob.skills,
            description: shareJob.description || '',
            type: shareJob.type || 'Full Time',
            positions_count: shareJob.positions_count || 1,
            client_industry: shareJob.client_domain || '',
          }}
        />
      )}
\` + c.substring(secondLast);

  fs.writeFileSync(fp, c);
  console.log('Share button added to requirements list');
} else {
  console.log('ShareJD already in requirements list');
}
"
echo "✅ Requirements list — Share JD button added"

echo ""
echo "=========================================="
echo "🎉 Share JD + Public Page Complete!"
echo "=========================================="
echo ""
echo "Restart backend:"
echo "  cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "What's new:"
echo "  ✓ Public JD page: crm.fxconsulting.in/jobs/[position-id]"
echo "    - Beautiful public page, no login needed"
echo "    - Shows title, company, location, skills, full JD"
echo "    - Apply button → emails careers@fxconsulting.in"
echo ""
echo "  ✓ 'Share JD' button on requirement detail + list page"
echo "    - LinkedIn Post — copy formatted post with hashtags"
echo "    - LinkedIn Share — opens LinkedIn share dialog"
echo "    - WhatsApp — opens WhatsApp with JD text"
echo "    - IIMJobs/Hirist/Naukri — copy formatted JD for any job board"
echo "    - Email — opens email client with JD"
echo "    - Public Link — copy shareable URL"
echo ""
echo "Deploy: npm run build && git add . && git commit -m 'Share JD + public page' && git push"
echo ""
