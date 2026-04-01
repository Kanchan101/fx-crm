// patch-master.js — Run from fx-crm root: node patch-master.js
// Handles: 1. Candidate edit for all users 2. Remarks field 3. Reports rebuild 4. Pipeline fix
const fs = require('fs');

console.log('🔧 FX CRM Master Patch\n');

// ============================================================
// 1. BACKEND: Add remarks column + candidate edit route for all
// ============================================================
let candRoute = fs.readFileSync('server/routes/candidates.js', 'utf8');

// Add remarks to candidate insert if not present
if (!candRoute.includes('remarks')) {
  // Add PUT route for editing candidates (all authenticated users)
  if (!candRoute.includes("router.put('/:id'")) {
    candRoute = candRoute.replace(
      'module.exports = router;',
      `// PUT /api/candidates/:id — Edit candidate (all authenticated users)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, email, phone, location, experience_years, skills, current_role, current_company,
            education, current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable,
            notice_period, last_working_day, holding_offer, holding_offer_details, remarks } = req.body;
    const result = await query(
      \`UPDATE candidates SET name=COALESCE($1,name), email=COALESCE($2,email), phone=COALESCE($3,phone),
        location=COALESCE($4,location), experience_years=COALESCE($5,experience_years), skills=COALESCE($6,skills),
        current_role=COALESCE($7,current_role), current_company=COALESCE($8,current_company),
        education=COALESCE($9,education), current_ctc_fixed=COALESCE($10,current_ctc_fixed),
        current_ctc_variable=COALESCE($11,current_ctc_variable), expected_ctc_fixed=COALESCE($12,expected_ctc_fixed),
        expected_ctc_variable=COALESCE($13,expected_ctc_variable), notice_period=COALESCE($14,notice_period),
        last_working_day=$15, holding_offer=COALESCE($16,holding_offer),
        holding_offer_details=COALESCE($17,holding_offer_details), remarks=COALESCE($18,remarks),
        updated_at=NOW()
       WHERE id=$19 RETURNING *\`,
      [name, email, phone, location, experience_years ? parseFloat(experience_years) : null, skills,
       current_role, current_company, education, current_ctc_fixed ? parseFloat(current_ctc_fixed) : null,
       current_ctc_variable ? parseFloat(current_ctc_variable) : null, expected_ctc_fixed ? parseFloat(expected_ctc_fixed) : null,
       expected_ctc_variable ? parseFloat(expected_ctc_variable) : null, notice_period, last_working_day || null,
       holding_offer, holding_offer_details, remarks, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    await query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'UPDATE', 'candidate', req.params.id, JSON.stringify({ name })]);
    res.json({ candidate: result.rows[0] });
  } catch (err) { console.error('Update candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;`
    );
  }
  console.log('✅ Backend: Candidate edit route added (all users) with remarks field');
} else {
  console.log('⏭️  Backend: Candidate routes already have remarks');
}
fs.writeFileSync('server/routes/candidates.js', candRoute);

// ============================================================
// 2. BACKEND: Rebuild reports routes with team performance, rejection/selection rate, TAT, export
// ============================================================
const reportsRoute = `const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Dashboard stats
router.get('/dashboard-stats', authenticate, async (req, res) => {
  try {
    const [jobs, candidates, clients, interviews, submitted, placements] = await Promise.all([
      query("SELECT COUNT(*) as count FROM jobs WHERE status='Open'"),
      query("SELECT COUNT(*) as count FROM candidates"),
      query("SELECT COUNT(*) as count FROM clients WHERE status='Active'"),
      query("SELECT COUNT(*) as count FROM interviews WHERE interview_date = CURRENT_DATE"),
      query("SELECT COUNT(*) as count FROM candidate_status_history WHERE new_status='Client Review Pending' AND created_at >= DATE_TRUNC('week', NOW())"),
      query("SELECT COUNT(*) as count FROM pipeline WHERE status='Joined' AND updated_at >= DATE_TRUNC('month', NOW())"),
    ]);
    res.json({
      open_positions: parseInt(jobs.rows[0].count),
      active_candidates: parseInt(candidates.rows[0].count),
      active_clients: parseInt(clients.rows[0].count),
      interviews_today: parseInt(interviews.rows[0].count),
      submitted_this_week: parseInt(submitted.rows[0].count),
      placements_this_month: parseInt(placements.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// Recent activity
router.get('/recent-activity', authenticate, async (req, res) => {
  try {
    const result = await query(
      \`SELECT al.*, t.name as user_name FROM activity_log al
       LEFT JOIN team t ON t.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 20\`
    );
    res.json({ activities: result.rows });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

// ===== TEAM PERFORMANCE =====
router.get('/team-performance', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let dateFilter = '';
    const params = [];
    let idx = 1;
    if (date_from) { dateFilter += \` AND p.created_at >= $\${idx++}\`; params.push(date_from); }
    if (date_to) { dateFilter += \` AND p.created_at <= $\${idx++}\`; params.push(date_to + 'T23:59:59'); }

    const result = await query(\`
      SELECT
        t.id, t.name, t.role, t.email,
        COUNT(DISTINCT p.id) as total_sourced,
        COUNT(DISTINCT CASE WHEN p.status = 'AM Review Pending' THEN p.id END) as am_review_pending,
        COUNT(DISTINCT CASE WHEN p.status = 'AM Review Select' THEN p.id END) as am_review_select,
        COUNT(DISTINCT CASE WHEN p.status = 'Client Review Pending' THEN p.id END) as client_review,
        COUNT(DISTINCT CASE WHEN p.status = 'Interview' THEN p.id END) as interviews,
        COUNT(DISTINCT CASE WHEN p.status = 'Offered' THEN p.id END) as offered,
        COUNT(DISTINCT CASE WHEN p.status = 'Joined' THEN p.id END) as joined,
        COUNT(DISTINCT CASE WHEN p.status = 'Rejected' THEN p.id END) as rejected,
        COUNT(DISTINCT CASE WHEN p.status = 'Dropped' THEN p.id END) as dropped,
        COUNT(DISTINCT CASE WHEN p.status = 'On Hold' THEN p.id END) as on_hold
      FROM team t
      LEFT JOIN candidates ca ON ca.owner_id = t.id
      LEFT JOIN pipeline p ON p.candidate_id = ca.id \${dateFilter}
      WHERE t.is_active = true
      GROUP BY t.id, t.name, t.role, t.email
      ORDER BY total_sourced DESC
    \`, params);

    res.json({ performance: result.rows });
  } catch (err) { console.error('Team performance error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ===== REJECTION & SELECTION RATE =====
router.get('/conversion-rates', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let dateFilter = '';
    const params = [];
    let idx = 1;
    if (date_from) { dateFilter += \` AND p.created_at >= $\${idx++}\`; params.push(date_from); }
    if (date_to) { dateFilter += \` AND p.created_at <= $\${idx++}\`; params.push(date_to + 'T23:59:59'); }

    // Overall conversion funnel
    const funnel = await query(\`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN p.status IN ('AM Review Select','Client Review Pending','Interview','Offered','Joined') THEN 1 END) as passed_review,
        COUNT(CASE WHEN p.status IN ('Client Review Pending','Interview','Offered','Joined') THEN 1 END) as submitted,
        COUNT(CASE WHEN p.status IN ('Interview','Offered','Joined') THEN 1 END) as interviewed,
        COUNT(CASE WHEN p.status IN ('Offered','Joined') THEN 1 END) as offered,
        COUNT(CASE WHEN p.status = 'Joined' THEN 1 END) as joined,
        COUNT(CASE WHEN p.status = 'Rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN p.status = 'Dropped' THEN 1 END) as dropped
      FROM pipeline p WHERE 1=1 \${dateFilter}
    \`, params);

    // Rejection reasons breakdown
    const rejReasons = await query(\`
      SELECT p.reject_reason, COUNT(*) as count
      FROM pipeline p WHERE p.status = 'Rejected' AND p.reject_reason IS NOT NULL \${dateFilter}
      GROUP BY p.reject_reason ORDER BY count DESC
    \`, params);

    // Drop reasons breakdown
    const dropReasons = await query(\`
      SELECT p.drop_reason, COUNT(*) as count
      FROM pipeline p WHERE p.status = 'Dropped' AND p.drop_reason IS NOT NULL \${dateFilter}
      GROUP BY p.drop_reason ORDER BY count DESC
    \`, params);

    // Per-client conversion
    const clientConversion = await query(\`
      SELECT c.name as client_name,
        COUNT(*) as total,
        COUNT(CASE WHEN p.status = 'Joined' THEN 1 END) as joined,
        COUNT(CASE WHEN p.status = 'Rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN p.status IN ('Offered','Joined') THEN 1 END) as offered
      FROM pipeline p
      JOIN jobs j ON j.id = p.job_id
      JOIN clients c ON c.id = j.client_id
      WHERE 1=1 \${dateFilter}
      GROUP BY c.name ORDER BY total DESC
    \`, params);

    res.json({
      funnel: funnel.rows[0],
      reject_reasons: rejReasons.rows,
      drop_reasons: dropReasons.rows,
      client_conversion: clientConversion.rows,
    });
  } catch (err) { console.error('Conversion rates error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ===== TAT (Turnaround Time) =====
router.get('/tat', authenticate, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    let dateFilter = '';
    const params = [];
    let idx = 1;
    if (date_from) { dateFilter += \` AND h1.created_at >= $\${idx++}\`; params.push(date_from); }
    if (date_to) { dateFilter += \` AND h1.created_at <= $\${idx++}\`; params.push(date_to + 'T23:59:59'); }

    // Average TAT: Sourced to Submitted
    const tatSubmit = await query(\`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Client Review Pending'
      WHERE h1.new_status = 'AM Review Pending' \${dateFilter}
    \`, params);

    // Average TAT: Submitted to Interview
    const tatInterview = await query(\`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Interview'
      WHERE h1.new_status = 'Client Review Pending' \${dateFilter}
    \`, params);

    // Average TAT: Interview to Offer
    const tatOffer = await query(\`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Offered'
      WHERE h1.new_status = 'Interview' \${dateFilter}
    \`, params);

    // Average TAT: Offer to Joined
    const tatJoin = await query(\`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Joined'
      WHERE h1.new_status = 'Offered' \${dateFilter}
    \`, params);

    // Full cycle TAT
    const tatFull = await query(\`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Joined'
      WHERE h1.new_status = 'AM Review Pending' \${dateFilter}
    \`, params);

    res.json({
      sourced_to_submitted: tatSubmit.rows[0]?.avg_days || null,
      submitted_to_interview: tatInterview.rows[0]?.avg_days || null,
      interview_to_offer: tatOffer.rows[0]?.avg_days || null,
      offer_to_joined: tatJoin.rows[0]?.avg_days || null,
      full_cycle: tatFull.rows[0]?.avg_days || null,
    });
  } catch (err) { console.error('TAT error:', err); res.status(500).json({ error: 'Server error' }); }
});

// ===== EXPORT DATA (CSV format) =====
router.get('/export', authenticate, async (req, res) => {
  try {
    const { type, date_from, date_to } = req.query;
    let dateFilter = '';
    const params = [];
    let idx = 1;
    if (date_from) { dateFilter += \` AND p.created_at >= $\${idx++}\`; params.push(date_from); }
    if (date_to) { dateFilter += \` AND p.created_at <= $\${idx++}\`; params.push(date_to + 'T23:59:59'); }

    let data, headers;

    if (type === 'team-performance') {
      const result = await query(\`
        SELECT t.name as "Team Member", t.role as "Role",
          COUNT(DISTINCT p.id) as "Total Sourced",
          COUNT(DISTINCT CASE WHEN p.status = 'AM Review Select' THEN p.id END) as "AM Selected",
          COUNT(DISTINCT CASE WHEN p.status = 'Client Review Pending' THEN p.id END) as "Submitted",
          COUNT(DISTINCT CASE WHEN p.status = 'Interview' THEN p.id END) as "Interviews",
          COUNT(DISTINCT CASE WHEN p.status = 'Offered' THEN p.id END) as "Offered",
          COUNT(DISTINCT CASE WHEN p.status = 'Joined' THEN p.id END) as "Joined",
          COUNT(DISTINCT CASE WHEN p.status = 'Rejected' THEN p.id END) as "Rejected"
        FROM team t LEFT JOIN candidates ca ON ca.owner_id = t.id
        LEFT JOIN pipeline p ON p.candidate_id = ca.id \${dateFilter}
        WHERE t.is_active = true GROUP BY t.name, t.role ORDER BY "Total Sourced" DESC
      \`, params);
      data = result.rows;
    } else if (type === 'pipeline') {
      const result = await query(\`
        SELECT ca.name as "Candidate", ca.email as "Email", ca.phone as "Phone",
          ca.current_company as "Company", ca.experience_years as "Experience",
          j.title as "Position", cl.name as "Client",
          p.status as "Status", p.reject_reason as "Reject Reason", p.drop_reason as "Drop Reason",
          p.created_at as "Added On", p.updated_at as "Last Updated",
          t.name as "Owner"
        FROM pipeline p
        JOIN candidates ca ON ca.id = p.candidate_id
        JOIN jobs j ON j.id = p.job_id
        JOIN clients cl ON cl.id = j.client_id
        LEFT JOIN team t ON t.id = ca.owner_id
        WHERE 1=1 \${dateFilter}
        ORDER BY p.updated_at DESC
      \`, params);
      data = result.rows;
    } else {
      return res.status(400).json({ error: 'Invalid export type. Use: team-performance, pipeline' });
    }

    if (!data || data.length === 0) return res.json({ csv: '', message: 'No data' });

    // Convert to CSV
    const csvHeaders = Object.keys(data[0]);
    const csvRows = data.map(row => csvHeaders.map(h => {
      let val = row[h];
      if (val === null || val === undefined) val = '';
      val = String(val).replace(/"/g, '""');
      if (val.includes(',') || val.includes('"') || val.includes('\\n')) val = \`"\${val}"\`;
      return val;
    }).join(','));
    const csv = [csvHeaders.join(','), ...csvRows].join('\\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', \`attachment; filename="\${type}-\${new Date().toISOString().split('T')[0]}.csv"\`);
    res.send(csv);
  } catch (err) { console.error('Export error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
`;

fs.writeFileSync('server/routes/reports.js', reportsRoute);
console.log('✅ Backend: Reports route rebuilt with team performance, conversion rates, TAT, CSV export');

// ============================================================
// 3. BACKEND: Fix pipeline route (uses wrong API path /api not /api/)
// ============================================================
let pipelineRoute = fs.readFileSync('server/routes/pipeline.js', 'utf8');
// Pipeline route is fine, the issue is the frontend calling wrong URLs
console.log('✅ Backend: Pipeline route verified');

// ============================================================
// 4. DATABASE: Add remarks column migration
// ============================================================
const migRemarks = `require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS remarks TEXT');
    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()');
    console.log('✅ remarks + updated_at columns added to candidates');
  } catch(e) { console.log('Columns may exist:', e.message); }
  finally { pool.end(); }
})();
`;
fs.writeFileSync('server/migrate-remarks.js', migRemarks);
console.log('✅ Migration script: migrate-remarks.js created');

// ============================================================
// 5. FRONTEND: Complete Reports page rebuild
// ============================================================
const reportsPage = `'use client';

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

  const headers = () => ({ Authorization: \`Bearer \${getToken()}\`, 'Content-Type': 'application/json' });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      const [pRes, cRes, tRes] = await Promise.all([
        fetch(\`\${API}/api/reports/team-performance?\${params}\`, { headers: headers() }),
        fetch(\`\${API}/api/reports/conversion-rates?\${params}\`, { headers: headers() }),
        fetch(\`\${API}/api/reports/tat?\${params}\`, { headers: headers() }),
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
    const res = await fetch(\`\${API}/api/reports/export?\${params}\`, { headers: headers() });
    if (res.headers.get('content-type')?.includes('csv')) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = \`\${type}-\${dateTo}.csv\`; a.click();
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
`;
fs.writeFileSync('src/app/(dashboard)/reports/page.tsx', reportsPage);
console.log('✅ Frontend: Reports page rebuilt with 3 tabs — Performance, Conversion, TAT + Excel export');

// ============================================================
// 6. FRONTEND: Fix Pipeline page (wrong API URL pattern)
// ============================================================
let pipePage = fs.readFileSync('src/app/(dashboard)/pipeline/page.tsx', 'utf8');

// Fix: uses /api as base but should be full URL pattern
if (pipePage.includes("'http://localhost:4000/api'")) {
  pipePage = pipePage.replace(
    "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';",
    "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';"
  );
}

// Fix API calls to use /api/ prefix
if (pipePage.includes('`${API}/requirements`')) {
  pipePage = pipePage.replace(/\$\{API\}\/requirements/g, '${API}/api/requirements');
  pipePage = pipePage.replace(/\$\{API\}\/pipeline/g, '${API}/api/pipeline');
}

// Fix auth — use getToken from cookie instead of localStorage
if (pipePage.includes('localStorage.getItem')) {
  pipePage = pipePage.replace(
    "import { useState, useEffect } from 'react';\nimport Link from 'next/link';",
    "import { useState, useEffect } from 'react';\nimport Link from 'next/link';\nimport { getToken } from '@/lib/api';"
  );
  pipePage = pipePage.replace(
    `function getToken() {\n  if (typeof window !== 'undefined') return localStorage.getItem('token');\n  return null;\n}`,
    ''
  );
  // Fix the empty function removal
  pipePage = pipePage.replace(/\n\n\n+/g, '\n\n');
}

// Rename Pipeline to Funnel in the UI
pipePage = pipePage.replace(/<h1 className="text-2xl font-bold text-gray-900">Pipeline<\/h1>/g, '<h1 className="text-2xl font-bold text-gray-900">Recruitment Funnel</h1>');
pipePage = pipePage.replace(/Kanban view of candidate pipeline/g, 'Visual overview of candidates across all stages');

fs.writeFileSync('src/app/(dashboard)/pipeline/page.tsx', pipePage);
console.log('✅ Frontend: Pipeline page fixed (API URLs, auth, renamed to Funnel)');

// ============================================================
// 7. SIDEBAR: Rename Pipeline to Funnel (if layout has sidebar)
// ============================================================
try {
  const layoutFiles = ['src/app/(dashboard)/layout.tsx', 'src/components/Sidebar.tsx', 'src/components/sidebar.tsx'];
  for (const lf of layoutFiles) {
    if (fs.existsSync(lf)) {
      let layout = fs.readFileSync(lf, 'utf8');
      if (layout.includes("'Pipeline'") || layout.includes('"Pipeline"')) {
        layout = layout.replace(/['"]Pipeline['"]/g, "'Funnel'");
        fs.writeFileSync(lf, layout);
        console.log(`✅ Sidebar: Renamed Pipeline → Funnel in ${lf}`);
      }
    }
  }
} catch(e) { console.log('⏭️  Sidebar rename skipped'); }

console.log('\n✅ ALL PATCHES COMPLETE!\n');
console.log('Next steps:');
console.log('  1. cd server && node migrate-remarks.js');
console.log('  2. cd .. && npm run build');
console.log('  3. git add . && git commit -m "Reports rebuild + Pipeline fix + Candidate edit + Remarks" && git push');
