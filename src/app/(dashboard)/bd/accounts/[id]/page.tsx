'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Loader2, ArrowLeft, TrendingUp, Trophy, IndianRupee, Send,
  Phone, Mail, FileText, Circle, MessageSquare,
} from 'lucide-react';
import clsx from 'clsx';

interface Opp { id: string; title: string; stage: string; value: number; idle_days: number; owner_name: string | null; }
interface Contact { name: string; designation: string | null; email: string | null; is_primary: boolean; }
interface TimelineItem { action: string; entity_type: string; details: any; created_at: string; user_name: string | null; }
interface Account { id: string; name: string; vertical: string | null; tier: string | null; location: string | null; status: string | null; spoc_name: string | null; spoc_role: string | null; spoc_email: string | null; }
interface Stats { openCount: number; openValue: number; wonCount: number; wonValue: number; }

function fmtINR(rupees: number): string {
  const r = Number(rupees) || 0;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
}
const STAGE_PILL: Record<string, string> = {
  Prospecting: 'bg-gray-100 text-gray-600', Qualified: 'bg-fx-50 text-fx-600',
  Proposal: 'bg-violet-50 text-violet-600', Negotiation: 'bg-amber-50 text-amber-700',
  Won: 'bg-emerald-50 text-emerald-600', Lost: 'bg-red-50 text-red-500',
};
const initialsOf = (name?: string | null) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

function timeAgo(iso: string): string {
  const d = new Date(iso); const s = (Date.now() - d.getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function tlText(t: TimelineItem): string {
  const d = t.details || {};
  if (t.action === 'note') return d.text || 'Note added';
  if (t.action === 'stage_changed') return `Moved ${d.from || '?'} → ${d.to || '?'}`;
  if (t.action === 'created') return `Opportunity created: ${d.title || ''}`;
  return t.action;
}

export default function BDAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.bd.accounts.get(id);
      setAccount(d.account); setOpps(d.opportunities || []); setContacts(d.contacts || []);
      setStats(d.stats || null); setTimeline(d.timeline || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const addNote = async () => {
    if (!note.trim()) return;
    setPosting(true);
    try { await api.bd.accounts.addNote(id, note.trim()); setNote(''); await load(); }
    catch (e) { console.error(e); }
    finally { setPosting(false); }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!account) return <p className="text-sm text-gray-500 py-10 text-center">Account not found.</p>;

  const ic = (action: string) => action === 'note' ? MessageSquare : action === 'stage_changed' ? TrendingUp : FileText;

  return (
    <div className="space-y-4">
      <button onClick={() => router.push('/bd/accounts')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> All accounts
      </button>

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-xl bg-fx-50 text-fx-700 flex items-center justify-center text-base font-bold shrink-0">{initialsOf(account.name)}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">{account.name}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {[account.vertical, account.tier, account.location].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Open pipeline', value: fmtINR(stats?.openValue || 0), icon: TrendingUp },
            { label: 'Open opps', value: String(stats?.openCount || 0), icon: IndianRupee },
            { label: 'Won', value: String(stats?.wonCount || 0), icon: Trophy },
          ].map((s) => (
            <div key={s.label} className="bg-gray-50 rounded-lg p-3">
              <p className="text-[11px] text-gray-500">{s.label}</p>
              <p className="text-lg font-semibold text-gray-900 mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Opportunities */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Opportunities</h3>
              <button onClick={() => router.push('/bd/pipeline')} className="text-xs font-medium text-fx-600 hover:text-fx-700">Open board</button>
            </div>
            {opps.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No opportunities yet for this account.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {opps.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{o.title}</p>
                      <p className="text-[11px] text-gray-400">{o.owner_name || 'Unassigned'}{o.idle_days > 7 && o.stage !== 'Won' ? ` · ${o.idle_days}d idle` : ''}</p>
                    </div>
                    <span className={clsx('text-[11px] font-medium rounded px-2 py-0.5', STAGE_PILL[o.stage] || 'bg-gray-100 text-gray-600')}>{o.stage}</span>
                    <span className="text-sm font-bold text-gray-900 w-20 text-right">{fmtINR(o.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Timeline + note composer */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity</h3>
            <div className="flex gap-2 mb-4">
              <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()}
                placeholder="Log a call, email or note…"
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fx-500/30 focus:border-fx-500" />
              <button onClick={addNote} disabled={posting || !note.trim()}
                className="bg-fx-600 hover:bg-fx-700 text-white text-sm font-medium px-3 rounded-lg flex items-center gap-1.5 disabled:opacity-50">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
            {timeline.length === 0 ? (
              <p className="text-sm text-gray-400 py-4 text-center">No activity logged yet.</p>
            ) : (
              <div className="space-y-3">
                {timeline.map((t, i) => {
                  const Icon = ic(t.action);
                  return (
                    <div key={i} className="flex gap-3">
                      <span className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5"><Icon className="w-3.5 h-3.5 text-gray-500" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-800">{tlText(t)}</p>
                        <p className="text-[11px] text-gray-400">{t.user_name || 'Someone'} · {timeAgo(t.created_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Contacts */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Key contacts</h3>
            {contacts.length === 0 && !account.spoc_name ? (
              <p className="text-sm text-gray-400 py-2">No contacts on record.</p>
            ) : (
              <div className="space-y-3">
                {(contacts.length ? contacts : [{ name: account.spoc_name || '', designation: account.spoc_role, email: account.spoc_email, is_primary: true }]).map((c, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-xs font-semibold shrink-0">{initialsOf(c.name)}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{c.name || '—'}{c.is_primary && <span className="ml-1.5 text-[10px] text-fx-600 bg-fx-50 rounded px-1 py-0.5">Primary</span>}</p>
                      {c.designation && <p className="text-[11px] text-gray-500">{c.designation}</p>}
                      {c.email && <p className="text-[11px] text-gray-400 flex items-center gap-1 truncate"><Mail className="w-3 h-3" /> {c.email}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
