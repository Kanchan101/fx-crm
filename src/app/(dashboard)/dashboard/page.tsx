'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  Briefcase, Users, Building2, TrendingUp, Calendar, FileText,
  ArrowUpRight, Clock, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface StatCardProps {
  label: string; value: string | number; icon: React.ElementType; color: string; href?: string;
}

function StatCard({ label, value, icon: Icon, color, href }: StatCardProps) {
  const router = useRouter();
  return (
    <div onClick={() => href && router.push(href)}
      className={clsx('bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow', href && 'cursor-pointer')}>
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
          <Icon className="w-5 h-5" />
        </div>
        {href && <ChevronRight className="w-4 h-4 text-gray-300" />}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { user, isRole } = useAuth();
  const [stats, setStats] = useState({ open_positions: 0, active_candidates: 0, active_clients: 0, interviews_today: 0, submitted_this_week: 0, placements_this_month: 0 });
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' };
      const [statsRes, actRes] = await Promise.all([
        fetch(`${API}/api/reports/dashboard-stats`, { headers }),
        fetch(`${API}/api/reports/recent-activity`, { headers }),
      ]);
      const [statsData, actData] = await Promise.all([statsRes.json(), actRes.json()]);
      setStats(statsData);
      setActivities(actData.activities || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const actionLabel = (a: any) => {
    const labels: Record<string, string> = { CREATE: 'Created', UPDATE: 'Updated', DELETE: 'Deleted', LOGIN: 'Logged in', LOGOUT: 'Logged out', STATUS_CHANGE: 'Changed status' };
    return `${labels[a.action] || a.action} ${a.entity_type || ''}`;
  };

  const timeAgo = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  const greeting = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Open Positions" value={stats.open_positions} icon={Briefcase} color="bg-blue-50 text-blue-600" href="/requirements" />
            <StatCard label="Candidates" value={stats.active_candidates} icon={Users} color="bg-violet-50 text-violet-600" href="/candidates" />
            <StatCard label="Active Clients" value={stats.active_clients} icon={Building2} color="bg-amber-50 text-amber-600" href="/clients" />
            <StatCard label="Interviews Today" value={stats.interviews_today} icon={Calendar} color="bg-emerald-50 text-emerald-600" href="/interviews" />
          </div>

          {isRole('Super Admin', 'Account Manager') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <StatCard label="Submitted This Week" value={stats.submitted_this_week} icon={FileText} color="bg-orange-50 text-orange-600" href="/reports" />
              <StatCard label="Placements This Month" value={stats.placements_this_month} icon={TrendingUp} color="bg-teal-50 text-teal-600" />
            </div>
          )}

          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h2>
            {activities.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
                <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No activity yet</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
                {activities.slice(0, 15).map((a: any) => (
                  <div key={a.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium shrink-0">
                      {a.user_name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700"><span className="font-medium">{a.user_name}</span> {actionLabel(a)}</p>
                    </div>
                    <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
