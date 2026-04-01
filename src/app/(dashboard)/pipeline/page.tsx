'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getToken } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const KANBAN_COLUMNS = [
  { key: 'AM Review Pending', label: 'AM Review Pending', color: 'border-t-blue-500', bg: 'bg-blue-50' },
  { key: 'AM Review Select', label: 'AM Review Select', color: 'border-t-indigo-500', bg: 'bg-indigo-50' },
  { key: 'Client Review Pending', label: 'Client Review Pending', color: 'border-t-yellow-500', bg: 'bg-yellow-50' },
  { key: 'Interview', label: 'Interview', color: 'border-t-purple-500', bg: 'bg-purple-50' },
  { key: 'Offered', label: 'Offered', color: 'border-t-orange-500', bg: 'bg-orange-50' },
  { key: 'Joined', label: 'Joined', color: 'border-t-green-500', bg: 'bg-green-50' },
];

const EXIT_COLUMNS = [
  { key: 'Rejected', label: 'Rejected', color: 'border-t-red-500', bg: 'bg-red-50' },
  { key: 'On Hold', label: 'On Hold', color: 'border-t-gray-400', bg: 'bg-gray-50' },
  { key: 'Dropped', label: 'Dropped', color: 'border-t-pink-500', bg: 'bg-pink-50' },
];

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

export default function PipelinePage() {
  const [requirements, setRequirements] = useState<any[]>([]);
  const [selectedReqId, setSelectedReqId] = useState('');
  const [pipeline, setPipeline] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [showExitColumns, setShowExitColumns] = useState(false);

  // Fetch requirements list
  useEffect(() => {
    const fetchReqs = async () => {
      try {
        const res = await fetch(`${API}/api/requirements`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setRequirements(data);
        if (data.length > 0 && !selectedReqId) setSelectedReqId(data[0].id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    };
    fetchReqs();
  }, []);

  // Fetch pipeline for selected requirement
  useEffect(() => {
    if (!selectedReqId) return;
    const fetchPipeline = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${API}/api/pipeline/requirement/${selectedReqId}`, { headers: authHeaders() });
        if (!res.ok) throw new Error('Failed to fetch pipeline');
        const data = await res.json();
        setPipeline(data.pipeline || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    };
    fetchPipeline();
  }, [selectedReqId]);

  // Move candidate (status change)
  const moveCandidate = async (candidateId: string, newStatus: string, extras: Record<string, any> = {}) => {
    try {
      const res = await fetch(`${API}/api/pipeline/move`, {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({
          requirement_id: selectedReqId,
          candidate_id: candidateId,
          status: newStatus,
          ...extras,
        }),
      });
      if (!res.ok) throw new Error('Failed to move candidate');
      setSuccessMsg(`Moved to ${newStatus}`);
      setTimeout(() => setSuccessMsg(''), 2000);

      // Refresh pipeline
      const pRes = await fetch(`${API}/api/pipeline/requirement/${selectedReqId}`, { headers: authHeaders() });
      const pData = await pRes.json();
      setPipeline(pData.pipeline || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  const allColumns = showExitColumns ? [...KANBAN_COLUMNS, ...EXIT_COLUMNS] : KANBAN_COLUMNS;

  return (
    <div className="p-4 md:p-6">
      {/* Messages */}
      {successMsg && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">{successMsg}</div>
      )}
      {error && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {error}<button onClick={() => setError('')} className="ml-3 font-bold">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recruitment Funnel</h1>
          <p className="text-sm text-gray-500">Visual overview of candidates across all stages</p>
        </div>
        <div className="flex gap-3 items-center">
          <select
            value={selectedReqId}
            onChange={(e) => setSelectedReqId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm max-w-xs"
          >
            {requirements.map(r => (
              <option key={r.id} value={r.id}>{r.title} ({r.client_name})</option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showExitColumns} onChange={() => setShowExitColumns(!showExitColumns)} />
            Show Exit States
          </label>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">Loading pipeline...</div>
      ) : (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {allColumns.map(col => {
              const items = pipeline[col.key] || [];
              return (
                <div key={col.key} className={`w-72 flex-shrink-0 rounded-lg border-t-4 ${col.color} bg-white shadow-sm`}>
                  {/* Column Header */}
                  <div className={`p-3 ${col.bg} rounded-t-lg`}>
                    <div className="flex justify-between items-center">
                      <h3 className="font-semibold text-sm text-gray-800">{col.label}</h3>
                      <span className="bg-white px-2 py-0.5 rounded-full text-xs font-bold text-gray-600 shadow-sm">
                        {items.length}
                      </span>
                    </div>
                  </div>

                  {/* Cards */}
                  <div className="p-2 space-y-2 min-h-[200px] max-h-[70vh] overflow-y-auto">
                    {items.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-xs">No candidates</div>
                    ) : (
                      items.map(item => {
                        const cand = item.candidates || item;
                        return (
                          <div key={item.id || item.candidate_id} className="bg-white border rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                            <div className="font-medium text-sm text-gray-900 truncate">{cand.name}</div>
                            <div className="text-xs text-gray-500 mt-1 truncate">
                              {cand.current_designation && `${cand.current_designation} • `}{cand.current_company || 'N/A'}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              {cand.experience && `${cand.experience} yrs`}
                              {cand.location && ` • ${cand.location}`}
                            </div>
                            {item.interview_round && col.key === 'Interview' && (
                              <div className="text-xs text-purple-600 mt-1">Round: {item.interview_round}</div>
                            )}
                            {item.reject_reason && <div className="text-xs text-red-500 mt-1">{item.reject_reason}</div>}
                            {item.drop_reason && <div className="text-xs text-pink-500 mt-1">{item.drop_reason}</div>}
                            {item.hold_reason && <div className="text-xs text-gray-500 mt-1">{item.hold_reason}</div>}

                            {/* Quick move dropdown */}
                            <select
                              value={item.status}
                              onChange={(e) => moveCandidate(item.candidate_id, e.target.value)}
                              className="mt-2 w-full text-xs border rounded px-1 py-1 bg-gray-50"
                            >
                              {[...KANBAN_COLUMNS, ...EXIT_COLUMNS].map(c => (
                                <option key={c.key} value={c.key}>{c.label}</option>
                              ))}
                            </select>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
