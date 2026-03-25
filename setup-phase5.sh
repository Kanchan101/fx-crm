#!/bin/bash
# FX CRM Phase 5 — Pipeline, Interviews, Reports, Dashboard
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-phase5.sh

set -e
echo "🚀 FX CRM Phase 5 — Pipeline + Interviews + Reports + Dashboard"
echo ""

# ========================
# BACKEND: server/routes/pipeline.js
# ========================
cat > server/routes/pipeline.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/pipeline — all pipeline entries with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, job_id, owner, search } = req.query;
    let sql = `
      SELECT p.*,
        ca.name as candidate_name, ca.email as candidate_email, ca.phone as candidate_phone,
        ca.location as candidate_location, ca.experience_years, ca.skills as candidate_skills,
        ca."current_role" as candidate_role, ca.current_company,
        ca.assessment_soft_skills, ca.assessment_stability, ca.assessment_technical, ca.assessment_experience,
        j.title as job_title, j.location as job_location, j.priority as job_priority,
        cl.name as client_name, cl.tier as client_tier,
        t.name as owner_name
      FROM pipeline p
      JOIN candidates ca ON ca.id = p.candidate_id
      JOIN jobs j ON j.id = p.job_id
      JOIN clients cl ON cl.id = j.client_id
      LEFT JOIN team t ON t.id = ca.owner_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status && status !== 'All') {
      sql += ` AND p.status = $${idx++}`;
      params.push(status);
    }
    if (job_id) {
      sql += ` AND p.job_id = $${idx++}`;
      params.push(job_id);
    }
    if (owner === 'mine') {
      sql += ` AND ca.owner_id = $${idx++}`;
      params.push(req.user.id);
    }
    if (search) {
      sql += ` AND (LOWER(ca.name) LIKE $${idx} OR LOWER(j.title) LIKE $${idx} OR LOWER(cl.name) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }

    sql += ' ORDER BY p.updated_at DESC';
    const result = await query(sql, params);
    res.json({ pipeline: result.rows });
  } catch (err) {
    console.error('List pipeline error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/pipeline/:id/status
router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'New','Screening','Submitted to Client','Client Review',
      'Interview Stage','HR Discussion','Offer','Joined','Not Joined','Account Manager Rejected'
    ];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const current = await query('SELECT * FROM pipeline WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });

    const old = current.rows[0].status;
    await query('UPDATE pipeline SET status=$1, updated_by=$2, updated_at=NOW() WHERE id=$3', [status, req.user.id, req.params.id]);

    await query(
      'INSERT INTO candidate_status_history (pipeline_id, candidate_id, job_id, old_status, new_status, changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.params.id, current.rows[0].candidate_id, current.rows[0].job_id, old, status, req.user.id]
    );

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'STATUS_CHANGE', 'pipeline', req.params.id, JSON.stringify({ from: old, to: status })]
    );

    res.json({ message: 'Updated', old_status: old, new_status: status });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/pipeline.js"

# ========================
# BACKEND: server/routes/interviews.js
# ========================
cat > server/routes/interviews.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, scheduled_by } = req.query;
    let sql = `
      SELECT i.*,
        ca.name as candidate_name, ca.phone as candidate_phone, ca.email as candidate_email,
        j.title as job_title, cl.name as client_name,
        t.name as scheduled_by_name
      FROM interviews i
      JOIN candidates ca ON ca.id = i.candidate_id
      JOIN jobs j ON j.id = i.job_id
      JOIN clients cl ON cl.id = j.client_id
      LEFT JOIN team t ON t.id = i.scheduled_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (date_from) { sql += ` AND i.interview_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND i.interview_date <= $${idx++}`; params.push(date_to); }
    if (scheduled_by) { sql += ` AND i.scheduled_by = $${idx++}`; params.push(scheduled_by); }

    sql += ' ORDER BY i.interview_date ASC, i.interview_time ASC';
    const result = await query(sql, params);
    res.json({ interviews: result.rows });
  } catch (err) {
    console.error('List interviews error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { candidate_id, job_id, pipeline_id, interview_date, interview_time, type, mode, interviewer_name, meeting_link, notes } = req.body;
    if (!candidate_id || !job_id || !interview_date) return res.status(400).json({ error: 'Candidate, job, and date required' });

    const result = await query(
      `INSERT INTO interviews (candidate_id, job_id, pipeline_id, interview_date, interview_time, type, mode, interviewer_name, meeting_link, notes, outcome, scheduled_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Scheduled',$11) RETURNING *`,
      [candidate_id, job_id, pipeline_id || null, interview_date, interview_time || null, type, mode, interviewer_name, meeting_link, notes, req.user.id]
    );

    res.status(201).json({ interview: result.rows[0] });
  } catch (err) {
    console.error('Create interview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { outcome, notes } = req.body;
    const result = await query(
      'UPDATE interviews SET outcome=$1, notes=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [outcome, notes, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ interview: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/interviews.js"

# ========================
# BACKEND: server/routes/reports.js
# ========================
cat > server/routes/reports.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/daily-sourcing', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, team_member_id } = req.query;
    let sql = `SELECT * FROM daily_sourcing_report WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (date_from) { sql += ` AND report_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND report_date <= $${idx++}`; params.push(date_to); }
    if (team_member_id) { sql += ` AND team_member_id = $${idx++}`; params.push(team_member_id); }
    sql += ' ORDER BY report_date DESC, candidates_submitted DESC';
    const result = await query(sql, params);
    res.json({ report: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/daily-interviews', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, team_member_id } = req.query;
    let sql = `SELECT * FROM daily_interview_report WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (date_from) { sql += ` AND report_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND report_date <= $${idx++}`; params.push(date_to); }
    if (team_member_id) { sql += ` AND team_member_id = $${idx++}`; params.push(team_member_id); }
    sql += ' ORDER BY report_date DESC, interviews_count DESC';
    const result = await query(sql, params);
    res.json({ report: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard-stats', authenticate, async (req, res) => {
  try {
    const [jobs, candidates, clients, interviews, submitted, placements] = await Promise.all([
      query("SELECT COUNT(*) as count FROM jobs WHERE status='Open'"),
      query("SELECT COUNT(*) as count FROM candidates"),
      query("SELECT COUNT(*) as count FROM clients WHERE status='Active'"),
      query("SELECT COUNT(*) as count FROM interviews WHERE interview_date = CURRENT_DATE"),
      query("SELECT COUNT(*) as count FROM candidate_status_history WHERE new_status='Submitted to Client' AND created_at >= DATE_TRUNC('week', NOW())"),
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
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/recent-activity', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*, t.name as user_name FROM activity_log al
       LEFT JOIN team t ON t.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 20`
    );
    res.json({ activities: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/reports.js"

# ========================
# BACKEND: Update server/index.js with all routes
# ========================
cat > server/index.js << 'ENDOFFILE'
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const teamRoutes = require('./routes/team');
const requirementRoutes = require('./routes/requirements');
const candidateRoutes = require('./routes/candidates');
const pipelineRoutes = require('./routes/pipeline');
const interviewRoutes = require('./routes/interviews');
const reportRoutes = require('./routes/reports');
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(morgan('combined'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const allowedOrigins = [
  'http://localhost:3000',
  'https://crm.fxconsulting.in',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) callback(null, true);
    else callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: 'Too many login attempts, try again later' },
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/clients', authenticate, clientRoutes);
app.use('/api/team', authenticate, teamRoutes);
app.use('/api/requirements', authenticate, requirementRoutes);
app.use('/api/candidates', authenticate, candidateRoutes);
app.use('/api/pipeline', authenticate, pipelineRoutes);
app.use('/api/interviews', authenticate, interviewRoutes);
app.use('/api/reports', authenticate, reportRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => { console.log(`FX CRM API running on port ${PORT}`); });
ENDOFFILE
echo "✅ server/index.js (all routes mounted)"

# ========================
# FRONTEND: Pipeline Kanban page
# ========================
cat > "src/app/(dashboard)/pipeline/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import { Kanban, Search, MapPin, Building2, User, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const STATUSES = ['New','Screening','Submitted to Client','Client Review','Interview Stage','HR Discussion','Offer','Joined','Not Joined','Account Manager Rejected'];
const SHORT_LABELS: Record<string, string> = {
  'New':'New','Screening':'Screening','Submitted to Client':'Submitted','Client Review':'Client Review',
  'Interview Stage':'Interview','HR Discussion':'HR','Offer':'Offer','Joined':'Joined','Not Joined':'Not Joined','Account Manager Rejected':'AM Rejected'
};
const COL_COLORS: Record<string, string> = {
  'New':'border-t-gray-400','Screening':'border-t-blue-400','Submitted to Client':'border-t-indigo-400',
  'Client Review':'border-t-purple-400','Interview Stage':'border-t-orange-400','HR Discussion':'border-t-amber-400',
  'Offer':'border-t-emerald-400','Joined':'border-t-green-500','Not Joined':'border-t-red-400','Account Manager Rejected':'border-t-rose-500'
};

interface PipelineEntry {
  id: string; status: string; candidate_name: string; candidate_location: string;
  experience_years: number; candidate_role: string; current_company: string;
  job_title: string; client_name: string; client_tier: string; job_priority: string;
  ai_match_percent: number; owner_name: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
}

export default function PipelinePage() {
  const { user } = useAuth();
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchPipeline = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ownerFilter === 'mine') params.set('owner', 'mine');
      const res = await fetch(`${API}/api/pipeline?${params}`, { headers: headers() });
      const data = await res.json();
      setPipeline(data.pipeline || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, ownerFilter]);

  useEffect(() => { fetchPipeline(); }, [fetchPipeline]);

  const changeStatus = async (id: string, status: string) => {
    try {
      await fetch(`${API}/api/pipeline/${id}/status`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ status }),
      });
      fetchPipeline();
    } catch (err) { console.error(err); }
  };

  const avgScore = (e: PipelineEntry) => {
    const s = [e.assessment_soft_skills, e.assessment_stability, e.assessment_technical, e.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a,b) => a+b, 0) / s.length).toFixed(1) : null;
  };

  const columns = STATUSES.map(s => ({ status: s, entries: pipeline.filter(p => p.status === s) }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{pipeline.length} candidate{pipeline.length !== 1 ? 's' : ''} in pipeline</p>
        <button onClick={() => setOwnerFilter(ownerFilter === 'mine' ? 'all' : 'mine')}
          className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            ownerFilter === 'mine' ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200')}>
          {ownerFilter === 'mine' ? 'My Pipeline' : 'All Pipeline'}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search candidate, job, client..."
          className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : pipeline.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Kanban className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Pipeline is empty</p>
          <p className="text-gray-400 text-xs mt-1">Add candidates to positions to see them here</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map(({ status, entries }) => (
            <div key={status} className="min-w-[220px] w-[220px] shrink-0">
              <div className={clsx('bg-white rounded-t-lg px-3 py-2 border border-b-0 border-gray-100 border-t-[3px]', COL_COLORS[status])}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">{SHORT_LABELS[status]}</span>
                  <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded-full text-gray-500 font-medium">{entries.length}</span>
                </div>
              </div>
              <div className="bg-gray-50/50 rounded-b-lg border border-t-0 border-gray-100 p-2 space-y-2 min-h-[120px]">
                {entries.map((e) => (
                  <div key={e.id} className="bg-white rounded-lg border border-gray-100 p-3 hover:shadow-sm transition-shadow">
                    <p className="text-xs font-semibold text-gray-900 truncate">{e.candidate_name}</p>
                    <p className="text-[10px] text-gray-400 truncate mt-0.5">{e.job_title} · {e.client_name}</p>
                    <div className="flex items-center gap-2 mt-1.5 text-[10px] text-gray-400">
                      {e.experience_years && <span>{e.experience_years}y</span>}
                      {e.candidate_location && <span>{e.candidate_location}</span>}
                    </div>
                    {e.ai_match_percent && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className={clsx('h-full rounded-full', e.ai_match_percent >= 70 ? 'bg-emerald-500' : e.ai_match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                            style={{ width: `${e.ai_match_percent}%` }} />
                        </div>
                        <span className="text-[10px] font-medium text-gray-500">{e.ai_match_percent}%</span>
                      </div>
                    )}
                    {avgScore(e) && <p className="text-[10px] text-gray-400 mt-1">Score: {avgScore(e)}/10</p>}
                    <p className="text-[10px] text-gray-300 mt-1">{e.owner_name}</p>
                    <select value={e.status} onChange={(ev) => changeStatus(e.id, ev.target.value)}
                      className="mt-2 w-full text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600">
                      {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/pipeline/page.tsx"

# ========================
# FRONTEND: Interviews page
# ========================
cat > "src/app/(dashboard)/interviews/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { getToken } from '@/lib/api';
import { Calendar, Plus, X, Video, MapPin, Clock, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Interview {
  id: string; candidate_name: string; candidate_phone: string; candidate_email: string;
  job_title: string; client_name: string; interview_date: string; interview_time: string;
  type: string; mode: string; interviewer_name: string; meeting_link: string;
  notes: string; outcome: string; scheduled_by_name: string;
}

const OUTCOMES = ['Scheduled','Completed','Cancelled','No Show','Passed','Failed'];

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + 1);
    return d.toISOString().split('T')[0];
  });

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchInterviews = useCallback(async () => {
    try {
      setLoading(true);
      const start = new Date(weekStart);
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const params = new URLSearchParams({ date_from: weekStart, date_to: end.toISOString().split('T')[0] });
      const res = await fetch(`${API}/api/interviews?${params}`, { headers: headers() });
      const data = await res.json();
      setInterviews(data.interviews || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [weekStart]);

  useEffect(() => { fetchInterviews(); }, [fetchInterviews]);

  const changeWeek = (dir: number) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + (dir * 7));
    setWeekStart(d.toISOString().split('T')[0]);
  };

  const updateOutcome = async (id: string, outcome: string) => {
    try {
      await fetch(`${API}/api/interviews/${id}`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ outcome }),
      });
      fetchInterviews();
    } catch (err) { console.error(err); }
  };

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i);
    return { date: d.toISOString().split('T')[0], label: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }), isToday: d.toDateString() === new Date().toDateString() };
  });

  const outcomeColor = (o: string) => {
    const m: Record<string, string> = { Scheduled: 'bg-blue-100 text-blue-700', Completed: 'bg-gray-100 text-gray-600', Passed: 'bg-emerald-100 text-emerald-700', Failed: 'bg-red-100 text-red-700', Cancelled: 'bg-yellow-100 text-yellow-700', 'No Show': 'bg-orange-100 text-orange-700' };
    return m[o] || 'bg-gray-100 text-gray-600';
  };

  const weekLabel = () => {
    const s = new Date(weekStart);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return `${s.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} — ${e.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{interviews.length} interview{interviews.length !== 1 ? 's' : ''} this week</p>
        <div className="flex items-center gap-2">
          <button onClick={() => changeWeek(-1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
            <ChevronLeft className="w-4 h-4 text-gray-500" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[200px] text-center">{weekLabel()}</span>
          <button onClick={() => changeWeek(1)} className="w-8 h-8 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-3">
          {weekDays.map(({ date, label, isToday }) => {
            const dayInterviews = interviews.filter(i => i.interview_date?.split('T')[0] === date);
            return (
              <div key={date} className={clsx('rounded-xl border min-h-[200px]', isToday ? 'border-fx-300 bg-fx-50/30' : 'border-gray-100 bg-white')}>
                <div className={clsx('px-3 py-2 border-b text-center', isToday ? 'border-fx-200 bg-fx-50' : 'border-gray-50')}>
                  <p className={clsx('text-xs font-medium', isToday ? 'text-fx-700' : 'text-gray-500')}>{label}</p>
                </div>
                <div className="p-2 space-y-2">
                  {dayInterviews.map((iv) => (
                    <div key={iv.id} className="bg-white rounded-lg border border-gray-100 p-2.5 text-xs">
                      <p className="font-semibold text-gray-900 truncate">{iv.candidate_name}</p>
                      <p className="text-gray-400 truncate">{iv.job_title} · {iv.client_name}</p>
                      {iv.interview_time && (
                        <p className="text-gray-500 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{iv.interview_time.substring(0, 5)}
                        </p>
                      )}
                      {iv.mode && (
                        <p className="text-gray-400 mt-0.5 flex items-center gap-1">
                          {iv.mode === 'Google Meet' ? <Video className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}{iv.mode}
                        </p>
                      )}
                      <div className="mt-1.5">
                        <select value={iv.outcome || 'Scheduled'} onChange={(e) => updateOutcome(iv.id, e.target.value)}
                          className={clsx('w-full text-[10px] px-1.5 py-0.5 rounded font-medium border-0', outcomeColor(iv.outcome))}>
                          {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {dayInterviews.length === 0 && (
                    <p className="text-[10px] text-gray-300 text-center py-6">No interviews</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/interviews/page.tsx"

# ========================
# FRONTEND: Reports page
# ========================
cat > "src/app/(dashboard)/reports/page.tsx" << 'ENDOFFILE'
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
ENDOFFILE
echo "✅ src/app/(dashboard)/reports/page.tsx"

# ========================
# FRONTEND: Dashboard — live stats
# ========================
cat > "src/app/(dashboard)/dashboard/page.tsx" << 'ENDOFFILE'
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
ENDOFFILE
echo "✅ src/app/(dashboard)/dashboard/page.tsx (live stats)"

echo ""
echo "=========================================="
echo "🎉 Phase 5 setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Restart backend: cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo "  2. Test: Dashboard → live stats from DB"
echo "  3. Test: Pipeline → Kanban board with status changes"
echo "  4. Test: Interviews → weekly calendar view"
echo "  5. Test: Reports → sourcing & interview reports with bar charts"
echo "  6. Deploy: git add . && git commit -m 'Phase 5: Pipeline + Interviews + Reports' && git push"
echo ""
