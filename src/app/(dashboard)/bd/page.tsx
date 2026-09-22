'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  Target, Plus, X, TrendingUp, Trophy, Percent, IndianRupee,
  AlertCircle, Trash2, Loader2,
} from 'lucide-react';
import clsx from 'clsx';

interface Opp {
  id: number;
  client_id: number;
  title: string;
  stage: string;
  value: number;
  owner_id: number | null;
  owner_name: string | null;
  owner_color: string | null;
  client_name: string | null;
  client_tier: string | null;
  client_vertical: string | null;
  idle_days: number;
  expected_close: string | null;
  source: string | null;
}
interface Overview {
  openValue: number; weighted: number; openCount: number;
  wonCount: number; wonValue: number; winRate: number; placedRevenue: number;
  stages: { stage: string; count: number; value: number }[];
}
interface Client { id: number; name: string; tier?: string; }
interface TeamMember { id: number; name: string; role: string; }

const BOARD_STAGES = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation', 'Won'];
const MOVE_STAGES = [...BOARD_STAGES, 'Lost'];
const STAGE_DOT: Record<string, string> = {
  Prospecting: 'bg-gray-400', Qualified: 'bg-fx-500', Proposal: 'bg-violet-500',
  Negotiation: 'bg-amber-500', Won: 'bg-emerald-500', Lost: 'bg-red-400',
};

function fmtINR(rupees: number): string {
  const r = Number(rupees) || 0;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
}
const initialsOf = (name?: string | null) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const emptyForm = {
  client_id: '', title: '', stage: 'Prospecting', valueL: '', owner_id: '', expected_close: '',
};

export default function BDPipelinePage() {
  const { user, isRole } = useAuth();
  const canManage = isRole('Super Admin', 'Account Manager');

  const [opps, setOpps] = useState<Opp[]>([]);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'week' | 'month' | 'quarter'>('month');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [movingId, setMovingId] = useState<number | null>(null);

  const fetchBoard = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (search) p.set('search', search);
      const [oppData, ovData] = await Promise.all([
        api.bd.opportunities.list(p.toString()),
        api.bd.overview(`period=${period}`),
      ]);
      setOpps(oppData.opportunities || []);
      setOverview(ovData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, period]);

  const fetchMeta = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.clients.list(''), api.team.list()]);
      setClients(c.clients || []);
      setTeam((t.team || []).filter((m: TeamMember & { is_active?: boolean }) => m.is_active !== false));
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchBoard(); }, [fetchBoard]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const moveStage = async (opp: Opp, stage: string) => {
    if (stage === opp.stage) return;
    setMovingId(opp.id);
    setOpps((prev) => prev.map((o) => (o.id === opp.id ? { ...o, stage } : o))); // optimistic
    try {
      await api.bd.opportunities.updateStage(String(opp.id), stage);
      await fetchBoard();
    } catch (err) { console.error(err); await fetchBoard(); }
    finally { setMovingId(null); }
  };

  const removeOpp = async (id: number) => {
    if (!confirm('Delete this opportunity? This cannot be undone.')) return;
    try { await api.bd.opportunities.remove(String(id)); await fetchBoard(); }
    catch (err) { console.error(err); }
  };

  const openAdd = () => {
    setForm({ ...emptyForm, owner_id: user?.id ? String(user.id) : '' });
    setError('');
    setShowModal(true);
  };

  const saveOpp = async () => {
    if (!form.client_id || !form.title.trim()) { setError('Client and title are required.'); return; }
    setSaving(true); setError('');
    try {
      await api.bd.opportunities.create({
        client_id: Number(form.client_id),
        title: form.title.trim(),
        stage: form.stage,
        value: form.valueL ? Math.round(parseFloat(form.valueL) * 1e5) : 0,
        owner_id: form.owner_id ? Number(form.owner_id) : undefined,
        expected_close: form.expected_close || undefined,
      });
      setShowModal(false);
      await fetchBoard();
    } catch (err: any) { setError(err.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const byStage = (s: string) => opps.filter((o) => o.stage === s);
  const colValue = (s: string) => byStage(s).reduce((a, o) => a + (Number(o.value) || 0), 0);

  const kpis = [
    { label: 'Open pipeline', value: overview ? fmtINR(overview.openValue) : '—', icon: TrendingUp, tint: 'bg-fx-50 text-fx-600' },
    { label: 'Weighted forecast', value: overview ? fmtINR(overview.weighted) : '—', icon: IndianRupee, tint: 'bg-emerald-50 text-emerald-600' },
    { label: `Won · this ${period}`, value: overview ? String(overview.wonCount) : '—', icon: Trophy, tint: 'bg-violet-50 text-violet-600' },
    { label: 'Win rate', value: overview ? `${overview.winRate}%` : '—', icon: Percent, tint: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Target className="w-5 h-5 text-fx-600" /> BD Pipeline
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Opportunities to win and grow client accounts — synced with the whole team.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {(['week', 'month', 'quarter'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={clsx('px-3 py-1.5 text-xs font-medium rounded-md capitalize',
                  period === p ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                {p}
              </button>
            ))}
          </div>
          <button onClick={openAdd}
            className="flex items-center gap-1.5 bg-fx-600 hover:bg-fx-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg transition-colors">
            <Plus className="w-4 h-4" /> New opportunity
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">{k.label}</span>
              <span className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', k.tint)}>
                <k.icon className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl font-semibold text-gray-900 mt-2">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search opportunities or clients…"
          className="w-full sm:w-72 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fx-500/30 focus:border-fx-500"
        />
        {overview && (
          <span className="text-xs text-gray-400 ml-auto hidden sm:block">
            {overview.openCount} open · {fmtINR(overview.placedRevenue)} placed revenue this {period}
          </span>
        )}
      </div>

      {/* Board */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_STAGES.map((stage) => {
            const items = byStage(stage);
            return (
              <div key={stage} className="flex-1 min-w-[240px]">
                <div className="flex items-center justify-between px-1 mb-2.5">
                  <div className="flex items-center gap-2">
                    <span className={clsx('w-2 h-2 rounded-full', STAGE_DOT[stage])} />
                    <span className="text-sm font-semibold text-gray-800">{stage}</span>
                    <span className="text-xs text-gray-400">{items.length}</span>
                  </div>
                  <span className="text-xs font-medium text-gray-500">{fmtINR(colValue(stage))}</span>
                </div>

                <div className="space-y-2.5">
                  {stage === 'Prospecting' && (
                    <button onClick={openAdd}
                      className="w-full text-xs text-gray-400 border border-dashed border-gray-300 rounded-xl py-2 hover:border-fx-400 hover:text-fx-600 transition-colors">
                      + Add opportunity
                    </button>
                  )}
                  {items.map((o) => {
                    const idle = o.idle_days > 7 && stage !== 'Won';
                    const won = stage === 'Won';
                    return (
                      <div key={o.id}
                        className={clsx('relative bg-white border rounded-xl p-3 shadow-sm',
                          won ? 'border-emerald-200 bg-emerald-50/40' : 'border-gray-200',
                          idle && 'border-amber-300')}>
                        {idle && <span className="absolute top-3 right-3 w-1.5 h-1.5 rounded-full bg-red-500" title={`${o.idle_days} days no movement`} />}
                        <p className="text-sm font-semibold text-gray-900 pr-3 leading-snug">{o.title}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[11px] font-medium text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
                            {o.client_name || 'Unlinked'}
                          </span>
                          {o.client_tier && <span className="text-[11px] text-gray-400">{o.client_tier}</span>}
                        </div>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-sm font-bold text-gray-900">{fmtINR(o.value)}</span>
                          {idle
                            ? <span className="text-[11px] font-semibold text-red-500">{o.idle_days}d idle</span>
                            : (
                              <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
                                style={{ backgroundColor: o.owner_color || '#4c6ef5' }}
                                title={o.owner_name || 'Unassigned'}>
                                {initialsOf(o.owner_name)}
                              </span>
                            )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-2.5">
                          <select
                            value={o.stage}
                            disabled={movingId === o.id}
                            onChange={(e) => moveStage(o, e.target.value)}
                            className="flex-1 text-[11px] font-medium text-gray-600 border border-gray-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:border-fx-500 disabled:opacity-50">
                            {MOVE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                          {canManage && (
                            <button onClick={() => removeOpp(o.id)}
                              className="w-7 h-7 rounded-md border border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-200 flex items-center justify-center shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {items.length === 0 && stage !== 'Prospecting' && (
                    <p className="text-xs text-gray-300 text-center py-6">No opportunities</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New opportunity modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="text-lg font-semibold text-gray-900">New opportunity</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 pb-5 space-y-3.5">
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}
              <Field label="Account (client)">
                <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={inputCls}>
                  <option value="">Select a client…</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Opportunity / mandate">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Core banking engineering pod — 8 roles" className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stage">
                  <select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })} className={inputCls}>
                    {BOARD_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Est. value (₹ L)">
                  <input type="number" value={form.valueL} onChange={(e) => setForm({ ...form, valueL: e.target.value })}
                    placeholder="40" className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Owner">
                  <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className={inputCls}>
                    <option value="">Unassigned</option>
                    {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Expected close">
                  <input type="date" value={form.expected_close} onChange={(e) => setForm({ ...form, expected_close: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={saveOpp} disabled={saving}
                  className="px-4 py-2 text-sm font-medium text-white bg-fx-600 hover:bg-fx-700 rounded-lg flex items-center gap-2 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save opportunity
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fx-500/30 focus:border-fx-500';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 mb-1 block">{label}</span>
      {children}
    </label>
  );
}
