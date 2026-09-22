'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  Loader2, Plus, X, CheckCircle2, Circle, Trash2, AlertTriangle,
  Sun, CalendarDays, AlertCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import clsx from 'clsx';

interface Task {
  id: string; title: string; client_id: string | null; owner_id: string | null;
  due_date: string | null; done: boolean; bucket: string;
  owner_name: string | null; owner_color: string | null; completed_by_name: string | null;
  client_name: string | null; opportunity_title: string | null;
}
interface Client { id: string; name: string; }
interface TeamMember { id: string; name: string; role: string; }

const initialsOf = (name?: string | null) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
function dateLabel(d: string | null): string {
  if (!d) return 'No date';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const BUCKETS = [
  { key: 'Overdue', icon: AlertTriangle, tint: 'text-red-600', dot: 'bg-red-500' },
  { key: 'Today', icon: Sun, tint: 'text-fx-600', dot: 'bg-fx-500' },
  { key: 'Upcoming', icon: CalendarDays, tint: 'text-gray-500', dot: 'bg-gray-400' },
];
const emptyForm = { title: '', owner_id: '', client_id: '', due_date: '' };

export default function BDActivitiesPage() {
  const { user, isRole } = useAuth();
  const canManage = isRole('Super Admin', 'Account Manager');

  const [tasks, setTasks] = useState<Task[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'everyone' | 'mine'>('everyone');
  const [showDone, setShowDone] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const p = new URLSearchParams();
      if (scope === 'mine' && user?.id) p.set('owner_id', String(user.id));
      const d = await api.bd.tasks.list(p.toString());
      setTasks(d.tasks || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [scope, user?.id]);

  const loadMeta = useCallback(async () => {
    try {
      const [c, t] = await Promise.all([api.clients.list(''), api.team.list()]);
      setClients(c.clients || []);
      setTeam((t.team || []).filter((m: TeamMember & { is_active?: boolean }) => m.is_active !== false));
    } catch (e) { /* not fatal */ }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadMeta(); }, [loadMeta]);

  const toggle = async (t: Task) => {
    setTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try { await api.bd.tasks.toggle(t.id); await load(); } catch (e) { await load(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    try { await api.bd.tasks.remove(id); await load(); } catch (e) { console.error(e); }
  };

  const openAdd = () => { setForm({ ...emptyForm, owner_id: user?.id ? String(user.id) : '' }); setError(''); setShowModal(true); };

  const save = async () => {
    if (!form.title.trim()) { setError('A task title is required.'); return; }
    setSaving(true); setError('');
    try {
      await api.bd.tasks.create({
        title: form.title.trim(),
        owner_id: form.owner_id || undefined,
        client_id: form.client_id || undefined,
        due_date: form.due_date || undefined,
      });
      setShowModal(false);
      await load();
    } catch (e: any) { setError(e.message || 'Could not save.'); }
    finally { setSaving(false); }
  };

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const inBucket = (b: string) => open.filter((t) => t.bucket === b);

  const row = (t: Task) => (
    <div key={t.id} className="flex items-center gap-3 py-2.5 group">
      <button onClick={() => toggle(t)} className="shrink-0 text-gray-300 hover:text-fx-600">
        {t.done ? <CheckCircle2 className="w-[18px] h-[18px] text-fx-600" /> : <Circle className="w-[18px] h-[18px]" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm truncate', t.done ? 'line-through text-gray-400' : 'text-gray-900 font-medium')}>{t.title}</p>
        <p className="text-[11px] text-gray-400 truncate">
          {[t.client_name, t.opportunity_title].filter(Boolean).join(' · ') || 'General'}
          {t.done && t.completed_by_name ? ` · done by ${t.completed_by_name}` : ''}
        </p>
      </div>
      <span className="text-[11px] text-gray-500 shrink-0 w-16 text-right">{dateLabel(t.due_date)}</span>
      <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
        style={{ backgroundColor: t.owner_color || '#4c6ef5' }} title={t.owner_name || 'Unassigned'}>
        {initialsOf(t.owner_name)}
      </span>
      {canManage && (
        <button onClick={() => remove(t.id)} className="w-6 h-6 rounded-md text-gray-300 hover:text-red-500 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['everyone', 'mine'] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={clsx('px-3 py-1.5 text-xs font-medium rounded-md capitalize', scope === s ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {s === 'mine' ? 'My tasks' : 'Everyone'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">{open.length} open{inBucket('Overdue').length ? ` · ${inBucket('Overdue').length} overdue` : ''}</span>
        <button onClick={openAdd} className="ml-auto flex items-center gap-1.5 bg-fx-600 hover:bg-fx-700 text-white text-sm font-medium px-3.5 py-2 rounded-lg">
          <Plus className="w-4 h-4" /> Add task
        </button>
      </div>

      {/* Buckets */}
      {BUCKETS.map((b) => {
        const items = inBucket(b.key);
        const Icon = b.icon;
        return (
          <div key={b.key} className={clsx('bg-white border rounded-xl', b.key === 'Overdue' && items.length ? 'border-red-200' : 'border-gray-200')}>
            <div className="flex items-center gap-2 px-5 pt-4 pb-1">
              <Icon className={clsx('w-4 h-4', b.tint)} />
              <h3 className={clsx('text-sm font-semibold', b.tint)}>{b.key}</h3>
              <span className="text-xs text-gray-400">{items.length}</span>
            </div>
            <div className="px-5 pb-3 divide-y divide-gray-50">
              {items.length === 0 ? <p className="text-sm text-gray-300 py-4">Nothing {b.key.toLowerCase()}.</p> : items.map(row)}
            </div>
          </div>
        );
      })}

      {/* Completed */}
      {done.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl">
          <button onClick={() => setShowDone((v) => !v)} className="w-full flex items-center gap-2 px-5 py-3.5 text-left">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-700">Completed</h3>
            <span className="text-xs text-gray-400">{done.length}</span>
            {showDone ? <ChevronUp className="w-4 h-4 text-gray-400 ml-auto" /> : <ChevronDown className="w-4 h-4 text-gray-400 ml-auto" />}
          </button>
          {showDone && <div className="px-5 pb-3 divide-y divide-gray-50 border-t border-gray-50">{done.map(row)}</div>}
        </div>
      )}

      {/* Add task modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-2">
              <h3 className="text-lg font-semibold text-gray-900">Add task</h3>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-5 pb-5 space-y-3.5">
              {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
              <Field label="Task">
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Send proposal to Flipkart" className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Assign to">
                  <select value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} className={inputCls}>
                    <option value="">Unassigned</option>
                    {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Due date">
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <Field label="Related account (optional)">
                <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })} className={inputCls}>
                  <option value="">None</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-fx-600 hover:bg-fx-700 rounded-lg flex items-center gap-2 disabled:opacity-60">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save task
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
