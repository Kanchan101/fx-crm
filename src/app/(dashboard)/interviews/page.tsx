'use client';

import { useState, useEffect, useCallback } from 'react';
import { getToken } from '@/lib/api';
import { Calendar, Plus, X, Video, MapPin, Clock, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Interview {
  id: string; candidate_name: string; candidate_phone: string; candidate_email: string;
  job_title: string; client_name: string; interview_date: string; interview_time: string;
  type: string; mode: string; interviewer_name: string; meeting_link: string;
  notes: string; outcome: string; scheduled_by_name: string;
}

const OUTCOMES = ['Scheduled','Completed','Cancelled','No Show','Passed','Failed'];

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split('T')[0];
  });

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const start = new Date(weekStart);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const params = new URLSearchParams({ date_from: weekStart, date_to: end.toISOString().split('T')[0] });
      const res = await fetch(`${API}/api/interviews?${params}`, { headers: headers() });
      const data = await res.json();
      setInterviews(data.interviews || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [weekStart]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const changeWeek = (dir: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + (dir * 7));
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const updateOutcome = async (id: string, outcome: string) => {
    try {
      await fetch(`${API}/api/interviews/${id}`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ outcome }),
      });
      fetchInterviews();
    } catch (err) { console.error(err); }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return { date: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }), isToday: d.toDateString() === new Date().toDateString() };
  });

  const outcomeColor = (o: string) => {
    const m: Record<string, string> = { Scheduled: 'bg-blue-100 text-blue-700', Completed: 'bg-gray-100 text-gray-600', Passed: 'bg-emerald-100 text-emerald-700', Failed: 'bg-red-100 text-red-700', Cancelled: 'bg-yellow-100 text-yellow-700', 'No Show': 'bg-orange-100 text-orange-700' };
    return m[o] || 'bg-gray-100 text-gray-600';
  };

  const weekLabel = () => {
    const s = new Date(weekStart);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{interviews.length} interview{interviews.length !== 1 ? 's' : ''} this week</p>
        <div className="flex items-center gap-2">
          <button onClick={() => changeWeek(-1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">{weekLabel()}</span>
          <button onClick={() => changeWeek(1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map(({ date, label, isToday }) => {
            const dayInterviews = interviews.filter(i => i.interview_date?.split('T')[0] === date);
            return (
              <div key={date} className={clsx('rounded-xl border min-h-[200px]', isToday ? 'border-fx-300 bg-fx-50/30' : 'border-gray-100 bg-white')}>
                <div className={clsx('px-3 py-2 border-b text-center', isToday ? 'border-fx-200 bg-fx-50' : 'border-gray-50')}>
                  <p className={clsx('text-xs font-medium', isToday ? 'text-fx-700' : 'text-gray-500')}>{label}</p>
                </div>
                <div className="p-2 space-y-2">
                  {dayInterviews.map((iv) => (
                    <div key={iv.id} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                      <p className="font-semibold text-gray-900 truncate">{iv.candidate_name}</p>
                      <p className="text-gray-400 truncate">{iv.job_title} · {iv.client_name}</p>
                      {iv.interview_time && (
                        <p className="text-gray-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{iv.interview_time.substring(0, 5)}
                        </p>
                      )}
                      {iv.mode && (
                        <p className="text-gray-400 mt-0.5 flex items-center gap-1">
                          {iv.mode === 'Google Meet' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}{iv.mode}
                        </p>
                      )}
                      <div className="mt-1.5">
                        <select value={iv.outcome || 'Scheduled'} onChange={(e) => updateOutcome(iv.id, e.target.value)}
                          className={clsx('w-full text-[10px] px-1.5 py-0.5 rounded font-medium border-0', outcomeColor(iv.outcome))}>
                          {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {dayInterviews.length === 0 && (
                    <p className="text-[10px] text-gray-300 text-center py-6">No interviews</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
