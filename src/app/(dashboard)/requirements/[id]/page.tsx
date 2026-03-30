'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  ArrowLeft, Building2, MapPin, Users, Copy, Mail, Phone, Send,
  Sparkles, Loader2, MessageSquare, Linkedin, Check, X, Plus, Trash2,
  Share2, Globe, ExternalLink,
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

interface Spoc { id: string; name: string; email: string; phone: string; designation: string; is_primary: boolean; }

export default function RequirementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const canEdit = isRole('Super Admin', 'Account Manager');

  const [requirement, setRequirement] = useState<any>(null);
  const [assignedTeam, setAssignedTeam] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pipelineTab, setPipelineTab] = useState('active');
  const [activeMainTab, setActiveMainTab] = useState('pipeline');
  const [copied, setCopied] = useState('');

  // Share JD
  const [showShare, setShowShare] = useState(false);

  // SPOC
  const [spocs, setSpocs] = useState<Spoc[]>([]);
  const [showAddSpoc, setShowAddSpoc] = useState(false);
  const [spocForm, setSpocForm] = useState({ name: '', email: '', phone: '', designation: '', is_primary: false });

  // Send CV
  const [showSendCV, setShowSendCV] = useState(false);
  const [selectedSpocEmails, setSelectedSpocEmails] = useState<string[]>([]);
  const [ccEmails, setCcEmails] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sendingCV, setSendingCV] = useState(false);
  const [cvSent, setCvSent] = useState(false);

  // Outreach
  const [showOutreach, setShowOutreach] = useState(false);
  const [outreachCandidate, setOutreachCandidate] = useState<PipelineEntry | null>(null);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachMessages, setOutreachMessages] = useState<any>(null);
  const [customNote, setCustomNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const hdrs = (): Record<string, string> => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/requirements/${params.id}`, { headers: hdrs() });
      const data = await res.json();
      setRequirement(data.requirement);
      setAssignedTeam(data.assigned_team || []);
      setPipeline(data.pipeline || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [params.id]);

  const fetchSpocs = useCallback(async () => {
    if (!requirement?.client_id) return;
    try {
      const res = await fetch(`${API}/api/clients/${requirement.client_id}/spocs`, { headers: hdrs() });
      const data = await res.json();
      setSpocs(data.spocs || []);
    } catch (err) { console.error(err); }
  }, [requirement?.client_id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);
  useEffect(() => { fetchSpocs(); }, [fetchSpocs]);

  const changeStatus = async (pipelineId: string, newStatus: string) => {
    try {
      await fetch(`${API}/api/requirements/${params.id}/pipeline/${pipelineId}/status`, {
        method: 'PATCH', headers: hdrs(), body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail();
    } catch (err) { console.error(err); }
  };

  const doCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(''), 2000);
  };

  const copyJD = () => {
    if (!requirement) return;
    doCopy(`${requirement.title}\nClient: ${requirement.client_name}\nLocation: ${requirement.location}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n\nSkills: ${requirement.skills || ''}\n\nJob Description:\n${requirement.description || ''}`, 'jd');
  };

  // SPOC
  const addSpoc = async () => {
    if (!spocForm.name || !spocForm.email) return;
    await fetch(`${API}/api/clients/${requirement.client_id}/spocs`, { method: 'POST', headers: hdrs(), body: JSON.stringify(spocForm) });
    setSpocForm({ name: '', email: '', phone: '', designation: '', is_primary: false });
    setShowAddSpoc(false);
    fetchSpocs();
  };

  const deleteSpoc = async (spocId: string) => {
    if (!confirm('Remove this SPOC?')) return;
    await fetch(`${API}/api/clients/${requirement.client_id}/spocs/${spocId}`, { method: 'DELETE', headers: hdrs() });
    fetchSpocs();
  };

  // Send CVs
  const toggleSpocEmail = (email: string) => {
    setSelectedSpocEmails(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const handleSendCV = async () => {
    if (selectedSpocEmails.length === 0) return;
    setSendingCV(true); setCvSent(false);
    try {
      const ids = pipeline.filter(p => p.status === 'Submitted to Client').map(p => p.candidate_id);
      const cc = ccEmails.split(',').map(e => e.trim()).filter(Boolean);
      const res = await fetch(`${API}/api/send-cv`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ job_id: params.id, spoc_emails: selectedSpocEmails, cc_emails: cc.length ? cc : undefined, candidate_ids: ids, custom_message: customMessage || undefined }),
      });
      const data = await res.json();
      if (data.success) setCvSent(true); else alert(data.error || 'Failed');
    } catch (err) { console.error(err); }
    finally { setSendingCV(false); }
  };

  // Outreach
  const openOutreach = (entry?: PipelineEntry) => {
    setOutreachCandidate(entry || null); setOutreachMessages(null); setCustomNote(''); setEmailSent(false); setShowOutreach(true);
  };

  const generateMessages = async () => {
    setOutreachLoading(true);
    try {
      const res = await fetch(`${API}/api/outreach/generate`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ job_id: params.id, candidate_name: outreachCandidate?.candidate_name || '', candidate_email: outreachCandidate?.candidate_email || '', custom_note: customNote }),
      });
      setOutreachMessages((await res.json()).messages);
    } catch (err) { console.error(err); }
    finally { setOutreachLoading(false); }
  };

  const sendOutreachEmail = async () => {
    if (!outreachMessages || !outreachCandidate?.candidate_email) return;
    setSendingEmail(true);
    try {
      const res = await fetch(`${API}/api/outreach/send-email`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify({ to_email: outreachCandidate.candidate_email, to_name: outreachCandidate.candidate_name, subject: outreachMessages.email_subject, body: outreachMessages.email_body, job_id: params.id }),
      });
      if ((await res.json()).success) setEmailSent(true);
    } catch (err) { console.error(err); }
    finally { setSendingEmail(false); }
  };

  const avgAssessment = (e: PipelineEntry) => {
    const s = [e.assessment_soft_skills, e.assessment_stability, e.assessment_technical, e.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  };

  // --- Share helpers ---
  const publicUrl = `https://crm.fxconsulting.in/jobs/${params.id}`;
  // Anonymize client name for public sharing
  const getPublicCompanyLabel = () => {
    if (!requirement) return 'A leading company';
    const domain = (requirement.client_domain || requirement.client_industry || '').toLowerCase();
    if (domain.includes('hvac') || domain.includes('engineering')) return 'A world-leading manufacturing company in the HVAC space';
    if (domain.includes('internet') || domain.includes('ecommerce') || domain.includes('e-commerce')) return 'One of India\'s leading internet companies';
    if (domain.includes('it product') || domain.includes('technology')) return 'A leading technology product company';
    if (domain.includes('it services')) return 'A prominent IT services company';
    if (domain.includes('bfsi') || domain.includes('banking') || domain.includes('finance')) return 'A top BFSI company';
    if (domain.includes('telecom')) return 'A leading telecom company';
    if (domain.includes('healthcare') || domain.includes('pharma')) return 'A leading healthcare company';
    if (domain.includes('automotive')) return 'A major automotive company';
    if (domain.includes('retail')) return 'A leading retail brand';
    if (domain.includes('manufacturing')) return 'A leading manufacturing company';
    return 'A leading company in the ' + (requirement.client_industry || 'industry') + ' space';
  };



  const shareLinkedInPost = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    const t = `🚀 We're Hiring: ${requirement.title}\n\n📍 ${requirement.location} | ${requirement.type}\n🏢 ${company}\n📅 Experience: ${requirement.exp_min}-${requirement.exp_max} years\n${requirement.skills ? `\n🔧 Skills: ${requirement.skills}\n` : ''}\n${(requirement.description || '').substring(0, 400)}\n\nApply: ${publicUrl}\n\n#hiring #jobs #recruitment`;
    doCopy(t, 'li-post');
  };

  const shareLinkedInLink = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(publicUrl)}`, '_blank');
  };

  const shareWhatsApp = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    const t = `*${requirement.title}*\nCompany: ${company}\nLocation: ${requirement.location}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n${requirement.skills ? `\nSkills: ${requirement.skills}` : ''}\n\nApply: ${publicUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(t)}`, '_blank');
  };

  const shareJobBoard = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    const t = `Job Title: ${requirement.title}\nCompany: ${company}\nLocation: ${requirement.location}\nType: ${requirement.type}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n\nSkills Required:\n${requirement.skills || 'Not specified'}\n\nJob Description:\n${requirement.description || 'Not specified'}\n\nHow to Apply:\nSend CV to careers@fxconsulting.in with subject "${requirement.title} Application"`;
    doCopy(t, 'board');
  };

  const shareEmail = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    window.open(`mailto:?subject=${encodeURIComponent(`Job: ${requirement.title} - ${company}`)}&body=${encodeURIComponent(`${requirement.title}\n${company}\n${requirement.location}\nExp: ${requirement.exp_min}-${requirement.exp_max}y\n\n${publicUrl}`)}`, '_blank');
  };

  const shareLink = () => { doCopy(publicUrl, 'link'); };

  // --- Loading / Error ---
  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!requirement) return <div className="text-center py-20"><p className="text-gray-500">Not found</p><button onClick={() => router.back()} className="text-fx-600 text-sm mt-2 hover:underline">Go back</button></div>;

  const priorityBg: Record<string, string> = { Critical: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-blue-400', Low: 'bg-green-400' };
  const getFilteredPipeline = () => {
    switch (pipelineTab) {
      case 'new': return pipeline.filter(p => p.status === 'New');
      case 'active': return pipeline.filter(p => ACTIVE_STATUSES.includes(p.status));
      case 'selected': return pipeline.filter(p => SELECTED_STATUSES.includes(p.status));
      case 'not_selected': return pipeline.filter(p => NOT_SELECTED_STATUSES.includes(p.status));
      case 'submitted': return pipeline.filter(p => p.status === 'Submitted to Client');
      default: return pipeline;
    }
  };
  const filteredPipeline = getFilteredPipeline();
  const submittedCount = pipeline.filter(p => p.status === 'Submitted to Client').length;

  const pipelineTabs = [
    { id: 'all', label: 'All', count: pipeline.length },
    { id: 'new', label: 'New', count: pipeline.filter(p => p.status === 'New').length },
    { id: 'active', label: 'In Stage', count: pipeline.filter(p => ACTIVE_STATUSES.includes(p.status)).length },
    { id: 'submitted', label: 'Submitted', count: submittedCount },
    { id: 'selected', label: 'Selected', count: pipeline.filter(p => SELECTED_STATUSES.includes(p.status)).length },
    { id: 'not_selected', label: 'Not Selected', count: pipeline.filter(p => NOT_SELECTED_STATUSES.includes(p.status)).length },
  ];

  const mainTabs = [
    { id: 'pipeline', label: `Candidates (${pipeline.length})` },
    { id: 'details', label: 'Job Description' },
    { id: 'info', label: 'Requirement Info' },
    { id: 'spocs', label: `Client SPOCs (${spocs.length})` },
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
            <div className={clsx('w-2 h-2 rounded-full', priorityBg[requirement.priority])} />
            <span className={clsx('badge', requirement.status === 'Open' ? 'badge-open' : 'badge-closed')}>{requirement.status}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
            <span><Building2 className="w-3 h-3 inline" /> {requirement.client_name} ({requirement.client_tier})</span>
            <span><MapPin className="w-3 h-3 inline" /> {requirement.location}</span>
            <span>Exp: {requirement.exp_min}-{requirement.exp_max} yrs</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {submittedCount > 0 && canEdit && (
            <button onClick={() => { setShowSendCV(true); setCvSent(false); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-medium">
              <Send className="w-3 h-3" /> Send CVs ({submittedCount})
            </button>
          )}
          <button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium">
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
          <div className="flex items-center gap-4 text-sm text-gray-500">{requirement.client_name} · {requirement.location} · {requirement.exp_min}-{requirement.exp_max} yrs · {requirement.type} · {requirement.positions_count} position{requirement.positions_count > 1 ? 's' : ''}</div>
          {requirement.skills && (<div><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Required Skills</p><div className="flex flex-wrap gap-1.5">{requirement.skills.split(',').map((s: string, i: number) => <span key={i} className="px-2.5 py-1 bg-fx-50 text-fx-700 rounded-md text-xs font-medium">{s.trim()}</span>)}</div></div>)}
          <div><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Job Description</p>{requirement.description ? <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{requirement.description}</p> : <p className="text-sm text-gray-400 italic">No JD added</p>}</div>
          {requirement.internal_notes && (<div><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Internal Notes</p><p className="text-sm text-gray-600 whitespace-pre-wrap">{requirement.internal_notes}</p></div>)}
        </div>
      )}

      {/* ===== REQUIREMENT INFO TAB ===== */}
      {activeMainTab === 'info' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><p className="text-xs text-gray-400 mb-1">Priority</p><p className="font-medium">{requirement.priority}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Positions</p><p className="font-medium">{requirement.positions_count}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Deadline</p><p className="font-medium">{requirement.deadline ? new Date(requirement.deadline).toLocaleDateString('en-IN') : '—'}</p></div>
            <div><p className="text-xs text-gray-400 mb-1">Created</p><p className="font-medium">{new Date(requirement.created_at).toLocaleDateString('en-IN')}</p></div>
          </div>
          <div><p className="text-xs text-gray-400 mb-2">Assigned Team ({assignedTeam.length})</p><div className="flex flex-wrap gap-2">{assignedTeam.map((m: any) => (<div key={m.team_member_id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg"><div className="w-6 h-6 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-[9px] font-medium">{m.name.split(' ').map((w: string) => w[0]).join('').substring(0, 2)}</div><span className="text-xs font-medium text-gray-700">{m.name}</span><span className="text-[10px] text-gray-400">{m.role}</span></div>))}</div></div>
        </div>
      )}

      {/* ===== SPOCS TAB ===== */}
      {activeMainTab === 'spocs' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold text-gray-900">Client SPOCs — {requirement.client_name}</p>{canEdit && <button onClick={() => setShowAddSpoc(!showAddSpoc)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-fx-600 hover:bg-fx-700 text-white rounded-lg font-medium"><Plus className="w-3 h-3" /> Add SPOC</button>}</div>
          {showAddSpoc && (
            <div className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Name *</label><input type="text" value={spocForm.name} onChange={e => setSpocForm({...spocForm, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Email *</label><input type="email" value={spocForm.email} onChange={e => setSpocForm({...spocForm, email: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input type="tel" value={spocForm.phone} onChange={e => setSpocForm({...spocForm, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} /></div>
                <div><label className="block text-xs font-medium text-gray-600 mb-1">Designation</label><input type="text" value={spocForm.designation} onChange={e => setSpocForm({...spocForm, designation: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
              </div>
              <div className="flex gap-2"><button onClick={addSpoc} className="px-4 py-1.5 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-xs font-medium">Save</button><button onClick={() => setShowAddSpoc(false)} className="px-4 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-xs">Cancel</button></div>
            </div>
          )}
          {spocs.length === 0 ? <p className="text-sm text-gray-400 py-4">No SPOCs added yet.</p> : (
            <div className="space-y-2">{spocs.map(spoc => (
              <div key={spoc.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg hover:bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center text-xs font-semibold">{spoc.name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}</div>
                <div className="flex-1"><div className="flex items-center gap-2"><p className="text-sm font-medium text-gray-900">{spoc.name}</p>{spoc.is_primary && <span className="badge badge-gold">Primary</span>}</div><div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">{spoc.designation && <span>{spoc.designation}</span>}{spoc.email && <span>{spoc.email}</span>}{spoc.phone && <span>{spoc.phone}</span>}</div></div>
                {canEdit && <button onClick={() => deleteSpoc(spoc.id)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
              </div>
            ))}</div>
          )}
        </div>
      )}

      {/* ===== PIPELINE TAB ===== */}
      {activeMainTab === 'pipeline' && (
        <div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-4 w-fit overflow-x-auto">
            {pipelineTabs.map(tab => (
              <button key={tab.id} onClick={() => setPipelineTab(tab.id)} className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap', pipelineTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {tab.label}<span className={clsx('px-1.5 py-0.5 rounded-full text-[10px]', pipelineTab === tab.id ? 'bg-fx-100 text-fx-700' : 'bg-gray-200 text-gray-500')}>{tab.count}</span>
              </button>
            ))}
          </div>
          {filteredPipeline.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-10 text-center"><Users className="w-8 h-8 text-gray-200 mx-auto mb-2" /><p className="text-sm text-gray-400">No candidates in this category</p></div>
          ) : (
            <div className="space-y-3">{filteredPipeline.map(entry => (
              <div key={entry.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-all overflow-hidden">
                <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => router.push(`/candidates/${entry.candidate_id}`)}>
                  <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">{entry.candidate_name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><p className="text-sm font-semibold text-gray-900 truncate hover:text-fx-700">{entry.candidate_name}</p><span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_TEXT_COLORS[entry.status])}>{entry.status}</span></div>
                    <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">{entry.candidate_current_role && <span>{entry.candidate_current_role}</span>}{entry.candidate_company && <span>@ {entry.candidate_company}</span>}{entry.experience_years && <span>{entry.experience_years}y</span>}{entry.candidate_location && <span>{entry.candidate_location}</span>}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {entry.ai_match_percent && <div className="text-center"><span className="text-xs font-bold text-gray-600">{entry.ai_match_percent}%</span><p className="text-[9px] text-gray-400">Match</p></div>}
                    {avgAssessment(entry) && <div className="text-center"><span className="text-sm font-bold text-gray-700">{avgAssessment(entry)}</span><p className="text-[9px] text-gray-400">Score</p></div>}
                  </div>
                </div>
                <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-50 pt-2">
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">{entry.candidate_email && <span>{entry.candidate_email}</span>}{entry.candidate_phone && <span>{entry.candidate_phone}</span>}</div>
                  <div className="flex items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); openOutreach(entry); }} className="px-2 py-1 text-[10px] bg-violet-50 text-violet-600 hover:bg-violet-100 rounded font-medium flex items-center gap-1"><Send className="w-3 h-3" /> Outreach</button>
                    <select value={entry.status} onChange={e => { e.stopPropagation(); changeStatus(entry.id, e.target.value); }} onClick={e => e.stopPropagation()} className="text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600">
                      {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            ))}</div>
          )}
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
              <div><h2 className="text-lg font-semibold text-gray-900">Send CVs to Client</h2><p className="text-xs text-gray-400 mt-0.5">{submittedCount} candidate{submittedCount > 1 ? 's' : ''}</p></div>
              <button onClick={() => setShowSendCV(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Select SPOCs *</p>
                {spocs.filter(s => s.email).length === 0 ? <p className="p-3 bg-amber-50 rounded-lg text-sm text-amber-700">No SPOCs. Go to Client SPOCs tab first.</p> : (
                  <div className="space-y-2">{spocs.filter(s => s.email).map(spoc => (
                    <button key={spoc.id} onClick={() => toggleSpocEmail(spoc.email)} className={clsx('w-full flex items-center gap-3 p-3 rounded-lg border text-left', selectedSpocEmails.includes(spoc.email) ? 'border-fx-500 bg-fx-50' : 'border-gray-100 hover:border-gray-200')}>
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium', selectedSpocEmails.includes(spoc.email) ? 'bg-fx-600 text-white' : 'bg-gray-100 text-gray-400')}>{selectedSpocEmails.includes(spoc.email) ? '✓' : ''}</div>
                      <div><p className="text-sm font-medium text-gray-900">{spoc.name}</p><p className="text-xs text-gray-400">{spoc.email}</p></div>
                    </button>
                  ))}</div>
                )}
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">CC (comma separated)</label><input type="text" value={ccEmails} onChange={e => setCcEmails(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="your@email.com" /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Custom message (optional)</label><textarea value={customMessage} onChange={e => setCustomMessage(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} /></div>
              <div><p className="text-xs font-semibold text-gray-500 uppercase mb-2">Candidates</p><div className="space-y-1.5">{pipeline.filter(p => p.status === 'Submitted to Client').map(c => <div key={c.id} className="text-xs text-gray-600 px-3 py-1.5 bg-gray-50 rounded-lg"><span className="font-medium">{c.candidate_name}</span> · {c.experience_years}y · {c.candidate_company || ''}</div>)}</div></div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowSendCV(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleSendCV} disabled={sendingCV || cvSent || selectedSpocEmails.length === 0} className={clsx('px-5 py-2 rounded-lg text-sm font-medium flex items-center gap-2', cvSent ? 'bg-emerald-500 text-white' : 'bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white')}>
                {cvSent ? <><Check className="w-4 h-4" /> Sent</> : sendingCV ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4" /> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AI OUTREACH MODAL ===== */}
      {showOutreach && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowOutreach(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div><h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-violet-500" /> AI Outreach</h2><p className="text-xs text-gray-400 mt-0.5">{requirement.title} — {requirement.client_name}</p></div>
              <button onClick={() => setShowOutreach(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              {outreachCandidate && (
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-xs font-semibold">{outreachCandidate.candidate_name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}</div>
                  <div><p className="text-sm font-medium">{outreachCandidate.candidate_name}</p><p className="text-xs text-gray-400">{outreachCandidate.candidate_email || 'No email'}</p></div>
                </div>
              )}
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Custom Note</label><input type="text" value={customNote} onChange={e => setCustomNote(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Optional..." /></div>
              {!outreachMessages && (
                <button onClick={generateMessages} disabled={outreachLoading} className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  {outreachLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {outreachLoading ? 'Generating...' : 'Generate Messages'}
                </button>
              )}
              {outreachMessages && (
                <div className="space-y-4">
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100"><div className="flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" /><span className="text-xs font-semibold">Email</span></div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => doCopy(outreachMessages.email_subject + '\n\n' + outreachMessages.email_body, 'email')} className="text-[10px] text-gray-500 flex items-center gap-1">{copied === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'email' ? 'Copied' : 'Copy'}</button>
                        {outreachCandidate?.candidate_email && <button onClick={sendOutreachEmail} disabled={sendingEmail || emailSent} className={clsx('text-[10px] px-2 py-1 rounded font-medium flex items-center gap-1', emailSent ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-500 text-white')}>{emailSent ? <><Check className="w-3 h-3" /> Sent</> : sendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Send className="w-3 h-3" /> Send</>}</button>}
                      </div>
                    </div>
                    <div className="p-4"><p className="text-xs text-gray-400 mb-1">Subject: <span className="text-gray-700 font-medium">{outreachMessages.email_subject}</span></p><p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed mt-2">{outreachMessages.email_body}</p></div>
                  </div>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100"><div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-green-500" /><span className="text-xs font-semibold">WhatsApp</span><span className="text-[10px] text-gray-400">{outreachMessages.whatsapp?.length}/800</span></div>
                      <button onClick={() => doCopy(outreachMessages.whatsapp, 'wa')} className="text-[10px] text-gray-500 flex items-center gap-1">{copied === 'wa' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'wa' ? 'Copied' : 'Copy'}</button>
                    </div>
                    <div className="p-4 bg-emerald-50/30"><p className="text-sm text-gray-700 whitespace-pre-wrap">{outreachMessages.whatsapp}</p></div>
                  </div>
                  <div className="border border-gray-100 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-gray-100"><div className="flex items-center gap-2"><Linkedin className="w-4 h-4 text-blue-600" /><span className="text-xs font-semibold">LinkedIn</span><span className="text-[10px] text-gray-400">{outreachMessages.linkedin?.length}/300</span></div>
                      <button onClick={() => doCopy(outreachMessages.linkedin, 'li')} className="text-[10px] text-gray-500 flex items-center gap-1">{copied === 'li' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />} {copied === 'li' ? 'Copied' : 'Copy'}</button>
                    </div>
                    <div className="p-4 bg-blue-50/30"><p className="text-sm text-gray-700 whitespace-pre-wrap">{outreachMessages.linkedin}</p></div>
                  </div>
                  <button onClick={() => { setOutreachMessages(null); setEmailSent(false); }} className="w-full py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50">Regenerate</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
