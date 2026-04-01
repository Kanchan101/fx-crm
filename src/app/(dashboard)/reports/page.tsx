'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import { BarChart3, Calendar, Users, FileText, Download, TrendingUp, Clock, Target, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ReportsPage() {
  const { isRole } = useAuth();
  const [activeTab, setActiveTab] = useState('performance');
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);

  // Data
  const [performance, setPerformance] = useState<any[]>([]);
  const [conversion, setConversion] = useState<any>(null);
  const [tat, setTat] = useState<any>(null);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const [pRes, cRes, tRes] = await Promise.all([
        fetch(`${API}/api/reports/team-performance?${params}`, { headers: headers() }),
        fetch(`${API}/api/reports/conversion-rates?${params}`, { headers: headers() }),
        fetch(`${API}/api/reports/tat?${params}`, { headers: headers() }),
      ]);
      const [pData, cData, tData] = await Promise.all([pRes.json(), cRes.json(), tRes.json()]);
      setPerformance(pData.performance || []);
      setConversion(cData);
      setTat(tData);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportCSV = async (type: string) => {
    const params = new URLSearchParams({ type, date_from: dateFrom, date_to: dateTo });
    const res = await fetch(`${API}/api/reports/export?${params}`, { headers: headers() });
    if (res.headers.get('content-type')?.includes('csv')) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${type}-${dateTo}.csv`; a.click();
    } else {
      const data = await res.json();
      alert(data.message || data.error || 'No data to export');
    }
  };

  const tabs = [
    { id: 'performance', label: 'Team Performance', icon: Users },
    { id: 'conversion', label: 'Conversion & Rejection', icon: Target },
    { id: 'tat', label: 'TAT Analysis', icon: Clock },
  ];

  const funnelRate = (num: number, den: number) => den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '—';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-xs text-gray-400">Analytics & team performance</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={clsx('px-4 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5',
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              <Icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <>
          {/* ===== TEAM PERFORMANCE ===== */}
          {activeTab === 'performance' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => exportCSV('team-performance')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                  <Download className="w-3.5 h-3.5" /> Export Excel
                </button>
              </div>
              {performance.length === 0 ? (
                <div className="bg-white rounded-xl border p-10 text-center text-gray-400 text-sm">No data for selected period</div>
              ) : (
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className="text-left px-4 py-3 font-semibold text-gray-600">Team Member</th>
                          <th className="text-left px-3 py-3 font-semibold text-gray-600">Role</th>
                          <th className="text-center px-3 py-3 font-semibold text-gray-600">Sourced</th>
                          <th className="text-center px-3 py-3 font-semibold text-blue-600">AM Review</th>
                          <th className="text-center px-3 py-3 font-semibold text-purple-600">Submitted</th>
                          <th className="text-center px-3 py-3 font-semibold text-amber-600">Interview</th>
                          <th className="text-center px-3 py-3 font-semibold text-teal-600">Offered</th>
                          <th className="text-center px-3 py-3 font-semibold text-green-600">Joined</th>
                          <th className="text-center px-3 py-3 font-semibold text-red-600">Rejected</th>
                          <th className="text-center px-3 py-3 font-semibold text-gray-600">Conversion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {performance.map((m: any) => {
                          const conv = m.total_sourced > 0 ? ((parseInt(m.joined) / parseInt(m.total_sourced)) * 100).toFixed(1) : '0';
                          return (
                            <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="px-4 py-3 font-medium text-gray-900">{m.name}</td>
                              <td className="px-3 py-3 text-gray-500">{m.role === 'Account Manager' ? 'AM' : m.role}</td>
                              <td className="px-3 py-3 text-center font-bold">{m.total_sourced}</td>
                              <td className="px-3 py-3 text-center text-blue-700">{m.am_review_select}</td>
                              <td className="px-3 py-3 text-center text-purple-700">{m.client_review}</td>
                              <td className="px-3 py-3 text-center text-amber-700">{m.interviews}</td>
                              <td className="px-3 py-3 text-center text-teal-700">{m.offered}</td>
                              <td className="px-3 py-3 text-center text-green-700 font-bold">{m.joined}</td>
                              <td className="px-3 py-3 text-center text-red-600">{m.rejected}</td>
                              <td className="px-3 py-3 text-center">
                                <span className={clsx('px-2 py-0.5 rounded-full text-[10px] font-bold',
                                  parseFloat(conv) >= 10 ? 'bg-green-100 text-green-700' : parseFloat(conv) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500')}>
                                  {conv}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== CONVERSION & REJECTION ===== */}
          {activeTab === 'conversion' && conversion && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button onClick={() => exportCSV('pipeline')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">
                  <Download className="w-3.5 h-3.5" /> Export Pipeline Data
                </button>
              </div>

              {/* Funnel */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Conversion Funnel</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Sourced', value: conversion.funnel?.total || 0, color: 'text-gray-900' },
                    { label: 'Submitted', value: conversion.funnel?.submitted || 0, rate: funnelRate(conversion.funnel?.submitted, conversion.funnel?.total), color: 'text-purple-700' },
                    { label: 'Interviewed', value: conversion.funnel?.interviewed || 0, rate: funnelRate(conversion.funnel?.interviewed, conversion.funnel?.submitted), color: 'text-amber-700' },
                    { label: 'Offered', value: conversion.funnel?.offered || 0, rate: funnelRate(conversion.funnel?.offered, conversion.funnel?.interviewed), color: 'text-teal-700' },
                    { label: 'Joined', value: conversion.funnel?.joined || 0, rate: funnelRate(conversion.funnel?.joined, conversion.funnel?.offered), color: 'text-green-700' },
                    { label: 'Rejected', value: conversion.funnel?.rejected || 0, rate: funnelRate(conversion.funnel?.rejected, conversion.funnel?.total), color: 'text-red-600' },
                    { label: 'Dropped', value: conversion.funnel?.dropped || 0, rate: funnelRate(conversion.funnel?.dropped, conversion.funnel?.total), color: 'text-pink-600' },
                    { label: 'Overall Success', value: '', rate: funnelRate(conversion.funnel?.joined, conversion.funnel?.total), color: 'text-green-700' },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-gray-50 rounded-lg text-center">
                      <p className="text-[10px] text-gray-400 uppercase font-semibold">{item.label}</p>
                      <p className={clsx('text-xl font-bold', item.color)}>{item.value}</p>
                      {item.rate && <p className="text-xs text-gray-500">{item.rate}</p>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Rejection Reasons */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Rejection Reasons</h3>
                  {(conversion.reject_reasons || []).length === 0 ? <p className="text-xs text-gray-400">No rejections</p> : (
                    <div className="space-y-2">
                      {conversion.reject_reasons.map((r: any, i: number) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-xs text-gray-700">{r.reject_reason}</span>
                          <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Drop Reasons</h3>
                  {(conversion.drop_reasons || []).length === 0 ? <p className="text-xs text-gray-400">No drops</p> : (
                    <div className="space-y-2">
                      {conversion.drop_reasons.map((r: any, i: number) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-xs text-gray-700">{r.drop_reason}</span>
                          <span className="text-xs font-bold text-pink-600 bg-pink-50 px-2 py-0.5 rounded-full">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Client Conversion */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Client-wise Conversion</h3>
                {(conversion.client_conversion || []).length === 0 ? <p className="text-xs text-gray-400">No data</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-gray-100">
                        <th className="text-left py-2 text-gray-400">Client</th>
                        <th className="text-center py-2 text-gray-400">Total</th>
                        <th className="text-center py-2 text-gray-400">Offered</th>
                        <th className="text-center py-2 text-gray-400">Joined</th>
                        <th className="text-center py-2 text-gray-400">Rejected</th>
                        <th className="text-center py-2 text-gray-400">Success Rate</th>
                      </tr></thead>
                      <tbody>
                        {conversion.client_conversion.map((c: any, i: number) => (
                          <tr key={i} className="border-b border-gray-50">
                            <td className="py-2 font-medium text-gray-900">{c.client_name}</td>
                            <td className="py-2 text-center">{c.total}</td>
                            <td className="py-2 text-center text-teal-600">{c.offered}</td>
                            <td className="py-2 text-center text-green-600 font-bold">{c.joined}</td>
                            <td className="py-2 text-center text-red-500">{c.rejected}</td>
                            <td className="py-2 text-center">{funnelRate(parseInt(c.joined), parseInt(c.total))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ===== TAT ANALYSIS ===== */}
          {activeTab === 'tat' && tat && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Average Turnaround Time (Days)</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {[
                    { label: 'CV Upload → Submitted', value: tat.sourced_to_submitted, color: 'text-purple-700', bg: 'bg-purple-50' },
                    { label: 'Submitted → Interview', value: tat.submitted_to_interview, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: 'Interview → Offer', value: tat.interview_to_offer, color: 'text-teal-700', bg: 'bg-teal-50' },
                    { label: 'Offer → Joined', value: tat.offer_to_joined, color: 'text-green-700', bg: 'bg-green-50' },
                    { label: 'Full Cycle', value: tat.full_cycle, color: 'text-fx-700', bg: 'bg-fx-50' },
                  ].map((item, i) => (
                    <div key={i} className={clsx('p-4 rounded-xl text-center', item.bg)}>
                      <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1">{item.label}</p>
                      <p className={clsx('text-2xl font-bold', item.color)}>
                        {item.value !== null ? item.value : '—'}
                      </p>
                      {item.value !== null && <p className="text-[10px] text-gray-400">days avg</p>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">TAT is calculated from status change timestamps in your pipeline history. The more candidates move through stages, the more accurate these numbers become.</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
