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
  'Not Joined': 'bg-red-100 text-red-700', 'Account Manager Rejected': 'bg-rose-100 text-rose-700', 'Interview Reject': 'bg-pink-100 text-pink-700',
};

export default function CandidateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [candidate, setCandidate] = useState<any>(null);
  const [pipeline, setPipeline] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
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

  const startEdit = () => { setEditForm({...candidate}); setIsEditing(true); };
  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/candidates/${params.id}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) { setIsEditing(false); fetchCandidate(); }
      else { const d = await res.json(); alert(d.error || 'Save failed'); }
    } catch(err) { console.error(err); }
    finally { setSaving(false); }
  };

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
              <h1 className="text-xl font-bold text-gray-900">{c.name}</h1><div className="flex gap-2 mt-1">{!isEditing ? (<button onClick={startEdit} className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Edit Profile</button>) : (<><button onClick={saveEdit} disabled={saving} className="px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">{saving ? "Saving..." : "Save"}</button><button onClick={() => setIsEditing(false)} className="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium">Cancel</button></>)}</div>
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
