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
  'Interview Stage','HR Discussion','Offer','Joined','Not Joined','Account Manager Rejected','Interview Reject'
];

const ACTIVE_STATUSES = ['Screening', 'Submitted to Client', 'Client Review', 'Interview Stage', 'HR Discussion', 'Offer'];
const SELECTED_STATUSES = ['Joined'];
const NOT_SELECTED_STATUSES = ['Not Joined', 'Account Manager Rejected', 'Interview Reject'];

const STATUS_COLORS: Record<string, string> = {
  'New':'bg-gray-100 border-gray-200','Screening':'bg-blue-50 border-blue-200',
  'Submitted to Client':'bg-indigo-50 border-indigo-200','Client Review':'bg-purple-50 border-purple-200',
  'Interview Stage':'bg-orange-50 border-orange-200','HR Discussion':'bg-amber-50 border-amber-200',
  'Offer':'bg-emerald-50 border-emerald-200','Joined':'bg-green-50 border-green-200',
  'Not Joined':'bg-red-50 border-red-200','Account Manager Rejected':'bg-rose-50 border-rose-200','Interview Reject':'bg-pink-50 border-pink-200',
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
