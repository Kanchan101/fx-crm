#!/bin/bash
# FX CRM — JD Visible + AI Outreach Messages
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-outreach.sh

set -e
echo "🚀 FX CRM — JD Visibility + AI Outreach"
echo ""

# ========================
# BACKEND: AI outreach message generation endpoint
# ========================
cat > server/routes/outreach.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { Resend } = require('resend');

const router = express.Router();

// POST /api/outreach/generate — AI generates email, WhatsApp, LinkedIn messages
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { job_id, candidate_name, candidate_email, custom_note } = req.body;
    if (!job_id) return res.status(400).json({ error: 'Job ID required' });

    const jobResult = await query(
      `SELECT j.*, c.name as client_name, c.location as client_location, c.industry as client_industry
       FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1`, [job_id]
    );
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobResult.rows[0];
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    const senderName = req.user.name;
    const candidateGreeting = candidate_name ? candidate_name.split(' ')[0] : 'there';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are a recruitment consultant at FX Consulting. Generate 3 outreach messages for a job opportunity. Return ONLY a JSON object with these exact keys, no markdown, no explanation:

{
  "email_subject": "email subject line",
  "email_body": "full professional email body with greeting and sign-off",
  "whatsapp": "WhatsApp message, max 800 characters, casual professional tone, include key details, use line breaks for readability",
  "linkedin": "LinkedIn message, max 300 characters, professional networking tone, concise and compelling"
}

Job Details:
- Title: ${job.title}
- Company: ${job.client_name} (${job.client_industry || ''})
- Location: ${job.location || 'Not specified'}
- Experience Required: ${job.exp_min}-${job.exp_max} years
- CTC Range: ${job.ctc_min || 'Not specified'} - ${job.ctc_max || 'Not specified'} LPA
- Skills: ${job.skills || 'Not specified'}
- Job Description: ${(job.description || 'Not provided').substring(0, 3000)}

Sender: ${senderName}, FX Consulting
Candidate Name: ${candidate_name || 'Candidate'}
${custom_note ? 'Additional Note: ' + custom_note : ''}

Rules:
- Email: Professional, warm, highlight key role details, include JD summary, sign off as ${senderName} from FX Consulting with contact details placeholder
- WhatsApp: Friendly professional, use emojis sparingly (1-2 max), include role title + company + location + experience + key skills, max 800 chars
- LinkedIn: Hook them in first line, mention role briefly, ask to connect, max 300 chars
- Do NOT use phrases like "I came across your profile" — be direct about the opportunity
- Include specific details from JD to make it personalized`
        }]
      })
    });

    const aiResult = await response.json();
    const aiText = aiResult.content?.[0]?.text || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    let messages = { email_subject: '', email_body: '', whatsapp: '', linkedin: '' };
    if (jsonMatch) {
      messages = JSON.parse(jsonMatch[0]);
    }

    res.json({ messages, job_title: job.title, client_name: job.client_name });
  } catch (err) {
    console.error('Generate outreach error:', err);
    res.status(500).json({ error: 'Failed to generate messages' });
  }
});

// POST /api/outreach/send-email — Send outreach email to candidate
router.post('/send-email', authenticate, async (req, res) => {
  try {
    const { to_email, to_name, subject, body, job_id } = req.body;
    if (!to_email || !subject || !body) return res.status(400).json({ error: 'Email, subject, and body required' });

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured' });

    const resend = new Resend(RESEND_API_KEY);
    const fromEmail = `${req.user.name} <${req.user.email}>`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: to_email,
      subject: subject,
      html: body.replace(/\n/g, '<br/>'),
    });

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    // Log the outreach
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'OUTREACH_EMAIL', 'candidate', null, JSON.stringify({ to: to_email, subject, job_id })]
    );

    res.json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error('Send outreach email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/outreach.js"

# ========================
# BACKEND: Mount outreach route
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
const pipelineRoutes = require('./routes/pipeline');
const interviewRoutes = require('./routes/interviews');
const reportRoutes = require('./routes/reports');
const outreachRoutes = require('./routes/outreach');
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
app.use('/api/pipeline', authenticate, pipelineRoutes);
app.use('/api/interviews', authenticate, interviewRoutes);
app.use('/api/reports', authenticate, reportRoutes);
app.use('/api/outreach', authenticate, outreachRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => { console.log(`FX CRM API running on port ${PORT}`); });
ENDOFFILE
echo "✅ server/index.js (outreach route added)"

# ========================
# FRONTEND: Requirement detail page — JD always visible + AI Outreach panel
# ========================
cat > "src/app/(dashboard)/requirements/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  ArrowLeft, Building2, MapPin, Clock, Users, Copy, ChevronDown,
  Mail, Phone, Send, Sparkles, Loader2, MessageSquare, Linkedin,
  Check, X, ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const PIPELINE_STATUSES = [
  'New','Screening','Submitted to Client','Client Review',
  'Interview Stage','HR Discussion','Offer','Joined','Not Joined','Account Manager Rejected','Interview Reject'
];
const ACTIVE_STATUSES = ['Screening','Submitted to Client','Client Review','Interview Stage','HR Discussion','Offer'];
const SELECTED_STATUSES = ['Joined'];
const NOT_SELECTED_STATUSES = ['Not Joined','Account Manager Rejected','Interview Reject'];

const STATUS_COLORS: Record<string, string> = {
  'New':'bg-gray-100 border-gray-200','Screening':'bg-blue-50 border-blue-200',
  'Submitted to Client':'bg-indigo-50 border-indigo-200','Client Review':'bg-purple-50 border-purple-200',
  'Interview Stage':'bg-orange-50 border-orange-200','HR Discussion':'bg-amber-50 border-amber-200',
  'Offer':'bg-emerald-50 border-emerald-200','Joined':'bg-green-50 border-green-200',
  'Not Joined':'bg-red-50 border-red-200','Account Manager Rejected':'bg-rose-50 border-rose-200',
  'Interview Reject':'bg-pink-50 border-pink-200',
};
const STATUS_TEXT_COLORS: Record<string, string> = {
  'New':'text-gray-700','Screening':'text-blue-700','Submitted to Client':'text-indigo-700',
  'Client Review':'text-purple-700','Interview Stage':'text-orange-700','HR Discussion':'text-amber-700',
  'Offer':'text-emerald-700','Joined':'text-green-700','Not Joined':'text-red-700',
  'Account Manager Rejected':'text-rose-700','Interview Reject':'text-pink-700',
};

interface PipelineEntry {
  id: string; candidate_id: string; candidate_name: string; candidate_email: string;
  candidate_phone: string; candidate_location: string; experience_years: number;
  candidate_skills: string; candidate_current_role: string; candidate_company: string;
  status: string; ai_match_percent: number;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
  owner_name: string;
}

export default function RequirementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const [requirement, setRequirement] = useState<any>(null);
  const [assignedTeam, setAssignedTeam] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineTab, setPipelineTab] = useState('active');
  const [activeMainTab, setActiveMainTab] = useState('pipeline');

  // Outreach state
  const [showOutreach, setShowOutreach] = useState(false);
  const [outreachCandidate, setOutreachCandidate] = useState<PipelineEntry | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachMessages, setOutreachMessages] = useState<any>(null);
  const [customNote, setCustomNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [copied, setCopied] = useState('');

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/requirements/${params.id}`, { headers: headers() });
      const data = await res.json();
      setRequirement(data.requirement);
      setAssignedTeam(data.assigned_team || []);
      setPipeline(data.pipeline || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const changeStatus = async (pipelineId: string, newStatus: string) => {
    try {
      await fetch(`${API}/api/requirements/${params.id}/pipeline/${pipelineId}/status`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail();
    } catch (err) { console.error(err); }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const copyJD = () => {
    if (!requirement) return;
    const text = `${requirement.title}\nClient: ${requirement.client_name}\nLocation: ${requirement.location}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\nCTC: ${requirement.ctc_min || ''} - ${requirement.ctc_max || ''} LPA\n\nSkills: ${requirement.skills || ''}\n\nJob Description:\n${requirement.description || ''}`;
    copyText(text, 'jd');
  };

  // AI Outreach
  const openOutreach = (entry?: PipelineEntry) => {
    setOutreachCandidate(entry || null);
    setOutreachMessages(null);
    setCustomNote('');
    setEmailSent(false);
    setShowOutreach(true);
  };

  const generateMessages = async () => {
    setOutreachLoading(true);
    try {
      const res = await fetch(`${API}/api/outreach/generate`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          job_id: params.id,
          candidate_name: outreachCandidate?.candidate_name || '',
          candidate_email: outreachCandidate?.candidate_email || '',
          custom_note: customNote,
        }),
      });
      const data = await res.json();
      setOutreachMessages(data.messages);
    } catch (err) { console.error(err); }
    finally { setOutreachLoading(false); }
  };

  const sendEmail = async () => {
    if (!outreachMessages || !outreachCandidate?.candidate_email) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`${API}/api/outreach/send-email`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          to_email: outreachCandidate.candidate_email,
          to_name: outreachCandidate.candidate_name,
          subject: outreachMessages.email_subject,
          body: outreachMessages.email_body,
          job_id: params.id,
        }),
      });
      const data = await res.json();
      if (data.success) setEmailSent(true);
      else alert(data.error || 'Failed to send');
    } catch (err) { console.error(err); }
    finally { setSendingEmail(false); }
  };

  const avgAssessment = (e: PipelineEntry) => {
    const s = [e.assessment_soft_skills, e.assessment_stability, e.assessment_technical, e.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!requirement) return <div className="text-center py-20"><p className="text-gray-500">Requirement not found</p><button onClick={() => router.back()} className="text-fx-600 text-sm mt-2 hover:underline">Go back</button></div>;

  const priorityBg: Record<string, string> = { Critical: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-blue-400', Low: 'bg-green-400' };

  const getFilteredPipeline = () => {
    switch (pipelineTab) {
      case 'new': return pipeline.filter(p => p.status === 'New');
      case 'active': return pipeline.filter(p => ACTIVE_STATUSES.includes(p.status));
      case 'selected': return pipeline.filter(p => SELECTED_STATUSES.includes(p.status));
      case 'not_selected': return pipeline.filter(p => NOT_SELECTED_STATUSES.includes(p.status));
      default: return pipeline;
    }
  };
  const filteredPipeline = getFilteredPipeline();

  const pipelineTabs = [
    { id: 'all', label: 'All', count: pipeline.length },
    { id: 'new', label: 'New', count: pipeline.filter(p => p.status === 'New').length },
    { id: 'active', label: 'In Stage', count: pipeline.filter(p => ACTIVE_STATUSES.includes(p.status)).length },
    { id: 'selected', label: 'Selected', count: pipeline.filter(p => SELECTED_STATUSES.includes(p.status)).length },
    { id: 'not_selected', label: 'Not Selected', count: pipeline.filter(p => NOT_SELECTED_STATUSES.includes(p.status)).length },
  ];

  const mainTabs = [
    { id: 'pipeline', label: `Candidates (${pipeline.length})` },
    { id: 'details', label: 'Job Description' },
    { id: 'info', label: 'Requirement Info' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/requirements')} className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{requirement.title}</h1>
            <div className={clsx('w-2 h-2 rounded-full', priorityBg[requirement.priority])} title={requirement.priority} />
            <span className={clsx('badge', requirement.status === 'Open' ? 'badge-open' : 'badge-closed')}>{requirement.status}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{requirement.client_name} ({requirement.client_tier})</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{requirement.location}</span>
            <span>Exp: {requirement.exp_min}-{requirement.exp_max} yrs</span>
            <span>{requirement.type}</span>
            {requirement.ctc_min || requirement.ctc_max ? <span>CTC: {requirement.ctc_min}-{requirement.ctc_max} LPA</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
            <Sparkles className="w-3 h-3" /> AI Outreach
          </button>
          <button onClick={copyJD} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
            {copied === 'jd' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'jd' ? 'Copied' : 'Copy JD'}
          </button>
        </div>
      </div>

      {/* Main tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {mainTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveMainTab(tab.id)}
            className={clsx('px-4 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeMainTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Job Description tab */}
      {activeMainTab === 'details' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{requirement.title}</h3>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
              <span>{requirement.client_name}</span>
              <span>{requirement.location}</span>
              <span>{requirement.exp_min}-{requirement.exp_max} yrs</span>
              <span>{requirement.ctc_min}-{requirement.ctc_max} LPA</span>
              <span>{requirement.type}</span>
              <span>Positions: {requirement.positions_count}</span>
            </div>
          </div>
          {requirement.skills && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {requirement.skills.split(',').map((s: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 bg-fx-50 text-fx-700 rounded-md text-xs font-medium">{s.trim()}</span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Job Description</p>
            {requirement.description ? (
              <div className="prose prose-sm max-w-none">
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{requirement.description}</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No job description added yet</p>
            )}
          </div>
          {requirement.internal_notes && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Internal Notes</p>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{requirement.internal_notes}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button onClick={copyJD} className="flex items-center gap-1.5 px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              {copied === 'jd' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} {copied === 'jd' ? 'Copied' : 'Copy Full JD'}
            </button>
            <button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-4 py-2 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
              <Sparkles className="w-3.5 h-3.5" /> Generate Outreach Messages
            </button>
          </div>
        </div>
      )}

      {/* Requirement Info tab */}
      {activeMainTab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-gray-400 mb-1">Priority</p><p className="font-medium text-gray-800">{requirement.priority}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Positions</p><p className="font-medium text-gray-800">{requirement.positions_count}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Deadline</p><p className="font-medium text-gray-800">{requirement.deadline ? new Date(requirement.deadline).toLocaleDateString('en-IN') : '—'}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Created</p><p className="font-medium text-gray-800">{new Date(requirement.created_at).toLocaleDateString('en-IN')}</p></div>
          </div>
          <div><p className="text-xs text-gray-400 mb-1">Client SPOC</p><p className="text-sm text-gray-800">{requirement.client_spoc || '—'} {requirement.client_spoc_email ? `(${requirement.client_spoc_email})` : ''}</p></div>
          <div>
            <p className="text-xs text-gray-400 mb-2">Assigned Team ({assignedTeam.length})</p>
            <div className="flex flex-wrap gap-2">
              {assignedTeam.map((m: any) => (
                <div key={m.team_member_id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-[9px] font-medium">
                    {m.name.split(' ').map((w: string) => w[0]).join('').substring(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-gray-700">{m.name}</span>
                  <span className="text-[10px] text-gray-400">{m.role}</span>
                </div>
              ))}
              {assignedTeam.length === 0 && <p className="text-xs text-gray-400">No one assigned</p>}
            </div>
          </div>
        </div>
      )}

      {/* Pipeline tab */}
      {activeMainTab === 'pipeline' && (
        <div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit">
            {pipelineTabs.map(tab => (
              <button key={tab.id} onClick={() => setPipelineTab(tab.id)}
                className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                  pipelineTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {tab.label}
                <span className={clsx('px-1.5 py-0.5 rounded-full text-[10px]',
                  pipelineTab === tab.id ? 'bg-fx-100 text-fx-700' : 'bg-gray-200 text-gray-500')}>{tab.count}</span>
              </button>
            ))}
          </div>

          {filteredPipeline.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
              <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No candidates in this category</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPipeline.map((entry) => (
                <div key={entry.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all overflow-hidden">
                  <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => router.push(`/candidates/${entry.candidate_id}`)}>
                    <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">
                      {entry.candidate_name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-900 truncate hover:text-fx-700">{entry.candidate_name}</p>
                        <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_TEXT_COLORS[entry.status])}>{entry.status}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                        {entry.candidate_current_role && <span>{entry.candidate_current_role}</span>}
                        {entry.candidate_company && <span>@ {entry.candidate_company}</span>}
                        {entry.experience_years && <span>{entry.experience_years}y exp</span>}
                        {entry.candidate_location && <span><MapPin className="w-3 h-3 inline" />{entry.candidate_location}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {entry.ai_match_percent && (
                        <div className="text-center">
                          <span className="text-xs font-bold text-gray-600">{entry.ai_match_percent}%</span>
                          <p className="text-[9px] text-gray-400">Match</p>
                        </div>
                      )}
                      {avgAssessment(entry) && (
                        <div className="text-center">
                          <span className="text-sm font-bold text-gray-700">{avgAssessment(entry)}</span>
                          <p className="text-[9px] text-gray-400">Score</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-50 pt-2">
                    <div className="flex items-center gap-3 text-[10px] text-gray-400">
                      {entry.candidate_email && <span><Mail className="w-3 h-3 inline" /> {entry.candidate_email}</span>}
                      {entry.candidate_phone && <span><Phone className="w-3 h-3 inline" /> {entry.candidate_phone}</span>}
                      <span className="text-gray-300">{entry.owner_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={(e) => { e.stopPropagation(); openOutreach(entry); }}
                        className="px-2 py-1 text-[10px] bg-violet-50 text-violet-600 hover:bg-violet-100 rounded font-medium transition-colors flex items-center gap-1">
                        <Send className="w-3 h-3" /> Outreach
                      </button>
                      <select value={entry.status} onChange={(e) => { e.stopPropagation(); changeStatus(entry.id, e.target.value); }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600">
                        {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== AI OUTREACH MODAL ===== */}
      {showOutreach && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowOutreach(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" /> AI Outreach</h2>
                <p className="text-xs text-gray-400 mt-0.5">{requirement.title} — {requirement.client_name}</p>
              </div>
              <button onClick={() => setShowOutreach(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>

            <div className="p-5 space-y-4">
              {outreachCandidate && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-semibold">
                    {outreachCandidate.candidate_name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{outreachCandidate.candidate_name}</p>
                    <p className="text-xs text-gray-400">{outreachCandidate.candidate_email || 'No email'}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Custom Note (optional)</label>
                <input type="text" value={customNote} onChange={(e) => setCustomNote(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="e.g. Candidate has HVAC experience, mention that..." />
              </div>

              {!outreachMessages && (
                <button onClick={generateMessages} disabled={outreachLoading}
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  {outreachLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {outreachLoading ? 'Generating...' : 'Generate Messages with AI'}
                </button>
              )}

              {outreachMessages && (
                <div className="space-y-4">
                  {/* Email */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" /><span className="text-xs font-semibold text-gray-700">Email</span></div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyText(outreachMessages.email_subject + '\n\n' + outreachMessages.email_body, 'email')}
                          className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
                          {copied === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'email' ? 'Copied' : 'Copy'}
                        </button>
                        {outreachCandidate?.candidate_email && (
                          <button onClick={sendEmail} disabled={sendingEmail || emailSent}
                            className={clsx('text-[10px] px-2 py-1 rounded font-medium flex items-center gap-1',
                              emailSent ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-500 hover:bg-blue-600 text-white')}>
                            {emailSent ? <><Check className="w-3 h-3" /> Sent</> : sendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3" /> Send</>}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-xs text-gray-400 mb-1">Subject: <span className="text-gray-700 font-medium">{outreachMessages.email_subject}</span></p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-2">{outreachMessages.email_body}</p>
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-500" /><span className="text-xs font-semibold text-gray-700">WhatsApp</span><span className="text-[10px] text-gray-400">{outreachMessages.whatsapp?.length || 0}/800 chars</span></div>
                      <button onClick={() => copyText(outreachMessages.whatsapp, 'whatsapp')}
                        className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        {copied === 'whatsapp' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'whatsapp' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="p-4 bg-emerald-50/30">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{outreachMessages.whatsapp}</p>
                    </div>
                  </div>

                  {/* LinkedIn */}
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100">
                      <div className="flex items-center gap-2"><Linkedin className="w-4 h-4 text-blue-600" /><span className="text-xs font-semibold text-gray-700">LinkedIn</span><span className="text-[10px] text-gray-400">{outreachMessages.linkedin?.length || 0}/300 chars</span></div>
                      <button onClick={() => copyText(outreachMessages.linkedin, 'linkedin')}
                        className="text-[10px] text-gray-500 hover:text-gray-700 flex items-center gap-1">
                        {copied === 'linkedin' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'linkedin' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <div className="p-4 bg-blue-50/30">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{outreachMessages.linkedin}</p>
                    </div>
                  </div>

                  <button onClick={() => { setOutreachMessages(null); setEmailSent(false); }}
                    className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Regenerate Messages
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/requirements/[id]/page.tsx (JD tab + AI outreach)"

# ========================
# FRONTEND: Requirements list — clicking title navigates to detail
# ========================
# Already done — titles are clickable from Phase 3

echo ""
echo "=========================================="
echo "🎉 JD Visibility + AI Outreach complete!"
echo "=========================================="
echo ""
echo "Restart backend:"
echo "  cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "Changes:"
echo "  ✓ Requirement detail now has 3 tabs:"
echo "    - Candidates (pipeline with tabs)"
echo "    - Job Description (full JD, skills, copy button)"
echo "    - Requirement Info (details, team, client SPOC)"
echo ""
echo "  ✓ AI Outreach button on requirement header + each candidate card"
echo "    - Click 'AI Outreach' → generates 3 messages using Claude:"
echo "      1. Email (professional, with Send button to email directly)"
echo "      2. WhatsApp (800 char limit, copy to clipboard)"
echo "      3. LinkedIn (300 char limit, copy to clipboard)"
echo "    - Optional custom note to personalize AI output"
echo "    - Regenerate button to get fresh messages"
echo ""
echo "Deploy: git add . && git commit -m 'JD visibility + AI outreach' && git push"
echo ""
