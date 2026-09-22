'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  Loader2, ArrowLeft, TrendingUp, Trophy, IndianRupee, Mail, Phone,
  Plus, X, Pencil, Trash2, Check, AlertCircle, Save, Rocket, ExternalLink,
} from 'lucide-react';
import clsx from 'clsx';

interface Opp { id: string; title: string; stage: string; value: number; idle_days: number; owner_name: string | null; }
interface Contact { id: string; name: string; designation: string | null; email: string | null; phone: string | null; is_primary: boolean; authority: string | null; }
interface Prospect { id: string; name: string; sector: string | null; notes: string | null; onboarded_client_id: string | null; updated_at: string | null; }
interface Stats { openCount: number; openValue: number; wonCount: number; }

const AUTHORITIES = ['Champion', 'Decision maker', 'Economic buyer', 'Influencer', 'Gatekeeper', 'Blocker'];
const AUTH_COLOR: Record<string, string> = {
  'Champion': 'bg-emerald-50 text-emerald-700', 'Decision maker': 'bg-fx-50 text-fx-700',
  'Economic buyer': 'bg-amber-50 text-amber-700', 'Influencer': 'bg-violet-50 text-violet-700',
  'Gatekeeper': 'bg-gray-100 text-gray-600', 'Blocker': 'bg-red-50 text-red-600',
};
const STAGE_PILL: Record<string, string> = {
  Prospecting: 'bg-gray-100 text-gray-600', Qualified: 'bg-fx-50 text-fx-600',
  Proposal: 'bg-violet-50 text-violet-600', Negotiation: 'bg-amber-50 text-amber-700',
  Won: 'bg-emerald-50 text-emerald-600', Lost: 'bg-red-50 text-red-500',
};
function fmtINR(rupees: number): string {
  const r = Number(rupees) || 0;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
}
const initialsOf = (name?: string | null) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const emptyContact = { name: '', designation: '', email: '', phone: '', authority: '', is_primary: false };

export default function BDProspectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isRole } = useAuth();
  const canManage = isRole('Super Admin', 'Account Manager');

  const [prospect, setProspect] = useState<Prospect | null>(null);
  const [opps, setOpps] = useState<Opp[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const [notesDraft, setNotesDraft] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [onboarding, setOnboarding] = useState(false);

  const [contactModal, setContactModal] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [cForm, setCForm] = useState(emptyContact);
  const [cSaving, setCSaving] = useState(false);
  const [cError, setCError] = useState('');

  const load = useCallback(async () => {
    try {
      const d = await api.bd.prospects.get(id);
      setProspect(d.prospect); setOpps(d.opportunities || []); setContacts(d.contacts || []); setStats(d.stats || null);
      setNotesDraft(d.prospect?.notes || '');
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true); setNotesSaved(false);
    try { await api.bd.prospects.saveNotes(id, notesDraft); setNotesSaved(true); await load(); setTimeout(() => setNotesSaved(false), 2500); }
    catch (e) { console.error(e); } finally { setSavingNotes(false); }
  };

  const onboard = async () => {
    if (!confirm(`Onboard ${prospect?.name} as a client? This moves them into your Clients list with all their contacts and notes.`)) return;
    setOnboarding(true);
    try { const r = await api.bd.prospects.onboard(id); if (r?.client_id) router.push('/clients'); }
    catch (e: any) { alert(e.message || 'Could not onboard.'); setOnboarding(false); }
  };

  const openAddContact = () => { setEditing(null); setCForm(emptyContact); setCError(''); setContactModal(true); };
  const openEditContact = (c: Contact) => {
    setEditing(c);
    setCForm({ name: c.name || '', designation: c.designation || '', email: c.email || '', phone: c.phone || '', authority: c.authority || '', is_primary: !!c.is_primary });
    setCError(''); setContactModal(true);
  };
  const saveContact = async () => {
    if (!cForm.name.trim()) { setCError('Contact name is required.'); return; }
    setCSaving(true); setCError('');
    try {
      if (editing) await api.bd.prospects.updateContact(editing.id, cForm);
      else await api.bd.prospects.addContact(id, cForm);
      setContactModal(false); await load();
    } catch (e: any) { setCError(e.message || 'Could not save.'); } finally { setCSaving(false); }
  };
  const deleteContact = async (c: Contact) => {
    if (!confirm(`Remove ${c.name}?`)) return;
    try { await api.bd.prospects.deleteContact(c.id); await load(); } catch (e) { console.error(e); }
  };

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  if (!prospect) return <p className="text-sm text-gray-500 py-10 text-center">Prospect not found.</p>;

  return (
    <div className="space-y-4">
      <button onClick={() => router.push('/bd/pipeline')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800">
        <ArrowLeft className="w-4 h-4" /> Back to pipeline
      </button>

      {prospect.onboarded_client_id && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <p className="text-sm text-emerald-800">This prospect has been onboarded as a client.</p>
          <button onClick={() => router.push('/clients')} className="text-sm font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1">
            View in Clients <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-base font-bold shrink-0">{initialsOf(prospect.name)}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-semibold text-gray-900">{prospect.name}</h2>
              <span className="text-[11px] font-medium rounded px-2 py-0.5 bg-amber-50 text-amber-700">Prospect</span>
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{prospect.sector || 'Sector not set'} · in BD pipeline</p>
          </div>
          {canManage && !prospect.onboarded_client_id && (
            <button onClick={onboard} disabled={onboarding}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-60 shrink-0">
              {onboarding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />} Onboard as client
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            { label: 'Open pipeline', value: fmtINR(stats?.openValue || 0) },
            { label: 'Open opps', value: String(stats?.openCount || 0) },
            { label: 'Won', value: String(stats?.wonCount || 0) },
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
          {/* Handover notes */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">Handover notes</h3>
              {notesSaved && <span className="text-xs text-emerald-600 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Saved</span>}
            </div>
            <p className="text-[11px] text-gray-400 mb-2">Everything the next person needs to pick up this pursuit — how it started, who matters, what’s been tried, next moves.</p>
            <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={5}
              placeholder="e.g. Warm intro via Rapido contact. Targeting their engineering hiring for Q3. Champion: Priya (VP TA). Sent capability deck 12 Sep, following up next week…"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-fx-500/30 focus:border-fx-500 resize-y" />
            <div className="flex justify-end mt-2">
              <button onClick={saveNotes} disabled={savingNotes || notesDraft === (prospect.notes || '')}
                className="flex items-center gap-1.5 bg-fx-600 hover:bg-fx-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg disabled:opacity-50">
                {savingNotes ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save notes
              </button>
            </div>
          </div>

          {/* Opportunities */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Opportunities</h3>
              <button onClick={() => router.push('/bd/pipeline')} className="text-xs font-medium text-fx-600 hover:text-fx-700">Open board</button>
            </div>
            {opps.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No opportunities yet.</p>
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
        </div>

        {/* Contacts */}
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Contacts</h3>
              <button onClick={openAddContact} className="flex items-center gap-1 text-xs font-medium text-fx-600 hover:text-fx-700"><Plus className="w-3.5 h-3.5" /> Add</button>
            </div>
            {contacts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">No contacts yet. Add the people you’re working at this company.</p>
            ) : (
              <div className="space-y-3">
                {contacts.map((c) => (
                  <div key={c.id} className="group flex items-start gap-3">
                    <span className="w-8 h-8 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-xs font-semibold shrink-0">{initialsOf(c.name)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                        {c.is_primary && <span className="text-[10px] text-fx-600 bg-fx-50 rounded px-1 py-0.5">Primary</span>}
                      </div>
                      {c.designation && <p className="text-[11px] text-gray-500">{c.designation}</p>}
                      {c.authority && <span className={clsx('inline-block mt-1 text-[10px] font-medium rounded px-1.5 py-0.5', AUTH_COLOR[c.authority] || 'bg-gray-100 text-gray-600')}>{c.authority}</span>}
                      {c.email && <p className="text-[11px] text-gray-400 flex items-center gap-1 truncate mt-1"><Mail className="w-3 h-3 shrink-0" /> {c.email}</p>}
                      {c.phone && <p className="text-[11px] text-gray-400 flex items-center gap-1"><Phone className="w-3 h-3 shrink-0" /> {c.phone}</p>}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => openEditContact(c)} className="w-6 h-6 rounded-md text-gray-400 hover:text-fx-600 flex items-center justify-center"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteContact(c)} className="w-6 h-6 rounded-md text-gray-400 hover:text-red-500 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Contact modal */}
      {contactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setContactModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="text-lg font-semibold text-gray-900">{editing ? 'Edit contact' : 'Add contact'}</h3>
              <button onClick={() => setContactModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 pb-5 space-y-3.5">
              {cError && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0" /> {cError}</div>}
              <Field label="Name"><input value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} placeholder="e.g. Priya Nair" className={inputCls} /></Field>
              <Field label="Designation (job title)"><input value={cForm.designation} onChange={(e) => setCForm({ ...cForm, designation: e.target.value })} placeholder="e.g. VP, Talent Acquisition" className={inputCls} /></Field>
              <Field label="Authority (decision role)">
                <select value={cForm.authority} onChange={(e) => setCForm({ ...cForm, authority: e.target.value })} className={inputCls}>
                  <option value="">Not set</option>
                  {AUTHORITIES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email"><input value={cForm.email} onChange={(e) => setCForm({ ...cForm, email: e.target.value })} placeholder="name@company.com" className={inputCls} /></Field>
                <Field label="Phone"><input value={cForm.phone} onChange={(e) => setCForm({ ...cForm, phone: e.target.value })} placeholder="Phone" className={inputCls} /></Field>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={cForm.is_primary} onChange={(e) => setCForm({ ...cForm, is_primary: e.target.checked })} className="rounded" /> Primary contact
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setContactModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={saveContact} disabled={cSaving} className="px-4 py-2 text-sm font-medium text-white bg-fx-600 hover:bg-fx-700 rounded-lg flex items-center gap-2 disabled:opacity-60">
                  {cSaving && <Loader2 className="w-4 h-4 animate-spin" />} {editing ? 'Save changes' : 'Add contact'}
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
