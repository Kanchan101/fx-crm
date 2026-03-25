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
