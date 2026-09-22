'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Sparkles, Loader2, Trash2, Target, Lightbulb, Award, Briefcase,
  Users, Send, ShieldQuestion, Flag, Plus, Check, ChevronRight, AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';

interface PlaybookRow {
  id: string; target_name: string; sector: string | null; created_at: string;
  created_by_name?: string; playbook?: any;
}
interface ListItem { id: string; target_name: string; sector: string | null; created_at: string; created_by_name: string | null; }

const arr = (x: any): any[] => Array.isArray(x) ? x : [];

export default function BDStrategyPage() {
  const [form, setForm] = useState({ target_name: '', sector: '', notes: '' });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [current, setCurrent] = useState<PlaybookRow | null>(null);
  const [saved, setSaved] = useState<ListItem[]>([]);
  const [added, setAdded] = useState<Record<string, boolean>>({});

  const loadList = useCallback(async () => {
    try { const d = await api.bd.playbooks.list(); setSaved(d.playbooks || []); } catch (e) { /* ignore */ }
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const generate = async () => {
    if (!form.target_name.trim()) { setError('Enter a target company.'); return; }
    setGenerating(true); setError(''); setCurrent(null); setAdded({});
    try {
      const d = await api.bd.strategy({ target_name: form.target_name.trim(), sector: form.sector.trim() || undefined, notes: form.notes.trim() || undefined });
      setCurrent(d.playbook);
      await loadList();
    } catch (e: any) { setError(e.message || 'Could not generate the playbook.'); }
    finally { setGenerating(false); }
  };

  const openSaved = async (id: string) => {
    setError(''); setAdded({});
    try { const d = await api.bd.playbooks.get(id); setCurrent(d.playbook); } catch (e) { console.error(e); }
  };

  const deleteSaved = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this playbook?')) return;
    try { await api.bd.playbooks.remove(id); if (current?.id === id) setCurrent(null); await loadList(); } catch (err) { console.error(err); }
  };

  const addToPipeline = async (title: string, key: string) => {
    if (!current) return;
    try {
      await api.bd.opportunities.create({ prospect_name: current.target_name, title, stage: 'Prospecting' });
      setAdded((p) => ({ ...p, [key]: true }));
    } catch (e) { console.error(e); }
  };

  const pb = current?.playbook || {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Left: input + saved */}
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-fx-600" /> Build a playbook</h3>
          <p className="text-xs text-gray-500 mb-3">Name a company you want to win. Claude uses your real clients and roles to write the strategy.</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Target company</label>
              <input value={form.target_name} onChange={(e) => setForm({ ...form, target_name: e.target.value })}
                placeholder="e.g. Flipkart" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Sector <span className="text-gray-400">(optional)</span></label>
              <input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })}
                placeholder="e.g. E-commerce" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Context <span className="text-gray-400">(optional)</span></label>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2}
                placeholder="Anything you already know…" className={inputCls} />
            </div>
            {error && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
            <button onClick={generate} disabled={generating}
              className="w-full bg-fx-600 hover:bg-fx-700 text-white text-sm font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 disabled:opacity-60">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Building…</> : <><Sparkles className="w-4 h-4" /> Generate playbook</>}
            </button>
          </div>
        </div>

        {saved.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Saved playbooks</h3>
            <div className="space-y-1">
              {saved.map((s) => (
                <div key={s.id} onClick={() => openSaved(s.id)}
                  className={clsx('flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer hover:bg-gray-50', current?.id === s.id && 'bg-fx-50')}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.target_name}</p>
                    <p className="text-[11px] text-gray-400 truncate">{s.sector || '—'} · {new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <button onClick={(e) => deleteSaved(s.id, e)} className="w-7 h-7 rounded-md text-gray-300 hover:text-red-500 flex items-center justify-center shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right: rendered playbook */}
      <div className="lg:col-span-2">
        {generating ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="w-12 h-12 rounded-2xl bg-fx-50 flex items-center justify-center mb-4"><Loader2 className="w-6 h-6 text-fx-600 animate-spin" /></div>
            <p className="text-sm font-medium text-gray-900">Claude is building your playbook…</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">Reviewing your clients and the roles you recruit to craft a grounded strategy. This takes about 15 seconds.</p>
          </div>
        ) : !current ? (
          <div className="bg-white border border-gray-200 rounded-xl p-10 flex flex-col items-center justify-center text-center min-h-[400px]">
            <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Target className="w-6 h-6 text-gray-400" /></div>
            <p className="text-sm font-medium text-gray-900">No playbook open</p>
            <p className="text-xs text-gray-500 mt-1 max-w-xs">Enter a target company on the left and generate a strategy, or open a saved one.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Header */}
            <div className="rounded-xl p-5 bg-fx-950 text-white">
              <div className="flex items-center gap-2 text-fx-300 text-xs font-medium"><Sparkles className="w-3.5 h-3.5" /> AI PLAYBOOK</div>
              <h2 className="text-2xl font-semibold mt-1">{current.target_name}</h2>
              {(pb.sector || current.sector) && <p className="text-sm text-gray-300 mt-0.5">{pb.sector || current.sector}</p>}
            </div>

            {pb.hypothesis && <Section icon={Lightbulb} title="Why now"><p className="text-sm text-gray-700 leading-relaxed">{pb.hypothesis}</p></Section>}
            {pb.positioning && <Section icon={Target} title="Our positioning"><p className="text-sm text-gray-700 leading-relaxed">{pb.positioning}</p></Section>}

            {arr(pb.proof_points).length > 0 && (
              <Section icon={Award} title="Proof points — comparable clients">
                <div className="space-y-2">
                  {arr(pb.proof_points).map((p, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="text-xs font-semibold text-fx-700 bg-fx-50 rounded px-2 py-1 shrink-0">{p.client}</span>
                      <p className="text-sm text-gray-600">{p.relevance}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {arr(pb.roles_to_target).length > 0 && (
              <Section icon={Briefcase} title="Roles to target">
                <div className="flex flex-wrap gap-2">
                  {arr(pb.roles_to_target).map((r, i) => <span key={i} className="text-xs font-medium text-gray-700 bg-gray-100 rounded-full px-3 py-1">{r}</span>)}
                </div>
              </Section>
            )}

            {arr(pb.stakeholders).length > 0 && (
              <Section icon={Users} title="Who to reach">
                <div className="space-y-3">
                  {arr(pb.stakeholders).map((s, i) => (
                    <div key={i} className="border-l-2 border-fx-200 pl-3">
                      <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                      {s.why && <p className="text-xs text-gray-500 mt-0.5">{s.why}</p>}
                      {s.approach && <p className="text-xs text-gray-700 mt-1"><span className="text-gray-400">Approach:</span> {s.approach}</p>}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {arr(pb.outreach_sequence).length > 0 && (
              <Section icon={Send} title="Outreach sequence">
                <div className="space-y-2.5">
                  {arr(pb.outreach_sequence).map((o, i) => (
                    <div key={i} className="flex gap-3 items-start">
                      <span className="w-6 h-6 rounded-full bg-fx-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{o.step || i + 1}</span>
                      <div>
                        <span className="text-xs font-semibold text-gray-900">{o.channel}</span>
                        <p className="text-sm text-gray-600">{o.angle}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {arr(pb.objections).length > 0 && (
              <Section icon={ShieldQuestion} title="Likely objections">
                <div className="space-y-2.5">
                  {arr(pb.objections).map((o, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium text-gray-900">“{o.objection}”</p>
                      <p className="text-sm text-gray-600 mt-0.5">{o.response}</p>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {arr(pb.first_meeting_goals).length > 0 && (
              <Section icon={Flag} title="First-meeting goals">
                <ul className="space-y-1.5">
                  {arr(pb.first_meeting_goals).map((g, i) => (
                    <li key={i} className="flex gap-2 text-sm text-gray-700"><ChevronRight className="w-4 h-4 text-fx-500 shrink-0 mt-0.5" /> {g}</li>
                  ))}
                </ul>
              </Section>
            )}

            {arr(pb.suggested_opportunities).length > 0 && (
              <Section icon={Plus} title="Suggested opportunities">
                <div className="space-y-2">
                  {arr(pb.suggested_opportunities).map((s, i) => {
                    const key = `opp-${i}`;
                    return (
                      <div key={i} className="flex items-start gap-3 border border-gray-100 rounded-lg p-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{s.title}</p>
                          {s.rationale && <p className="text-xs text-gray-500 mt-0.5">{s.rationale}</p>}
                        </div>
                        <button onClick={() => addToPipeline(s.title, key)} disabled={added[key]}
                          className={clsx('text-xs font-medium px-2.5 py-1.5 rounded-lg shrink-0 flex items-center gap-1',
                            added[key] ? 'bg-emerald-50 text-emerald-600' : 'bg-fx-600 text-white hover:bg-fx-700')}>
                          {added[key] ? <><Check className="w-3.5 h-3.5" /> Added</> : <><Plus className="w-3.5 h-3.5" /> Add</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-gray-400 mt-3">“Add” creates a prospect opportunity for {current.target_name} on your Pipeline board.</p>
              </Section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const inputCls = 'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fx-500/30 focus:border-fx-500';

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3"><Icon className="w-4 h-4 text-fx-600" /> {title}</h3>
      {children}
    </div>
  );
}
