'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  ArrowLeft, Building2, MapPin, Clock, Users, Copy, ChevronDown,
  Mail, Phone, Send, Sparkles, Loader2, MessageSquare, Linkedin, Calendar, Video,
  Check, X, ExternalLink, Share2, FileText, Globe,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// ===== NEW WORKFLOW STATUSES =====
const PIPELINE_STATUSES = [
  'AM Review Pending', 'AM Review Select', 'Client Review Pending', 'Interview',
  'Offered', 'Joined', 'Rejected', 'On Hold', 'Dropped'
];

// Pipeline tab groupings
const TAB_GROUPS: Record<string, string[]> = {
  all: PIPELINE_STATUSES,
  am_review_pending: ['AM Review Pending'],
  am_review_select: ['AM Review Select'],
  client_review: ['Client Review Pending'],
  interview: ['Interview'],
  offered: ['Offered'],
  closed: ['Joined', 'Rejected', 'On Hold', 'Dropped'],
};

// Colors
const STATUS_COLORS: Record<string, string> = {
  'AM Review Pending': 'bg-gray-100 text-gray-700',
  'AM Review Select': 'bg-blue-100 text-blue-700',
  'Client Review Pending': 'bg-purple-100 text-purple-700',
  'Interview': 'bg-amber-100 text-amber-700',
  'Offered': 'bg-teal-100 text-teal-700',
  'Joined': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'On Hold': 'bg-yellow-100 text-yellow-700',
  'Dropped': 'bg-gray-200 text-gray-600',
};

// Reject reason options
const REJECT_REASONS = ['Not a fit', 'Client rejected', 'Failed interview', 'Salary mismatch', 'Overqualified', 'Underqualified', 'Other'];
const INTERVIEW_ROUNDS = ['L1', 'L2', 'L3', 'L4', 'HR'];
const INTERVIEW_MODES = ['Video Call', 'Phone', 'In-Person', 'Assignment'];

const DROP_REASONS = ['Accepted other offer', 'Not interested', 'Did not respond', 'Counter offer accepted', 'Personal reasons', 'Other'];

interface PipelineEntry {
  id: string; candidate_id: string; candidate_name: string; candidate_email: string;
  candidate_phone: string; candidate_location: string; experience_years: number;
  candidate_skills: string; candidate_current_role: string; candidate_company: string;
  candidate_cv_url: string;
  status: string; ai_match_percent: number;
  reject_reason: string; drop_reason: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
  owner_name: string;
  interview_round: string;
}

export default function RequirementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const [requirement, setRequirement] = useState<any>(null);
  const [assignedTeam, setAssignedTeam] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [spocs, setSpocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineTab, setPipelineTab] = useState('all');
  const [activeMainTab, setActiveMainTab] = useState('pipeline');

  // Status change modal
  const [statusModal, setStatusModal] = useState<{ entry: PipelineEntry; newStatus: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [dropReason, setDropReason] = useState('');

  // Outreach state
  const [showOutreach, setShowOutreach] = useState(false);
  const [outreachCandidate, setOutreachCandidate] = useState<PipelineEntry | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachMessages, setOutreachMessages] = useState<any>(null);
  const [customNote, setCustomNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  // Send CV state
  const [showSendCV, setShowSendCV] = useState(false);
  const [selectedSpocEmails, setSelectedSpocEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingCV, setSendingCV] = useState(false);
  const [cvSent, setCvSent] = useState(false);

  // Interview scheduling state
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCandidate, setScheduleCandidate] = useState<PipelineEntry | null>(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', time: '', round: 'L1', mode: 'Video Call', meeting_link: '', interviewer_name: '', notes: '' });
  const [scheduling, setScheduling] = useState(false);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [copied, setCopied] = useState('');
  const [showShare, setShowShare] = useState(false);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/requirements/${params.id}`, { headers: headers() });
      const data = await res.json();
      setRequirement(data.requirement);
      setAssignedTeam(data.assigned_team || []);
      setPipeline(data.pipeline || []);
      setSpocs(data.spocs || []);
      setInterviews(data.interviews || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  // Handle status change — show reason modal for Rejected/Dropped
  const handleStatusChange = (entry: PipelineEntry, newStatus: string) => {
    if (newStatus === 'Rejected' || newStatus === 'Dropped') {
      setStatusModal({ entry, newStatus });
      setRejectReason('');
      setDropReason('');
    } else {
      changeStatus(entry.id, newStatus);
    }
  };

  const changeStatus = async (pipelineId: string, newStatus: string, reason?: string) => {
    try {
      const body: any = { status: newStatus };
      if (newStatus === 'Rejected' && reason) body.reject_reason = reason;
      if (newStatus === 'Dropped' && reason) body.drop_reason = reason;

      await fetch(`${API}/api/requirements/${params.id}/pipeline/${pipelineId}/status`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify(body),
      });
      setStatusModal(null);
      fetchDetail();
    } catch (err) { console.error(err); }
  };

  const confirmStatusChange = () => {
    if (!statusModal) return;
    const reason = statusModal.newStatus === 'Rejected' ? rejectReason : dropReason;
    changeStatus(statusModal.entry.id, statusModal.newStatus, reason);
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

  // Send CV
  const amReviewSelectCount = pipeline.filter(p => p.status === 'AM Review Select').length;
  const toggleSpocEmail = (email: string) => {
    setSelectedSpocEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };
  const handleSendCV = async () => {
    if (selectedSpocEmails.length === 0) return;
    setSendingCV(true); setCvSent(false);
    try {
      const ids = pipeline.filter(p => p.status === 'AM Review Select').map(p => p.candidate_id);
      const cc = ccEmails.split(',').map((e: string) => e.trim()).filter(Boolean);
      const res = await fetch(`${API}/api/send-cv`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ job_id: params.id, spoc_emails: selectedSpocEmails, cc_emails: cc.length ? cc : undefined, candidate_ids: ids, custom_message: customMessage || undefined }),
      });
      const data = await res.json();
      if (data.success) { setCvSent(true); fetchDetail(); } else alert(data.error || 'Failed');
    } catch (err) { console.error(err); }
    finally { setSendingCV(false); }
  };  // Schedule Interview
  const openSchedule = (entry: PipelineEntry) => {
    setScheduleCandidate(entry);
    setInterviewForm({ date: '', time: '', round: entry.interview_round || 'L1', mode: 'Video Call', meeting_link: '', interviewer_name: '', notes: '' });
    setShowSchedule(true);
  };

  const scheduleInterview = async () => {
    if (!scheduleCandidate || !interviewForm.date) return;
    setScheduling(true);
    try {
      await fetch(`${API}/api/interviews`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          candidate_id: scheduleCandidate.candidate_id,
          job_id: params.id,
          pipeline_id: scheduleCandidate.id,
          interview_date: interviewForm.date,
          interview_time: interviewForm.time || null,
          type: interviewForm.round,
          mode: interviewForm.mode,
          interviewer_name: interviewForm.interviewer_name,
          meeting_link: interviewForm.meeting_link,
          notes: interviewForm.notes,
        }),
      });
      // Update pipeline status to Interview with round
      await fetch(`${API}/api/requirements/${params.id}/pipeline/${scheduleCandidate.id}/status`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ status: 'Interview', interview_round: interviewForm.round }),
      });
      setShowSchedule(false);
      fetchDetail();
    } catch (err) { console.error(err); }
    finally { setScheduling(false); }
  };

  // Copy interview WhatsApp message
  const copyInterviewWhatsApp = (entry: PipelineEntry) => {
    const iv = interviews.find((i: any) => i.candidate_id === entry.candidate_id);
    const dateStr = iv ? new Date(iv.interview_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '[DATE]';
    const timeStr = iv?.interview_time ? iv.interview_time.substring(0, 5) : '[TIME]';
    const msg = `Hi ${entry.candidate_name},\n\nYour interview has been scheduled:\n\n*Position:* ${requirement?.title || ''}\n*Company:* ${requirement?.client_name || ''}\n*Date:* ${dateStr}\n*Time:* ${timeStr}\n*Round:* ${iv?.type || entry.interview_round || 'L1'}\n*Mode:* ${iv?.mode || 'Video Call'}${iv?.meeting_link ? '\n*Link:* ' + iv.meeting_link : ''}\n\nPlease confirm your availability.\n\nAll the best!\nFX Consulting Team`;
    navigator.clipboard.writeText(msg);
    setCopied('iv-wa-' + entry.id);
    setTimeout(() => setCopied(''), 2000);
  };

  // Send interview schedule email
  const sendInterviewEmail = async (entry: PipelineEntry) => {
    const iv = interviews.find((i: any) => i.candidate_id === entry.candidate_id);
    if (!entry.candidate_email) { alert('No email for this candidate'); return; }
    const dateStr = iv ? new Date(iv.interview_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '[DATE]';
    const timeStr = iv?.interview_time ? iv.interview_time.substring(0, 5) : '[TIME]';
    const subject = `Interview Schedule: ${requirement?.title} at ${requirement?.client_name}`;
    const body = `Dear ${entry.candidate_name},\n\nCongratulations! Your profile has been shortlisted for the ${requirement?.title} position at ${requirement?.client_name}.\n\nInterview Details:\n━━━━━━━━━━━━━━━━━\nDate: ${dateStr}\nTime: ${timeStr}\nRound: ${iv?.type || entry.interview_round || 'L1'}\nMode: ${iv?.mode || 'Video Call'}${iv?.meeting_link ? '\nMeeting Link: ' + iv.meeting_link : ''}${iv?.interviewer_name ? '\nInterviewer: ' + iv.interviewer_name : ''}\n━━━━━━━━━━━━━━━━━\n\nPlease confirm your availability by replying to this email.\n\nDocuments to keep ready:\n- Updated Resume\n- Government ID proof\n- Salary slips (last 3 months)\n\nAll the best!\n\nRegards,\nFX Consulting Team`;
    try {
      const res = await fetch(`${API}/api/outreach/send-email`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ to_email: entry.candidate_email, to_name: entry.candidate_name, subject, body, job_id: params.id }),
      });
      const data = await res.json();
      if (data.success) { setCopied('iv-email-' + entry.id); setTimeout(() => setCopied(''), 3000); }
      else alert(data.error || 'Failed to send');
    } catch (err) { console.error(err); }
  };

  // --- Share helpers ---
  const publicUrl = `https://crm.fxconsulting.in/jobs/${params.id}`;

  const shareLinkedInPost = () => {
    if (!requirement) return;
    const t = `🚀 We're Hiring: ${requirement.title}\n\n📍 ${requirement.location} | ${requirement.type}\n🏢 ${requirement.client_name}\n📅 Experience: ${requirement.exp_min}-${requirement.exp_max} years\n${requirement.skills ? `\n🔧 Skills: ${requirement.skills}\n` : ''}\n${(requirement.description || '').substring(0, 400)}\n\nApply: ${publicUrl}\n\n#hiring #jobs #recruitment`;
    copyText(t, 'li-post');
  };

  const shareLinkedInLink = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`, '_blank');
  };

  const shareWhatsApp = () => {
    if (!requirement) return;
    const t = `*${requirement.title}*\nCompany: ${requirement.client_name}\nLocation: ${requirement.location}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n${requirement.skills ? `\nSkills: ${requirement.skills}` : ''}\n\nApply: ${publicUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
  };

  const shareJobBoard = () => {
    if (!requirement) return;
    const t = `Job Title: ${requirement.title}\nCompany: ${requirement.client_name}\nLocation: ${requirement.location}\nType: ${requirement.type}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n\nSkills Required:\n${requirement.skills || 'Not specified'}\n\nJob Description:\n${requirement.description || 'Not specified'}\n\nHow to Apply:\nSend CV to careers@fxconsulting.in with subject "${requirement.title} Application"`;
    copyText(t, 'board');
  };

  const shareEmail = () => {
    if (!requirement) return;
    window.open(`mailto:?subject=${encodeURIComponent(`Job: ${requirement.title} at ${requirement.client_name}`)}&body=${encodeURIComponent(`${requirement.title}\n${requirement.client_name}\n${requirement.location}\nExp: ${requirement.exp_min}-${requirement.exp_max}y\n\n${publicUrl}`)}`, '_blank');
  };

  const shareLink = () => { copyText(publicUrl, 'link'); };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!requirement) return <div className="text-center py-20"><p className="text-gray-500">Requirement not found</p><button onClick={() => router.back()} className="text-fx-600 text-sm mt-2 hover:underline">Go back</button></div>;

  const priorityBg: Record<string, string> = { Critical: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-blue-400', Low: 'bg-green-400' };

  // Filter pipeline by tab
  const filteredPipeline = pipelineTab === 'all'
    ? pipeline
    : pipeline.filter(p => TAB_GROUPS[pipelineTab]?.includes(p.status));

  // Pipeline tab counts
  const pipelineTabs = [
    { id: 'all', label: 'All', count: pipeline.length },
    { id: 'am_review_pending', label: 'AM Review Pending', count: pipeline.filter(p => p.status === 'AM Review Pending').length },
    { id: 'am_review_select', label: 'AM Review Select', count: pipeline.filter(p => p.status === 'AM Review Select').length },
    { id: 'client_review', label: 'Client Review Pending', count: pipeline.filter(p => p.status === 'Client Review Pending').length },
    { id: 'interview', label: 'Interview', count: pipeline.filter(p => p.status === 'Interview').length },
    { id: 'offered', label: 'Offered', count: pipeline.filter(p => p.status === 'Offered').length },
    { id: 'closed', label: 'Closed', count: pipeline.filter(p => ['Joined','Rejected','On Hold','Dropped'].includes(p.status)).length },
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
            {(requirement.ctc_min || requirement.ctc_max) ? <span>CTC: {requirement.ctc_min}-{requirement.ctc_max} LPA</span> : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {amReviewSelectCount > 0 && (
            <button onClick={() => { setShowSendCV(true); setCvSent(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium">
              <Send className="w-3 h-3" /> Send CVs ({amReviewSelectCount})
            </button>
          )}          <button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
            <Sparkles className="w-3 h-3" /> AI Outreach
          </button>
          <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
            <Share2 className="w-3 h-3" /> Share JD
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

      {/* ===== JOB DESCRIPTION TAB ===== */}
      {activeMainTab === 'details' && (
        <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{requirement.title}</h3>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
              <span>{requirement.client_name}</span>
              <span>{requirement.location}</span>
              <span>{requirement.exp_min}-{requirement.exp_max} yrs</span>
              {(requirement.ctc_min || requirement.ctc_max) && <span>{requirement.ctc_min}-{requirement.ctc_max} LPA</span>}
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
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{requirement.description}</p>
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
            <button onClick={copyJD} className="flex items-center gap-1.5 px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
              {copied === 'jd' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />} {copied === 'jd' ? 'Copied' : 'Copy Full JD'}
            </button>
            <button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-4 py-2 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium">
              <Sparkles className="w-3.5 h-3.5" /> Generate Outreach
            </button>
          </div>
        </div>
      )}

      {/* ===== REQUIREMENT INFO TAB ===== */}
      {activeMainTab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-gray-400 mb-1">Priority</p><p className="font-medium text-gray-800">{requirement.priority}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Positions</p><p className="font-medium text-gray-800">{requirement.positions_count}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Deadline</p><p className="font-medium text-gray-800">{requirement.deadline ? new Date(requirement.deadline).toLocaleDateString('en-IN') : '—'}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Created</p><p className="font-medium text-gray-800">{new Date(requirement.created_at).toLocaleDateString('en-IN')}</p></div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-1">Client SPOC</p>
            <p className="text-sm text-gray-800">{requirement.client_spoc || '—'} {requirement.client_spoc_email ? `(${requirement.client_spoc_email})` : ''}</p>
          </div>
          {spocs.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Additional SPOCs</p>
              <div className="space-y-1">
                {spocs.map((s: any) => (
                  <div key={s.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <span className="font-medium">{s.name}</span>
                    {s.role && <span className="text-gray-400">({s.role})</span>}
                    {s.email && <span><Mail className="w-3 h-3 inline" /> {s.email}</span>}
                    {s.phone && <span><Phone className="w-3 h-3 inline" /> {s.phone}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
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

      {/* ===== PIPELINE TAB (MAIN) ===== */}
      {activeMainTab === 'pipeline' && (
        <div>
          {/* Pipeline sub-tabs */}
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
                        <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_COLORS[entry.status] || 'bg-gray-100 text-gray-600')}>
                          {entry.status}
                        </span>
                        {entry.status === 'Interview' && entry.interview_round && <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600">{entry.interview_round}</span>}
                        {entry.reject_reason && <span className="text-[10px] text-red-400">({entry.reject_reason})</span>}
                        {entry.drop_reason && <span className="text-[10px] text-gray-400">({entry.drop_reason})</span>}
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
                      {entry.status === 'Interview' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); openSchedule(entry); }}
                            className="px-2 py-1 text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-medium transition-colors flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Schedule
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); sendInterviewEmail(entry); }}
                            className="px-2 py-1 text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium transition-colors flex items-center gap-1">
                            {copied === 'iv-email-' + entry.id ? <><Check className="w-3 h-3" /> Sent</> : <><Mail className="w-3 h-3" /> Email</>}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); copyInterviewWhatsApp(entry); }}
                            className="px-2 py-1 text-[10px] bg-green-50 text-green-700 hover:bg-green-100 rounded font-medium transition-colors flex items-center gap-1">
                            {copied === 'iv-wa-' + entry.id ? <><Check className="w-3 h-3" /> Copied</> : <><MessageSquare className="w-3 h-3" /> WhatsApp</>}
                          </button>
                        </>
                      )}
                      <select value={entry.status}
                        onChange={(e) => { e.stopPropagation(); handleStatusChange(entry, e.target.value); }}
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

      {/* ===== REJECT/DROP REASON MODAL ===== */}
      {statusModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setStatusModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {statusModal.newStatus === 'Rejected' ? 'Reject Candidate' : 'Drop Candidate'}
              </h2>
              <p className="text-xs text-gray-400 mt-1">
                {statusModal.entry.candidate_name} — moving to {statusModal.newStatus}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">
                  {statusModal.newStatus === 'Rejected' ? 'Rejection Reason' : 'Drop Reason'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(statusModal.newStatus === 'Rejected' ? REJECT_REASONS : DROP_REASONS).map(reason => (
                    <button key={reason}
                      onClick={() => statusModal.newStatus === 'Rejected' ? setRejectReason(reason) : setDropReason(reason)}
                      className={clsx('px-3 py-2 rounded-lg text-xs text-left border transition-colors',
                        (statusModal.newStatus === 'Rejected' ? rejectReason : dropReason) === reason
                          ? 'border-fx-500 bg-fx-50 text-fx-700'
                          : 'border-gray-100 text-gray-600 hover:border-gray-200')}>
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setStatusModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={confirmStatusChange}
                className={clsx('px-5 py-2 rounded-lg text-sm font-medium text-white',
                  statusModal.newStatus === 'Rejected' ? 'bg-red-500 hover:bg-red-600' : 'bg-gray-600 hover:bg-gray-700')}>
                {statusModal.newStatus === 'Rejected' ? 'Reject' : 'Drop'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ===== SHARE JD MODAL ===== */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div><h2 className="text-lg font-semibold text-gray-900">Share JD</h2><p className="text-xs text-gray-400 mt-0.5">{requirement.title} — {requirement.client_name}</p></div>
              <button onClick={() => setShowShare(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { id: 'li-post', name: 'LinkedIn Post', icon: Linkedin, color: 'bg-[#0077B5]', label: copied === 'li-post' ? 'Copied!' : 'Copy Post', desc: 'Copy formatted post with hashtags', action: shareLinkedInPost },
                { id: 'li-share', name: 'LinkedIn Share', icon: ExternalLink, color: 'bg-[#0077B5]', label: 'Open LinkedIn', desc: 'Share JD link on LinkedIn', action: shareLinkedInLink },
                { id: 'wa', name: 'WhatsApp', icon: MessageSquare, color: 'bg-[#25D366]', label: 'Share', desc: 'Send JD to WhatsApp group', action: shareWhatsApp },
                { id: 'board', name: 'IIMJobs / Hirist / Naukri', icon: Globe, color: 'bg-orange-500', label: copied === 'board' ? 'Copied!' : 'Copy JD', desc: 'Copy formatted JD for job boards', action: shareJobBoard },
                { id: 'mail', name: 'Email', icon: Mail, color: 'bg-gray-600', label: 'Compose', desc: 'Open email with JD details', action: shareEmail },
                { id: 'link', name: 'Public Link', icon: Copy, color: 'bg-fx-600', label: copied === 'link' ? 'Copied!' : 'Copy Link', desc: publicUrl, action: shareLink },
              ].map(p => {
                const Icon = p.icon;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0', p.color)}><Icon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900">{p.name}</p><p className="text-[11px] text-gray-400 truncate">{p.desc}</p></div>
                    <button onClick={p.action} className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium', p.label.includes('Copied') ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>{p.label}</button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 pb-5"><div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700"><strong>Tip:</strong> For IIMJobs, Hirist, Naukri — click "Copy JD" then paste into their posting form.</div></div>
          </div>
        </div>
      )}

      {/* ===== SEND CVs MODAL ===== */}
      {showSendCV && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowSendCV(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg my-8 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div><h2 className="text-lg font-semibold text-gray-900">Send CVs to Client</h2><p className="text-xs text-gray-400 mt-0.5">{amReviewSelectCount} candidate{amReviewSelectCount > 1 ? 's' : ''}</p></div>
              <button onClick={() => setShowSendCV(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Select SPOCs *</p>
                {spocs.filter((s: any) => s.email).length === 0 ? <p className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700">No SPOCs found. Add SPOCs in Client page first.</p> : (
                  <div className="space-y-2">{spocs.filter((s: any) => s.email).map((spoc: any) => (
                    <button key={spoc.id} onClick={() => toggleSpocEmail(spoc.email)} className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left ${selectedSpocEmails.includes(spoc.email) ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${selectedSpocEmails.includes(spoc.email) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{selectedSpocEmails.includes(spoc.email) ? '✓' : ''}</div>
                      <div><p className="text-sm font-medium text-gray-900">{spoc.name}</p><p className="text-xs text-gray-400">{spoc.email}</p></div>
                    </button>
                  ))}</div>
                )}
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">CC (comma separated)</label><input type="text" value={ccEmails} onChange={e => setCcEmails(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="your@email.com" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Custom message (optional)</label><textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} /></div>
              <div><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Candidates to send</p><div className="space-y-1.5">{pipeline.filter(p => p.status === 'AM Review Select').map(c => <div key={c.id} className="text-xs text-gray-600 px-3 py-1.5 bg-gray-50 rounded-lg"><span className="font-medium">{c.candidate_name}</span> · {c.experience_years}y · {c.candidate_company || ''}</div>)}</div></div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowSendCV(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSendCV} disabled={sendingCV || cvSent || selectedSpocEmails.length === 0} className={`px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${cvSent ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white'}`}>
                {cvSent ? <><Check className="w-4 h-4" /> Sent!</> : sendingCV ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send CVs</>}
              </button>
            </div>
          </div>
        </div>
      )}      {/* ===== SCHEDULE INTERVIEW MODAL ===== */}
      {showSchedule && scheduleCandidate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowSchedule(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Calendar className="w-5 h-5 text-amber-500" /> Schedule Interview</h2>
                <p className="text-xs text-gray-400 mt-0.5">{scheduleCandidate.candidate_name} — {requirement.title}</p>
              </div>
              <button onClick={() => setShowSchedule(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                  <input type="date" value={interviewForm.date} onChange={e => setInterviewForm({...interviewForm, date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                  <input type="time" value={interviewForm.time} onChange={e => setInterviewForm({...interviewForm, time: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Round</label>
                  <select value={interviewForm.round} onChange={e => setInterviewForm({...interviewForm, round: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    {INTERVIEW_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                  <select value={interviewForm.mode} onChange={e => setInterviewForm({...interviewForm, mode: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    {INTERVIEW_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Link</label>
                <input type="url" placeholder="https://meet.google.com/..." value={interviewForm.meeting_link} onChange={e => setInterviewForm({...interviewForm, meeting_link: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interviewer Name</label>
                <input type="text" placeholder="Interviewer name" value={interviewForm.interviewer_name} onChange={e => setInterviewForm({...interviewForm, interviewer_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea placeholder="Any special instructions..." value={interviewForm.notes} onChange={e => setInterviewForm({...interviewForm, notes: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowSchedule(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={scheduleInterview} disabled={scheduling || !interviewForm.date} className="px-5 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white flex items-center gap-2">
                {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                {scheduling ? 'Scheduling...' : 'Schedule Interview'}
              </button>
            </div>
          </div>
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
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
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
                      <div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-500" /><span className="text-xs font-semibold text-gray-700">WhatsApp</span><span className="text-[10px] text-gray-400">{outreachMessages.whatsapp?.length || 0}/800</span></div>
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
                      <div className="flex items-center gap-2"><Linkedin className="w-4 h-4 text-blue-600" /><span className="text-xs font-semibold text-gray-700">LinkedIn</span><span className="text-[10px] text-gray-400">{outreachMessages.linkedin?.length || 0}/300</span></div>
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
                    className="w-full py-2 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50">
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
