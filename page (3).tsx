'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  TrendingUp, Trophy, Percent, IndianRupee, Loader2, ArrowRight,
  AlertTriangle, CheckCircle2, Circle, Sparkles,
} from 'lucide-react';
import clsx from 'clsx';

interface Opp {
  id: string; title: string; client_name: string | null; is_prospect: boolean;
  value: number; stage: string; idle_days: number; owner_name: string | null;
}
interface Task {
  id: string; title: string; client_name: string | null; owner_name: string | null;
  due_date: string | null; done: boolean;
}
interface Overview {
  openValue: number; weighted: number; openCount: number;
  wonCount: number; wonValue: number; winRate: number; placedRevenue: number;
  stages: { stage: string; count: number; value: number }[];
  topOpportunities: Opp[]; tasksDue: Task[];
}

const FUNNEL = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
const STAGE_BAR: Record<string, string> = {
  Prospecting: '#9ca3af', Qualified: '#4c6ef5', Proposal: '#8b5cf6', Negotiation: '#f59e0b', Won: '#10b981',
};
const STAGE_PILL: Record<string, string> = {
  Prospecting: 'bg-gray-100 text-gray-600', Qualified: 'bg-fx-50 text-fx-600',
  Proposal: 'bg-violet-50 text-violet-600', Negotiation: 'bg-amber-50 text-amber-700', Won: 'bg-emerald-50 text-emerald-600',
};

function fmtINR(rupees: number): string {
  const r = Number(rupees) || 0;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
}
function dueLabel(d: string | null): { text: string; cls: string } {
  if (!d) return { text: 'No date', cls: 'text-gray-400' };
  const due = new Date(d); due.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff < 0) return { text: 'Overdue', cls: 'text-red-500 font-semibold' };
  if (diff === 0) return { text: 'Today', cls: 'text-fx-600 font-semibold' };
  if (diff === 1) return { text: 'Tomorrow', cls: 'text-gray-500' };
  return { text: due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), cls: 'text-gray-500' };
}

export default function BDDashboardPage() {
  const router = useRouter();
  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');

  const load = useCallback(async () => {
    try { setOv(await api.bd.overview(`period=${period}`)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  const toggleTask = async (id: string) => {
    setOv((prev) => prev ? { ...prev, tasksDue: prev.tasksDue.map((t) => t.id === id ? { ...t, done: !t.done } : t) } : prev);
    try { await api.bd.tasks.toggle(id); await load(); } catch (e) { await load(); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }

  const stageVal = (s: string) => ov?.stages.find((x) => x.stage === s)?.value || 0;
  const stageCnt = (s: string) => ov?.stages.find((x) => x.stage === s)?.count || 0;
  const maxStage = Math.max(1, ...FUNNEL.map(stageVal));
  const attention = (ov?.topOpportunities || []).filter((o) => o.idle_days > 7).sort((a, b) => b.idle_days - a.idle_days)[0];

  const kpis = [
    { label: 'Open pipeline', value: fmtINR(ov?.openValue || 0), sub: `${ov?.openCount || 0} open`, icon: TrendingUp, tint: 'bg-fx-50 text-fx-600' },
    { label: 'Weighted forecast', value: fmtINR(ov?.weighted || 0), sub: 'probability-adjusted', icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600' },
    { label: `Won · this ${period}`, value: String(ov?.wonCount || 0), sub: fmtINR(ov?.wonValue || 0), icon: Trophy, tint: 'bg-violet-50 text-violet-600' },
    { label: 'Win rate', value: `${ov?.winRate || 0}%`, sub: `this ${period}`, icon: Percent, tint: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['week', 'month', 'quarter'] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={clsx('px-3 py-1.5 text-xs font-medium rounded-md capitalize',
                period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{k.label}</span>
              <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', k.tint)}><k.icon className="w-4 h-4" /></span>
            </div>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{k.value}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: pipeline by stage + top opportunities */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Pipeline by stage</h3>
              <button onClick={() => router.push('/bd/pipeline')} className="text-xs font-medium text-fx-600 hover:text-fx-700 flex items-center gap-1">
                Open board <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              {FUNNEL.map((s) => (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-xs text-gray-600">{s}</span>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden">
                    <div className="h-full rounded-lg flex items-center px-2" style={{ width: `${Math.max(6, (stageVal(s) / maxStage) * 100)}%`, backgroundColor: STAGE_BAR[s] }}>
                      <span className="text-[11px] font-semibold text-white whitespace-nowrap">{fmtINR(stageVal(s))}</span>
                    </div>
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs text-gray-400">{stageCnt(s)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Top open opportunities</h3>
            <p className="text-xs text-gray-400 mb-3">Largest deals still in play</p>
            {(ov?.topOpportunities || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No open opportunities yet. Add one on the Pipeline tab.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {ov!.topOpportunities.map((o) => (
                  <div key={o.id} onClick={() => router.push('/bd/pipeline')}
                    className="flex items-center gap-3 py-2.5 cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{o.title}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs text-gray-500 truncate">{o.client_name || 'Unlinked'}</span>
                        {o.is_prospect && <span className="text-[10px] font-medium text-amber-700 bg-amber-50 rounded px-1 py-0.5">Prospect</span>}
                      </div>
                    </div>
                    <span className={clsx('text-[11px] font-medium rounded px-2 py-0.5 shrink-0', STAGE_PILL[o.stage] || 'bg-gray-100 text-gray-600')}>{o.stage}</span>
                    <span className="text-sm font-bold text-gray-900 w-20 text-right shrink-0">{fmtINR(o.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: needs attention + tasks */}
        <div className="space-y-4">
          {attention ? (
            <div className="rounded-xl p-5 bg-fx-950 text-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center"><AlertTriangle className="w-3.5 h-3.5 text-amber-300" /></span>
                <span className="text-sm font-semibold">Needs attention</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">
                <span className="text-white font-semibold">{attention.client_name || attention.title}</span> has had no movement in{' '}
                <span className="text-white font-semibold">{attention.idle_days} days</span> — {attention.title} ({fmtINR(attention.value)}). Give it a nudge before it goes cold.
              </p>
              <button onClick={() => router.push('/bd/pipeline')} className="mt-3 bg-fx-600 hover:bg-fx-700 text-white text-xs font-medium px-3 py-2 rounded-lg">Open board</button>
            </div>
          ) : (
            <div className="rounded-xl p-5 bg-fx-950 text-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center"><Sparkles className="w-3.5 h-3.5 text-fx-300" /></span>
                <span className="text-sm font-semibold">On track</span>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">No stalled opportunities right now — everything in the pipeline has moved recently. Keep the momentum going.</p>
            </div>
          )}

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Priority tasks</h3>
              <button onClick={() => router.push('/bd/pipeline')} className="text-xs font-medium text-fx-600 hover:text-fx-700">View board</button>
            </div>
            {(ov?.tasksDue || []).length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">Nothing due right now.</p>
            ) : (
              <div className="space-y-1">
                {ov!.tasksDue.map((t) => {
                  const dl = dueLabel(t.due_date);
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 py-2">
                      <button onClick={() => toggleTask(t.id)} className="shrink-0 text-gray-300 hover:text-fx-600">
                        {t.done ? <CheckCircle2 className="w-[18px] h-[18px] text-fx-600" /> : <Circle className="w-[18px] h-[18px]" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={clsx('text-sm truncate', t.done ? 'line-through text-gray-400' : 'text-gray-800 font-medium')}>{t.title}</p>
                        {t.client_name && <p className="text-[11px] text-gray-400 truncate">{t.client_name}</p>}
                      </div>
                      <span className={clsx('text-[11px] shrink-0', dl.cls)}>{dl.text}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Placed revenue</h3>
            <p className="text-[11px] text-gray-400 mb-2">Actual fees from joins · this {period}</p>
            <p className="text-2xl font-semibold text-gray-900">{fmtINR(ov?.placedRevenue || 0)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
