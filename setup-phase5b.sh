#!/bin/bash
# FX CRM Phase 5b — Candidate Detail Page + Requirement Pipeline Tabs
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-phase5b.sh

set -e
echo "🚀 FX CRM Phase 5b — Candidate Details + Pipeline Tabs"
echo ""

# ========================
# FRONTEND: Candidate Detail Page
# ========================
mkdir -p "src/app/(dashboard)/candidates/[id]"
cat > "src/app/(dashboard)/candidates/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getToken } from '@/lib/api';
import {
  ArrowLeft, Mail, Phone, MapPin, Briefcase, Building2, GraduationCap,
  Clock, FileText, Star, Users, ChevronRight, Calendar, Shield,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const STATUS_COLORS: Record<string, string> = {
  'New': 'bg-gray-100 text-gray-700', 'Screening': 'bg-blue-100 text-blue-700',
  'Submitted to Client': 'bg-indigo-100 text-indigo-700', 'Client Review': 'bg-purple-100 text-purple-700',
  'Interview Stage': 'bg-orange-100 text-orange-700', 'HR Discussion': 'bg-amber-100 text-amber-700',
  'Offer': 'bg-emerald-100 text-emerald-700', 'Joined': 'bg-green-100 text-green-700',
  'Not Joined': 'bg-red-100 text-red-700', 'Account Manager Rejected': 'bg-rose-100 text-rose-700',
};

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [candidate, setCandidate] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('details');

  const fetchCandidate = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/candidates/${params.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCandidate(data.candidate);
      setPipeline(data.pipeline || []);
      setHistory(data.history || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { fetchCandidate(); }, [fetchCandidate]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!candidate) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Candidate not found</p>
        <button onClick={() => router.back()} className="text-fx-600 text-sm mt-2 hover:underline">Go back</button>
      </div>
    );
  }

  const c = candidate;
  const avgScore = () => {
    const s = [c.assessment_soft_skills, c.assessment_stability, c.assessment_technical, c.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a: number, b: number) => a + b, 0) / s.length).toFixed(1) : null;
  };

  const formatCTC = (fixed: number, variable: number) => {
    if (!fixed && !variable) return '—';
    const parts = [];
    if (fixed) parts.push(`${fixed}L fixed`);
    if (variable) parts.push(`${variable}L variable`);
    return parts.join(' + ');
  };

  const timeAgo = (date: string) => {
    if (!date) return '';
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const tabs = [
    { id: 'details', label: 'Full Details' },
    { id: 'pipeline', label: `Pipeline (${pipeline.length})` },
    { id: 'history', label: `History (${history.length})` },
    { id: 'resume', label: 'Resume Text' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-100 text-violet-700 flex items-center justify-center text-lg font-bold">
              {c.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{c.name}</h1>
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                {c.current_role && <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{c.current_role}</span>}
                {c.current_company && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{c.current_company}</span>}
                {c.experience_years && <span>{c.experience_years} years exp</span>}
                {c.location && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{c.location}</span>}
              </div>
            </div>
          </div>
        </div>
        {avgScore() && (
          <div className="text-center px-4 py-2 bg-violet-50 rounded-xl">
            <p className="text-2xl font-bold text-violet-700">{avgScore()}</p>
            <p className="text-[10px] text-violet-500 uppercase">Avg Score</p>
          </div>
        )}
      </div>

      {/* Contact bar */}
      <div className="flex items-center gap-4 bg-white rounded-xl border border-gray-100 px-5 py-3">
        {c.email && (
          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-fx-600">
            <Mail className="w-4 h-4" />{c.email}
          </a>
        )}
        {c.phone && (
          <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-fx-600">
            <Phone className="w-4 h-4" />{c.phone}
          </a>
        )}
        <span className="text-xs text-gray-400 ml-auto">Added by {c.owner_name} · {new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'details' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Professional */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Professional Details</h3>
            <div className="space-y-3">
              {[
                { label: 'Current Role', value: c.current_role },
                { label: 'Company', value: c.current_company },
                { label: 'Experience', value: c.experience_years ? `${c.experience_years} years` : null },
                { label: 'Education', value: c.education },
                { label: 'Location', value: c.location },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between">
                  <span className="text-xs text-gray-400 w-28 shrink-0">{label}</span>
                  <span className="text-sm text-gray-800 text-right">{value || '—'}</span>
                </div>
              ))}
            </div>
            {c.skills && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.split(',').map((skill: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-fx-50 text-fx-700 rounded text-xs">{skill.trim()}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Compensation */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Compensation & Availability</h3>
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Current CTC</span>
                <span className="text-sm text-gray-800 text-right">{formatCTC(c.current_ctc_fixed, c.current_ctc_variable)}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Expected CTC</span>
                <span className="text-sm text-gray-800 text-right">{formatCTC(c.expected_ctc_fixed, c.expected_ctc_variable)}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Notice Period</span>
                <span className="text-sm text-gray-800">{c.notice_period || '—'}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Last Working Day</span>
                <span className="text-sm text-gray-800">{c.last_working_day ? new Date(c.last_working_day).toLocaleDateString('en-IN') : '—'}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Holding Offer</span>
                <span className="text-sm text-gray-800">{c.holding_offer ? `Yes — ${c.holding_offer_details || ''}` : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Assessment */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Assessment Scores</h3>
            <div className="space-y-3">
              {[
                { label: 'Soft Skills', value: c.assessment_soft_skills, color: 'bg-blue-500' },
                { label: 'Stability', value: c.assessment_stability, color: 'bg-green-500' },
                { label: 'Technical', value: c.assessment_technical, color: 'bg-violet-500' },
                { label: 'Experience', value: c.assessment_experience, color: 'bg-orange-500' },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24">{label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className={clsx('h-full rounded-full transition-all', color)}
                      style={{ width: value ? `${value * 10}%` : '0%' }} />
                  </div>
                  <span className="text-sm font-bold text-gray-700 w-8 text-right">{value || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Referral */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Referral</h3>
            {c.referral_name ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-400 w-28">Name</span>
                  <span className="text-sm text-gray-800">{c.referral_name}</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-400 w-28">Phone</span>
                  <span className="text-sm text-gray-800">{c.referral_phone || '—'}</span>
                </div>
                <div className="flex items-start justify-between">
                  <span className="text-xs text-gray-400 w-28">Bonus Eligible</span>
                  <span className="text-sm text-gray-800">{c.referral_bonus_eligible ? 'Yes' : 'No'}</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No referral information</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="bg-white rounded-xl border border-gray-100">
          {pipeline.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">Not mapped to any positions yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {pipeline.map((p: any) => (
                <div key={p.id} className="p-4 flex items-center gap-4 hover:bg-gray-50/50 cursor-pointer"
                  onClick={() => router.push(`/requirements/${p.job_id}`)}>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{p.job_title}</p>
                    <p className="text-xs text-gray-400">{p.client_name} · {p.job_location}</p>
                  </div>
                  <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-600')}>
                    {p.status}
                  </span>
                  {p.ai_match_percent && (
                    <span className="text-xs font-medium text-violet-600">{p.ai_match_percent}% match</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="bg-white rounded-xl border border-gray-100">
          {history.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-400">No status changes yet</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {history.map((h: any) => (
                <div key={h.id} className="p-4 flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-fx-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-700">
                      <span className="font-medium">{h.changed_by_name}</span> changed status
                      {h.old_status && <> from <span className="font-medium">{h.old_status}</span></>}
                      {' '}to <span className="font-medium">{h.new_status}</span>
                    </p>
                    {h.job_title && <p className="text-[10px] text-gray-400">{h.job_title}</p>}
                  </div>
                  <span className="text-[10px] text-gray-400">{timeAgo(h.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'resume' && (
        <div className="bg-white rounded-xl border border-gray-100 p-5">
          {c.cv_text ? (
            <pre className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed font-sans max-h-[600px] overflow-y-auto">
              {c.cv_text}
            </pre>
          ) : (
            <div className="py-10 text-center">
              <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No resume text available</p>
              <p className="text-xs text-gray-300 mt-1">CV text is stored when uploaded via the AI parser</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/candidates/[id]/page.tsx"

# ========================
# FRONTEND: Update Requirements Detail with pipeline tabs + clickable candidates
# ========================
cat > "src/app/(dashboard)/requirements/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  ArrowLeft, Building2, MapPin, Clock, Users, Briefcase, Copy, ChevronDown,
  ExternalLink, Phone, Mail,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const PIPELINE_STATUSES = [
  'New','Screening','Submitted to Client','Client Review',
  'Interview Stage','HR Discussion','Offer','Joined','Not Joined','Account Manager Rejected'
];

const ACTIVE_STATUSES = ['Screening', 'Submitted to Client', 'Client Review', 'Interview Stage', 'HR Discussion', 'Offer'];
const SELECTED_STATUSES = ['Joined'];
const NOT_SELECTED_STATUSES = ['Not Joined', 'Account Manager Rejected'];

const STATUS_COLORS: Record<string, string> = {
  'New':'bg-gray-100 border-gray-200','Screening':'bg-blue-50 border-blue-200',
  'Submitted to Client':'bg-indigo-50 border-indigo-200','Client Review':'bg-purple-50 border-purple-200',
  'Interview Stage':'bg-orange-50 border-orange-200','HR Discussion':'bg-amber-50 border-amber-200',
  'Offer':'bg-emerald-50 border-emerald-200','Joined':'bg-green-50 border-green-200',
  'Not Joined':'bg-red-50 border-red-200','Account Manager Rejected':'bg-rose-50 border-rose-200',
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  'New':'text-gray-700','Screening':'text-blue-700','Submitted to Client':'text-indigo-700',
  'Client Review':'text-purple-700','Interview Stage':'text-orange-700','HR Discussion':'text-amber-700',
  'Offer':'text-emerald-700','Joined':'text-green-700','Not Joined':'text-red-700',
  'Account Manager Rejected':'text-rose-700',
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
  const [showJD, setShowJD] = useState(false);
  const [pipelineTab, setPipelineTab] = useState('active');

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API}/api/requirements/${params.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail();
    } catch (err) { console.error(err); }
  };

  const copyJD = () => {
    if (!requirement) return;
    const text = `${requirement.title}\nClient: ${requirement.client_name}\nLocation: ${requirement.location}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n\n${requirement.description || ''}\n\nSkills: ${requirement.skills || ''}`;
    navigator.clipboard.writeText(text);
  };

  const avgAssessment = (e: PipelineEntry) => {
    const s = [e.assessment_soft_skills, e.assessment_stability, e.assessment_technical, e.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>;

  if (!requirement) return (
    <div className="text-center py-20">
      <p className="text-gray-500">Requirement not found</p>
      <button onClick={() => router.back()} className="text-fx-600 text-sm mt-2 hover:underline">Go back</button>
    </div>
  );

  const priorityBg: Record<string, string> = { Critical: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-blue-400', Low: 'bg-green-400' };

  // Filter pipeline by tab
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
  const newCount = pipeline.filter(p => p.status === 'New').length;
  const activeCount = pipeline.filter(p => ACTIVE_STATUSES.includes(p.status)).length;
  const selectedCount = pipeline.filter(p => SELECTED_STATUSES.includes(p.status)).length;
  const notSelectedCount = pipeline.filter(p => NOT_SELECTED_STATUSES.includes(p.status)).length;

  const pipelineTabs = [
    { id: 'all', label: 'All', count: pipeline.length },
    { id: 'new', label: 'New', count: newCount },
    { id: 'active', label: 'In Stage', count: activeCount },
    { id: 'selected', label: 'Selected', count: selectedCount },
    { id: 'not_selected', label: 'Not Selected', count: notSelectedCount },
  ];

  // Candidate card component
  const CandidateCard = ({ entry }: { entry: PipelineEntry }) => (
    <div className="bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all overflow-hidden">
      <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => router.push(`/candidates/${entry.candidate_id}`)}>
        <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-xs font-semibold shrink-0">
          {entry.candidate_name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900 truncate hover:text-fx-700 transition-colors">
              {entry.candidate_name}
            </p>
            <span className={clsx('px-1.5 py-0.5 rounded text-[10px] font-medium', STATUS_COLORS[entry.status]?.replace('border-', 'border '), STATUS_TEXT_COLORS[entry.status])}>
              {entry.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5">
            {entry.candidate_current_role && <span>{entry.candidate_current_role}</span>}
            {entry.candidate_company && <span>@ {entry.candidate_company}</span>}
            {entry.experience_years && <span>{entry.experience_years}y exp</span>}
            {entry.candidate_location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{entry.candidate_location}</span>}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {entry.ai_match_percent && (
            <div className="text-center">
              <div className="flex items-center gap-1.5">
                <div className="w-12 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={clsx('h-full rounded-full', entry.ai_match_percent >= 70 ? 'bg-emerald-500' : entry.ai_match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                    style={{ width: `${entry.ai_match_percent}%` }} />
                </div>
                <span className="text-xs font-bold text-gray-600">{entry.ai_match_percent}%</span>
              </div>
              <p className="text-[9px] text-gray-400">AI Match</p>
            </div>
          )}
          {avgAssessment(entry) && (
            <div className="text-center">
              <p className="text-sm font-bold text-gray-700">{avgAssessment(entry)}</p>
              <p className="text-[9px] text-gray-400">Score</p>
            </div>
          )}
          <p className="text-[10px] text-gray-300">{entry.owner_name}</p>
        </div>
      </div>
      {/* Quick info + status change */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-gray-50 pt-2">
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          {entry.candidate_email && <span className="flex items-center gap-0.5"><Mail className="w-3 h-3" />{entry.candidate_email}</span>}
          {entry.candidate_phone && <span className="flex items-center gap-0.5"><Phone className="w-3 h-3" />{entry.candidate_phone}</span>}
        </div>
        <select value={entry.status}
          onChange={(e) => { e.stopPropagation(); changeStatus(entry.id, e.target.value); }}
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600 cursor-pointer">
          {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/requirements')}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
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
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyJD} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
            <Copy className="w-3 h-3" /> Copy JD
          </button>
          <button onClick={() => setShowJD(!showJD)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50">
            <ChevronDown className={clsx('w-3 h-3 transition-transform', showJD && 'rotate-180')} /> Details
          </button>
        </div>
      </div>

      {/* Expandable details */}
      {showJD && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">CTC Range</p>
              <p className="font-medium text-gray-800">{requirement.ctc_min || 0} - {requirement.ctc_max || 0} LPA</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Positions</p>
              <p className="font-medium text-gray-800">{requirement.positions_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Deadline</p>
              <p className="font-medium text-gray-800">{requirement.deadline ? new Date(requirement.deadline).toLocaleDateString('en-IN') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Client SPOC</p>
              <p className="font-medium text-gray-800">{requirement.client_spoc || '—'}</p>
            </div>
          </div>
          {requirement.skills && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {requirement.skills.split(',').map((skill: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 bg-fx-50 text-fx-700 rounded-md text-xs font-medium">{skill.trim()}</span>
                ))}
              </div>
            </div>
          )}
          {requirement.description && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Job Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{requirement.description}</p>
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

      {/* Pipeline section with tabs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Candidates ({pipeline.length})</h2>
        </div>

        {/* Pipeline tabs */}
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

        {/* Candidate list */}
        {filteredPipeline.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No candidates in this category</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredPipeline.map((entry) => (
              <CandidateCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/requirements/[id]/page.tsx (with tabs + clickable candidates)"

# ========================
# FRONTEND: Update Pipeline page — clickable candidate names
# ========================
cat > "src/app/(dashboard)/pipeline/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import { Kanban, Search, MapPin } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STATUSES = ['New','Screening','Submitted to Client','Client Review','Interview Stage','HR Discussion','Offer','Joined','Not Joined','Account Manager Rejected'];
const SHORT_LABELS: Record<string, string> = {
  'New':'New','Screening':'Screening','Submitted to Client':'Submitted','Client Review':'Client Review',
  'Interview Stage':'Interview','HR Discussion':'HR','Offer':'Offer','Joined':'Joined','Not Joined':'Not Joined','Account Manager Rejected':'AM Rejected'
};
const COL_COLORS: Record<string, string> = {
  'New':'border-t-gray-400','Screening':'border-t-blue-400','Submitted to Client':'border-t-indigo-400',
  'Client Review':'border-t-purple-400','Interview Stage':'border-t-orange-400','HR Discussion':'border-t-amber-400',
  'Offer':'border-t-emerald-400','Joined':'border-t-green-500','Not Joined':'border-t-red-400','Account Manager Rejected':'border-t-rose-500'
};

interface PipelineEntry {
  id: string; candidate_id: string; status: string; candidate_name: string; candidate_location: string;
  experience_years: number; candidate_role: string; current_company: string;
  job_title: string; client_name: string; ai_match_percent: number; owner_name: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
}

export default function PipelinePage() {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ownerFilter === 'mine') params.set('owner', 'mine');
      const res = await fetch(`${API}/api/pipeline?${params}`, { headers: headers() });
      const data = await res.json();
      setPipeline(data.pipeline || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, ownerFilter]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const changeStatus = async (id: string, status: string) => {
    try {
      await fetch(`${API}/api/pipeline/${id}/status`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ status }),
      });
      fetchPipeline();
    } catch (err) { console.error(err); }
  };

  const avgScore = (e: PipelineEntry) => {
    const s = [e.assessment_soft_skills, e.assessment_stability, e.assessment_technical, e.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a,b) => a+b, 0) / s.length).toFixed(1) : null;
  };

  const columns = STATUSES.map(s => ({ status: s, entries: pipeline.filter(p => p.status === s) }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{pipeline.length} candidate{pipeline.length !== 1 ? 's' : ''} in pipeline</p>
        <button onClick={() => setOwnerFilter(ownerFilter === 'mine' ? 'all' : 'mine')}
          className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            ownerFilter === 'mine' ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200')}>
          {ownerFilter === 'mine' ? 'My Pipeline' : 'All Pipeline'}
        </button>
      </div>
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search candidate, job, client..."
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : pipeline.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Kanban className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Pipeline is empty</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map(({ status, entries }) => (
            <div key={status} className="min-w-[220px] w-[220px] shrink-0">
              <div className={clsx('bg-white rounded-t-lg px-3 py-2 border border-b-0 border-gray-100 border-t-[3px]', COL_COLORS[status])}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">{SHORT_LABELS[status]}</span>
                  <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500 font-medium">{entries.length}</span>
                </div>
              </div>
              <div className="bg-gray-50/50 rounded-b-lg border border-t-0 border-gray-100 p-2 space-y-2 min-h-[120px]">
                {entries.map((e) => (
                  <div key={e.id} className="bg-white rounded-lg border border-gray-100 p-3 hover:shadow-sm transition-shadow">
                    <p className="text-xs font-semibold text-gray-900 truncate cursor-pointer hover:text-fx-700 transition-colors"
                      onClick={() => router.push(`/candidates/${e.candidate_id}`)}>
                      {e.candidate_name}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{e.job_title} · {e.client_name}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                      {e.experience_years && <span>{e.experience_years}y</span>}
                      {e.candidate_location && <span>{e.candidate_location}</span>}
                    </div>
                    {e.ai_match_percent && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full', e.ai_match_percent >= 70 ? 'bg-emerald-500' : e.ai_match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                            style={{ width: `${e.ai_match_percent}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-gray-500">{e.ai_match_percent}%</span>
                      </div>
                    )}
                    {avgScore(e) && <p className="text-[10px] text-gray-400 mt-1">Score: {avgScore(e)}/10</p>}
                    <p className="text-[10px] text-gray-300 mt-1">{e.owner_name}</p>
                    <select value={e.status} onChange={(ev) => changeStatus(e.id, ev.target.value)}
                      className="mt-2 w-full text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/pipeline/page.tsx (clickable candidates)"

echo ""
echo "=========================================="
echo "🎉 Phase 5b setup complete!"
echo "=========================================="
echo ""
echo "What changed:"
echo "  ✓ /candidates/:id — Full candidate detail page with 4 tabs:"
echo "    - Full Details (professional, CTC, assessment scores, referral)"
echo "    - Pipeline (all mapped positions with status)"
echo "    - History (audit trail of status changes)"
echo "    - Resume Text (full extracted CV text)"
echo "  ✓ /requirements/:id — Pipeline now has tabs:"
echo "    - All / New / In Stage / Selected / Not Selected"
echo "    - Clicking candidate name opens full detail page"
echo "  ✓ Pipeline Kanban — candidate names are clickable"
echo ""
echo "No backend restart needed — just refresh the frontend."
echo "Deploy: git add . && git commit -m 'Phase 5b: Candidate details + pipeline tabs' && git push"
echo ""
