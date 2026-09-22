'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { useEffect, useState } from 'react';
import { Target, LayoutDashboard, Kanban, Building2, Sparkles, Shield, X, Loader2, Check, Lock } from 'lucide-react';
import clsx from 'clsx';

interface AccessMember { id: string; name: string; email: string; role: string; bd_access: boolean; }

const TABS = [
  { label: 'Dashboard', href: '/bd', icon: LayoutDashboard },
  { label: 'Pipeline', href: '/bd/pipeline', icon: Kanban },
  { label: 'Accounts', href: '/bd/accounts', icon: Building2 },
  { label: 'AI Strategy', href: '/bd/strategy', icon: Sparkles },
];
const initialsOf = (name?: string | null) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function BDLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isRole } = useAuth();
  const isAdmin = isRole('Super Admin');

  const [access, setAccess] = useState<boolean | null>(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [members, setMembers] = useState<AccessMember[]>([]);
  const [aLoading, setALoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.bd.myAccess()
      .then((r) => { if (alive) setAccess(!!r?.access); })
      .catch(() => { if (alive) setAccess(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!accessOpen) return;
    setALoading(true);
    api.bd.access.list().then((d: any) => setMembers(d.members || [])).catch(() => {}).finally(() => setALoading(false));
  }, [accessOpen]);

  const toggleAccess = async (m: AccessMember) => {
    if (m.role === 'Super Admin') return;
    const next = !m.bd_access;
    setBusyId(m.id);
    setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, bd_access: next } : x)));
    try { await api.bd.access.set(m.id, next); }
    catch { setMembers((prev) => prev.map((x) => (x.id === m.id ? { ...x, bd_access: !next } : x))); }
    finally { setBusyId(null); }
  };

  if (access === null) {
    return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (!access) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4"><Lock className="w-6 h-6 text-gray-400" /></div>
        <h2 className="text-lg font-semibold text-gray-900">Business Development is restricted</h2>
        <p className="text-sm text-gray-500 mt-1 max-w-sm">You don’t have access to this area yet. Ask a Super Admin to enable it for your account.</p>
      </div>
    );
  }

  const isActive = (href: string) => (href === '/bd' ? pathname === '/bd' : pathname.startsWith(href));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg bg-fx-50 text-fx-600 flex items-center justify-center"><Target className="w-4 h-4" /></span>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 leading-tight">Business Development</h1>
            <p className="text-[12px] text-gray-500 leading-tight">Win and grow client accounts</p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setAccessOpen(true)}
            className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg">
            <Shield className="w-4 h-4" /> Manage access
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => {
          const active = isActive(t.href);
          const Icon = t.icon;
          return (
            <button key={t.href} onClick={() => router.push(t.href)}
              className={clsx('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap',
                active ? 'border-fx-600 text-fx-600' : 'border-transparent text-gray-500 hover:text-gray-800')}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {children}

      {accessOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setAccessOpen(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-1">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Shield className="w-4 h-4 text-fx-600" /> BD access</h3>
              <button onClick={() => setAccessOpen(false)} className="w-8 h-8 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500"><X className="w-4 h-4" /></button>
            </div>
            <p className="px-5 text-xs text-gray-500">Choose who can see and use Business Development. Super Admins always have access.</p>
            <div className="px-5 py-4 space-y-1.5">
              {aLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : members.map((m) => {
                const admin = m.role === 'Super Admin';
                const on = admin || m.bd_access;
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2">
                    <div className="w-8 h-8 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-xs font-semibold shrink-0">{initialsOf(m.name)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                      <p className="text-[11px] text-gray-400 truncate">{m.role}</p>
                    </div>
                    {admin ? (
                      <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 rounded px-2 py-1">Always on</span>
                    ) : (
                      <button onClick={() => toggleAccess(m)} disabled={busyId === m.id}
                        className={clsx('relative w-11 h-6 rounded-full transition-colors shrink-0', on ? 'bg-fx-600' : 'bg-gray-300', busyId === m.id && 'opacity-60')}>
                        <span className={clsx('absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform flex items-center justify-center', on && 'translate-x-5')}>
                          {on && <Check className="w-3 h-3 text-fx-600" />}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
