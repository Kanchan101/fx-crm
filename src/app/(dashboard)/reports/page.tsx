'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import { BarChart3, Calendar, Users, FileText } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ReportsPage() {
  const { isRole } = useAuth();
  const [activeTab, setActiveTab] = useState('sourcing');
  const [sourcingData, setSourcingData] = useState<any[]>([]);
  const [interviewData, setInterviewData] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [selectedMember, setSelectedMember] = useState('');
  const [loading, setLoading] = useState(true);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (selectedMember) params.set('team_member_id', selectedMember);

      const [sRes, iRes, tRes] = await Promise.all([
        fetch(`${API}/api/reports/daily-sourcing?${params}`, { headers: headers() }),
        fetch(`${API}/api/reports/daily-interviews?${params}`, { headers: headers() }),
        fetch(`${API}/api/team`, { headers: headers() }),
      ]);
      const [sData, iData, tData] = await Promise.all([sRes.json(), iRes.json(), tRes.json()]);
      setSourcingData(sData.report || []);
      setInterviewData(iData.report || []);
      setTeamMembers(tData.team || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo, selectedMember]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const tabs = [
    { id: 'sourcing', label: 'Daily Sourcing', icon: FileText },
    { id: 'interviews', label: 'Daily Interviews', icon: Calendar },
  ];

  const data = activeTab === 'sourcing' ? sourcingData : interviewData;
  const valueKey = activeTab === 'sourcing' ? 'candidates_submitted' : 'interviews_count';

  // Aggregate by team member
  const memberTotals = new Map<string, { name: string; role: string; total: number }>();
  data.forEach((row: any) => {
    const existing = memberTotals.get(row.team_member_id) || { name: row.team_member, role: row.role, total: 0 };
    existing.total += parseInt(row[valueKey]) || 0;
    memberTotals.set(row.team_member_id, existing);
  });
  const sortedMembers = Array.from(memberTotals.entries()).sort((a, b) => b[1].total - a[1].total);
  const maxVal = sortedMembers.length > 0 ? sortedMembers[0][1].total : 1;

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
              activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
            <tab.icon className="w-3.5 h-3.5" />{tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        <span className="text-gray-400 text-sm">to</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        <select value={selectedMember} onChange={(e) => setSelectedMember(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="">All Team Members</option>
          {teamMembers.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar chart visual */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              {activeTab === 'sourcing' ? 'Submissions by Team Member' : 'Interviews by Team Member'}
            </h3>
            {sortedMembers.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No data for selected period</div>
            ) : (
              <div className="space-y-3">
                {sortedMembers.map(([id, { name, role, total }]) => (
                  <div key={id} className="flex items-center gap-3">
                    <div className="w-28 text-xs text-gray-600 truncate font-medium">{name}</div>
                    <div className="flex-1 h-7 bg-gray-50 rounded-md overflow-hidden relative">
                      <div className="h-full bg-fx-500/80 rounded-md transition-all duration-500 flex items-center justify-end pr-2"
                        style={{ width: `${Math.max((total / maxVal) * 100, 8)}%` }}>
                        <span className="text-[10px] font-bold text-white">{total}</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-400 w-16">{role === 'Account Manager' ? 'AM' : role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Daily breakdown table */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Daily Breakdown</h3>
            {data.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-400">No data for selected period</div>
            ) : (
              <div className="overflow-y-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-gray-400 font-medium">Date</th>
                      <th className="text-left py-2 text-gray-400 font-medium">Member</th>
                      <th className="text-right py-2 text-gray-400 font-medium">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row: any, i: number) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-2 text-gray-600">{new Date(row.report_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                        <td className="py-2 text-gray-800 font-medium">{row.team_member}</td>
                        <td className="py-2 text-right font-bold text-gray-900">{row[valueKey]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
