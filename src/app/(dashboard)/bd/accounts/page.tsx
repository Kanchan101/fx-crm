'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Loader2, Search, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface Account {
  id: string; name: string; vertical: string | null; tier: string | null;
  open_count: number; open_value: number; won_count: number; last_activity: string | null;
}

function fmtINR(rupees: number): string {
  const r = Number(rupees) || 0;
  if (r >= 1e7) return `₹${(r / 1e7).toFixed(2)} Cr`;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(1)} L`;
  return `₹${Math.round(r).toLocaleString('en-IN')}`;
}
const initialsOf = (name?: string | null) => (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function BDAccountsPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.bd.accounts.list().then((d: any) => setAccounts(d.accounts || [])).catch((e) => console.error(e)).finally(() => setLoading(false));
  }, []);

  const rows = accounts.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex items-center justify-center py-24 text-gray-400"><Loader2 className="w-6 h-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="relative w-full sm:w-72">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search accounts…"
          className="w-full text-sm border border-gray-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-fx-500/30 focus:border-fx-500" />
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          <div className="col-span-5">Account</div>
          <div className="col-span-2 text-right">Open pipeline</div>
          <div className="col-span-2 text-center">Open</div>
          <div className="col-span-2 text-center">Won</div>
          <div className="col-span-1"></div>
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">No accounts match.</p>
        ) : rows.map((a) => (
          <button key={a.id} onClick={() => router.push(`/bd/accounts/${a.id}`)}
            className="w-full grid grid-cols-12 gap-2 px-4 py-3 items-center border-b border-gray-50 hover:bg-gray-50 text-left">
            <div className="col-span-5 flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-fx-50 text-fx-700 flex items-center justify-center text-xs font-bold shrink-0">{initialsOf(a.name)}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{a.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{a.vertical || '—'}{a.tier ? ` · ${a.tier}` : ''}</p>
              </div>
            </div>
            <div className="col-span-2 text-right text-sm font-semibold text-gray-900">{fmtINR(a.open_value)}</div>
            <div className="col-span-2 text-center text-sm text-gray-700">{a.open_count}</div>
            <div className="col-span-2 text-center">
              <span className={clsx('text-xs font-medium rounded px-2 py-0.5', a.won_count > 0 ? 'bg-emerald-50 text-emerald-600' : 'text-gray-400')}>{a.won_count}</span>
            </div>
            <div className="col-span-1 flex justify-end"><ChevronRight className="w-4 h-4 text-gray-300" /></div>
          </button>
        ))}
      </div>
    </div>
  );
}
