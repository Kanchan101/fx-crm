#!/bin/bash
# FX CRM Phase 3 — Requirements Module
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-phase3.sh

set -e
echo "🚀 FX CRM Phase 3 — Requirements Module"
echo ""

# ========================
# BACKEND: server/routes/requirements.js
# ========================
cat > server/routes/requirements.js << 'ENDOFFILE'
const express = require('express');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/requirements — list with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, priority, client_id, search, my_positions, sort_by, sort_order } = req.query;
    let sql = `
      SELECT j.*,
        c.name as client_name, c.tier as client_tier, c.location as client_location,
        c.domain as client_domain, c.fee_percent as client_fee_percent,
        c.spoc_name as client_spoc,
        (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id) as total_candidates,
        (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id AND p.status NOT IN ('Account Manager Rejected','Not Joined')) as active_candidates,
        (SELECT COUNT(*) FROM job_assignments ja WHERE ja.job_id = j.id) as assigned_count,
        t.name as created_by_name
      FROM jobs j
      JOIN clients c ON c.id = j.client_id
      LEFT JOIN team t ON t.id = j.created_by
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;

    if (status && status !== 'All') {
      sql += ` AND j.status = $${idx++}`;
      params.push(status);
    }
    if (priority && priority !== 'All') {
      sql += ` AND j.priority = $${idx++}`;
      params.push(priority);
    }
    if (client_id) {
      sql += ` AND j.client_id = $${idx++}`;
      params.push(client_id);
    }
    if (search) {
      sql += ` AND (LOWER(j.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx} OR LOWER(j.location) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`);
      idx++;
    }
    if (my_positions === 'true') {
      sql += ` AND EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = j.id AND ja.team_member_id = $${idx++})`;
      params.push(req.user.id);
    }

    const validSorts = ['title', 'priority', 'status', 'created_at', 'deadline'];
    const sortCol = validSorts.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY j.${sortCol} ${sortDir}`;

    const result = await query(sql, params);

    // Get assignments for each job
    const jobIds = result.rows.map(r => r.id);
    let assignments = [];
    if (jobIds.length > 0) {
      const assignResult = await query(
        `SELECT ja.job_id, ja.team_member_id, t.name, t.role, t.email
         FROM job_assignments ja JOIN team t ON t.id = ja.team_member_id
         WHERE ja.job_id = ANY($1)`,
        [jobIds]
      );
      assignments = assignResult.rows;
    }

    const jobs = result.rows.map(job => ({
      ...job,
      assigned_team: assignments.filter(a => a.job_id === job.id),
    }));

    res.json({ requirements: jobs, total: jobs.length });
  } catch (err) {
    console.error('List requirements error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/requirements/:id — single requirement with pipeline + assignments
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT j.*,
        c.name as client_name, c.tier as client_tier, c.location as client_location,
        c.domain as client_domain, c.fee_percent as client_fee_percent,
        c.spoc_name as client_spoc, c.spoc_email as client_spoc_email,
        c.spoc_phone as client_spoc_phone, c.industry as client_industry,
        t.name as created_by_name
       FROM jobs j
       JOIN clients c ON c.id = j.client_id
       LEFT JOIN team t ON t.id = j.created_by
       WHERE j.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Requirement not found' });

    // Get assignments
    const assignments = await query(
      `SELECT ja.team_member_id, t.name, t.role, t.email, ja.assigned_at
       FROM job_assignments ja JOIN team t ON t.id = ja.team_member_id
       WHERE ja.job_id = $1 ORDER BY ja.assigned_at`,
      [req.params.id]
    );

    // Get pipeline candidates
    const pipeline = await query(
      `SELECT p.*, ca.name as candidate_name, ca.email as candidate_email,
        ca.phone as candidate_phone, ca.location as candidate_location,
        ca.experience_years, ca.skills as candidate_skills,
        ca."current_role" as candidate_current_role, ca.current_company as candidate_company,
        ca.assessment_soft_skills, ca.assessment_stability,
        ca.assessment_technical, ca.assessment_experience,
        t.name as owner_name
       FROM pipeline p
       JOIN candidates ca ON ca.id = p.candidate_id
       LEFT JOIN team t ON t.id = ca.owner_id
       WHERE p.job_id = $1
       ORDER BY p.updated_at DESC`,
      [req.params.id]
    );

    res.json({
      requirement: result.rows[0],
      assigned_team: assignments.rows,
      pipeline: pipeline.rows,
    });
  } catch (err) {
    console.error('Get requirement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/requirements — create (AM + Super Admin)
router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const {
      title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max,
      description, skills, priority, deadline, positions_count, internal_notes,
      assigned_team_ids
    } = req.body;

    if (!title || !client_id) return res.status(400).json({ error: 'Title and client are required' });

    const result = await transaction(async (client) => {
      const jobResult = await client.query(
        `INSERT INTO jobs (title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max,
          description, skills, priority, deadline, positions_count, internal_notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [title, client_id, location, type || 'Full Time',
         ctc_min || 0, ctc_max || 0, exp_min || 0, exp_max || 0,
         description, skills, priority || 'Medium', deadline || null,
         positions_count || 1, internal_notes, req.user.id]
      );

      const job = jobResult.rows[0];

      // Assign team members
      if (assigned_team_ids && assigned_team_ids.length > 0) {
        for (const memberId of assigned_team_ids) {
          await client.query(
            'INSERT INTO job_assignments (job_id, team_member_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [job.id, memberId, req.user.id]
          );
        }
      }

      await client.query(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, 'CREATE', 'requirement', job.id, JSON.stringify({ title, assigned: assigned_team_ids?.length || 0 })]
      );

      return job;
    });

    res.status(201).json({ requirement: result });
  } catch (err) {
    console.error('Create requirement error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/requirements/:id — update
router.put('/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const {
      title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max,
      description, skills, priority, deadline, positions_count, status, internal_notes,
      assigned_team_ids
    } = req.body;

    const result = await transaction(async (client) => {
      const jobResult = await client.query(
        `UPDATE jobs SET
          title=$1, client_id=$2, location=$3, type=$4, ctc_min=$5, ctc_max=$6,
          exp_min=$7, exp_max=$8, description=$9, skills=$10, priority=$11,
          deadline=$12, positions_count=$13, status=$14, internal_notes=$15, updated_at=NOW()
         WHERE id=$16 RETURNING *`,
        [title, client_id, location, type, ctc_min || 0, ctc_max || 0,
         exp_min || 0, exp_max || 0, description, skills, priority,
         deadline || null, positions_count || 1, status || 'Open', internal_notes, req.params.id]
      );

      if (jobResult.rows.length === 0) throw new Error('Not found');

      // Re-assign team
      if (assigned_team_ids !== undefined) {
        await client.query('DELETE FROM job_assignments WHERE job_id = $1', [req.params.id]);
        for (const memberId of assigned_team_ids) {
          await client.query(
            'INSERT INTO job_assignments (job_id, team_member_id, assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [req.params.id, memberId, req.user.id]
          );
        }
      }

      await client.query(
        'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
        [req.user.id, 'UPDATE', 'requirement', req.params.id, JSON.stringify({ title })]
      );

      return jobResult.rows[0];
    });

    res.json({ requirement: result });
  } catch (err) {
    console.error('Update requirement error:', err);
    if (err.message === 'Not found') return res.status(404).json({ error: 'Requirement not found' });
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/requirements/:id/pipeline/:pipelineId/status — update candidate status in pipeline
router.patch('/:id/pipeline/:pipelineId/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'New', 'Screening', 'Submitted to Client', 'Client Review',
      'Interview Stage', 'HR Discussion', 'Offer', 'Joined',
      'Not Joined', 'Account Manager Rejected'
    ];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const current = await query('SELECT * FROM pipeline WHERE id = $1 AND job_id = $2', [req.params.pipelineId, req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Pipeline entry not found' });

    const oldStatus = current.rows[0].status;

    await query('UPDATE pipeline SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3', [status, req.user.id, req.params.pipelineId]);

    await query(
      `INSERT INTO candidate_status_history (pipeline_id, candidate_id, job_id, old_status, new_status, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.pipelineId, current.rows[0].candidate_id, req.params.id, oldStatus, status, req.user.id]
    );

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'STATUS_CHANGE', 'pipeline', req.params.pipelineId, JSON.stringify({ from: oldStatus, to: status })]
    );

    res.json({ message: 'Status updated', old_status: oldStatus, new_status: status });
  } catch (err) {
    console.error('Update pipeline status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/requirements.js"

# ========================
# BACKEND: Update server/index.js to mount requirements
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

// Future routes:
// app.use('/api/candidates', authenticate, candidateRoutes);
// app.use('/api/pipeline', authenticate, pipelineRoutes);
// app.use('/api/interviews', authenticate, interviewRoutes);
// app.use('/api/reports', authenticate, reportRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => { console.log(`FX CRM API running on port ${PORT}`); });
ENDOFFILE
echo "✅ server/index.js (added requirements route)"

# ========================
# FRONTEND: Requirements list page
# ========================
cat > "src/app/(dashboard)/requirements/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  Briefcase, Plus, Search, MapPin, Users, Clock, ChevronRight,
  X, Filter, Building2, AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';

interface Requirement {
  id: string;
  title: string;
  client_id: string;
  client_name: string;
  client_tier: string;
  client_domain: string;
  location: string;
  type: string;
  ctc_min: number;
  ctc_max: number;
  exp_min: number;
  exp_max: number;
  description: string;
  skills: string;
  priority: string;
  deadline: string;
  positions_count: number;
  status: string;
  internal_notes: string;
  total_candidates: number;
  active_candidates: number;
  assigned_count: number;
  assigned_team: { team_member_id: string; name: string; role: string }[];
  created_at: string;
}

interface Client { id: string; name: string; }
interface TeamMember { id: string; name: string; role: string; email: string; }

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const STATUSES = ['Open', 'On Hold', 'Closed', 'Filled'];
const JOB_TYPES = ['Full Time', 'Part Time', 'Contract', 'Freelance'];

const emptyForm = {
  title: '', client_id: '', location: '', type: 'Full Time',
  ctc_min: '', ctc_max: '', exp_min: '', exp_max: '',
  description: '', skills: '', priority: 'Medium', deadline: '',
  positions_count: '1', status: 'Open', internal_notes: '',
  assigned_team_ids: [] as string[],
};

export default function RequirementsPage() {
  const router = useRouter();
  const { user, isRole } = useAuth();
  const canEdit = isRole('Super Admin', 'Account Manager');

  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [myPositions, setMyPositions] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingReq, setEditingReq] = useState<Requirement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchRequirements = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus !== 'All') params.set('status', filterStatus);
      if (filterPriority !== 'All') params.set('priority', filterPriority);
      if (myPositions) params.set('my_positions', 'true');
      const data = await api.requirements.list(params.toString());
      setRequirements(data.requirements);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, filterStatus, filterPriority, myPositions]);

  const fetchMeta = useCallback(async () => {
    try {
      const [clientData, teamData] = await Promise.all([
        api.clients.list(''),
        api.team.list(),
      ]);
      setClients(clientData.clients);
      setTeamMembers(teamData.team);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);
  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const openAdd = () => {
    setEditingReq(null);
    setForm(emptyForm);
    setError('');
    setShowModal(true);
  };

  const openEdit = (req: Requirement) => {
    setEditingReq(req);
    setForm({
      title: req.title, client_id: req.client_id, location: req.location,
      type: req.type, ctc_min: String(req.ctc_min || ''), ctc_max: String(req.ctc_max || ''),
      exp_min: String(req.exp_min || ''), exp_max: String(req.exp_max || ''),
      description: req.description || '', skills: req.skills || '',
      priority: req.priority, deadline: req.deadline ? req.deadline.split('T')[0] : '',
      positions_count: String(req.positions_count || 1), status: req.status,
      internal_notes: req.internal_notes || '',
      assigned_team_ids: req.assigned_team?.map(a => a.team_member_id) || [],
    });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { setError('Title is required'); return; }
    if (!form.client_id) { setError('Client is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        ctc_min: parseFloat(form.ctc_min) || 0,
        ctc_max: parseFloat(form.ctc_max) || 0,
        exp_min: parseInt(form.exp_min) || 0,
        exp_max: parseInt(form.exp_max) || 0,
        positions_count: parseInt(form.positions_count) || 1,
      };
      if (editingReq) {
        await api.requirements.update(editingReq.id, payload);
      } else {
        await api.requirements.create(payload);
      }
      setShowModal(false);
      fetchRequirements();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const toggleAssignment = (id: string) => {
    setForm(f => ({
      ...f,
      assigned_team_ids: f.assigned_team_ids.includes(id)
        ? f.assigned_team_ids.filter(x => x !== id)
        : [...f.assigned_team_ids, id],
    }));
  };

  const priorityColor = (p: string) => {
    const map: Record<string, string> = { Critical: 'badge-critical', High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' };
    return map[p] || 'badge-medium';
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = { Open: 'badge-open', 'On Hold': 'badge-onhold', Closed: 'badge-closed', Filled: 'badge-closed' };
    return map[s] || 'badge-closed';
  };

  const formatCTC = (min: number, max: number) => {
    if (!min && !max) return '—';
    const fmt = (n: number) => n >= 100000 ? `${(n/100000).toFixed(1)}L` : `${n}`;
    if (min && max) return `${fmt(min)} - ${fmt(max)}`;
    if (max) return `Up to ${fmt(max)}`;
    return `${fmt(min)}+`;
  };

  // Count by status
  const openCount = requirements.filter(r => r.status === 'Open').length;
  const totalCount = requirements.length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">{totalCount} position{totalCount !== 1 ? 's' : ''} · {openCount} open</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setMyPositions(!myPositions)}
            className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
              myPositions ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300')}>
            {myPositions ? 'My Positions' : 'All Positions'}
          </button>
          {canEdit && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" /> Add Requirement
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, client, location..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="All">All Status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
          <option value="All">All Priority</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Requirements list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : requirements.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No requirements found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requirements.map((req) => (
            <div key={req.id}
              className="bg-white rounded-xl border border-gray-100 hover:shadow-md hover:border-gray-200 transition-all cursor-pointer group"
              onClick={() => router.push(`/requirements/${req.id}`)}>
              <div className="p-5 flex items-center gap-4">
                {/* Priority indicator */}
                <div className={clsx('w-1 h-14 rounded-full shrink-0',
                  req.priority === 'Critical' ? 'bg-red-500' : req.priority === 'High' ? 'bg-orange-400' :
                  req.priority === 'Medium' ? 'bg-blue-400' : 'bg-green-400')} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-fx-700 transition-colors">{req.title}</h3>
                    <span className={clsx('badge', priorityColor(req.priority))}>{req.priority}</span>
                    <span className={clsx('badge', statusColor(req.status))}>{req.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{req.client_name}</span>
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{req.location || '—'}</span>
                    <span>Exp: {req.exp_min}-{req.exp_max} yrs</span>
                    <span>CTC: {formatCTC(req.ctc_min, req.ctc_max)}</span>
                    {req.deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(req.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{req.active_candidates}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-gray-900">{req.assigned_count}</p>
                    <p className="text-[10px] text-gray-400 uppercase">Assigned</p>
                  </div>

                  {/* Assigned avatars */}
                  {req.assigned_team && req.assigned_team.length > 0 && (
                    <div className="flex -space-x-2">
                      {req.assigned_team.slice(0, 3).map((m, i) => (
                        <div key={m.team_member_id} title={m.name}
                          className="w-7 h-7 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-[10px] font-medium border-2 border-white">
                          {m.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                        </div>
                      ))}
                      {req.assigned_team.length > 3 && (
                        <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium border-2 border-white">
                          +{req.assigned_team.length - 3}
                        </div>
                      )}
                    </div>
                  )}

                  {canEdit && (
                    <button onClick={(e) => { e.stopPropagation(); openEdit(req); }}
                      className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                  )}

                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
                </div>
              </div>

              {/* Skills bar */}
              {req.skills && (
                <div className="px-5 pb-3 flex flex-wrap gap-1.5">
                  {req.skills.split(',').slice(0, 6).map((skill, i) => (
                    <span key={i} className="px-2 py-0.5 bg-gray-50 text-gray-500 rounded text-[10px]">{skill.trim()}</span>
                  ))}
                  {req.skills.split(',').length > 6 && (
                    <span className="px-2 py-0.5 text-gray-400 text-[10px]">+{req.skills.split(',').length - 6} more</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-2xl my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-semibold text-gray-900">{editingReq ? 'Edit Requirement' : 'Add Requirement'}</h2>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Job Title *</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Sr. Service Engineer" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Client *</label>
                  <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="">Select client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                  <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="e.g. Mumbai" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Positions</label>
                  <input type="number" value={form.positions_count} onChange={(e) => setForm({ ...form, positions_count: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" min="1" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTC Min (LPA)</label>
                  <input type="number" value={form.ctc_min} onChange={(e) => setForm({ ...form, ctc_min: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">CTC Max (LPA)</label>
                  <input type="number" value={form.ctc_max} onChange={(e) => setForm({ ...form, ctc_max: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Exp Min (yrs)</label>
                  <input type="number" value={form.exp_min} onChange={(e) => setForm({ ...form, exp_min: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Exp Max (yrs)</label>
                  <input type="number" value={form.exp_max} onChange={(e) => setForm({ ...form, exp_max: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Deadline</label>
                  <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>

              {editingReq && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Skills (comma separated)</label>
                <input type="text" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Java, Spring Boot, Microservices" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Job Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={4} placeholder="Full job description..." />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Internal Notes</label>
                <textarea value={form.internal_notes} onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} />
              </div>

              {/* Team Assignment */}
              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assign Team Members</p>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {teamMembers.filter(m => m.is_active !== false).map((member) => (
                    <button key={member.id} type="button"
                      onClick={() => toggleAssignment(member.id)}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm text-left transition-all',
                        form.assigned_team_ids.includes(member.id)
                          ? 'border-fx-500 bg-fx-50 text-fx-700'
                          : 'border-gray-100 hover:border-gray-200 text-gray-600'
                      )}>
                      <div className={clsx('w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-medium shrink-0',
                        form.assigned_team_ids.includes(member.id) ? 'bg-fx-600 text-white' : 'bg-gray-100 text-gray-400')}>
                        {form.assigned_team_ids.includes(member.id) ? '✓' : member.name.split(' ').map(w => w[0]).join('').substring(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{member.name}</p>
                        <p className="text-[10px] text-gray-400">{member.role}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {form.assigned_team_ids.length > 0 && (
                  <p className="text-xs text-fx-600 mt-2">{form.assigned_team_ids.length} member{form.assigned_team_ids.length > 1 ? 's' : ''} selected</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
                {saving && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {editingReq ? 'Update' : 'Add Requirement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/requirements/page.tsx"

# ========================
# FRONTEND: Requirement detail page (with Kanban)
# ========================
mkdir -p "src/app/(dashboard)/requirements/[id]"
cat > "src/app/(dashboard)/requirements/[id]/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  ArrowLeft, Building2, MapPin, Clock, Users, Briefcase, Share2,
  Copy, ExternalLink, Mail, Phone, ChevronDown,
} from 'lucide-react';
import clsx from 'clsx';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const PIPELINE_STATUSES = [
  'New', 'Screening', 'Submitted to Client', 'Client Review',
  'Interview Stage', 'HR Discussion', 'Offer', 'Joined', 'Not Joined', 'Account Manager Rejected'
];

const STATUS_COLORS: Record<string, string> = {
  'New': 'bg-gray-100 border-gray-200',
  'Screening': 'bg-blue-50 border-blue-200',
  'Submitted to Client': 'bg-indigo-50 border-indigo-200',
  'Client Review': 'bg-purple-50 border-purple-200',
  'Interview Stage': 'bg-orange-50 border-orange-200',
  'HR Discussion': 'bg-amber-50 border-amber-200',
  'Offer': 'bg-emerald-50 border-emerald-200',
  'Joined': 'bg-green-50 border-green-200',
  'Not Joined': 'bg-red-50 border-red-200',
  'Account Manager Rejected': 'bg-rose-50 border-rose-200',
};

interface PipelineEntry {
  id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone: string;
  candidate_location: string;
  experience_years: number;
  candidate_skills: string;
  candidate_current_role: string;
  candidate_company: string;
  status: string;
  ai_match_percent: number;
  assessment_soft_skills: number;
  assessment_stability: number;
  assessment_technical: number;
  assessment_experience: number;
  owner_name: string;
}

export default function RequirementDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const [requirement, setRequirement] = useState<any>(null);
  const [assignedTeam, setAssignedTeam] = useState<any[]>([]);
  const [pipeline, setPipeline] = useState<PipelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJD, setShowJD] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      setLoading(true);
      const token = getToken();
      const res = await fetch(`${API_URL}/api/requirements/${params.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRequirement(data.requirement);
      setAssignedTeam(data.assigned_team || []);
      setPipeline(data.pipeline || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [params.id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const changeStatus = async (pipelineId: string, newStatus: string) => {
    try {
      const token = getToken();
      await fetch(`${API_URL}/api/requirements/${params.id}/pipeline/${pipelineId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      fetchDetail();
    } catch (err) { console.error(err); }
  };

  const copyJD = () => {
    if (!requirement) return;
    const text = `${requirement.title}\nClient: ${requirement.client_name}\nLocation: ${requirement.location}\nExperience: ${requirement.exp_min}-${requirement.exp_max} years\n\n${requirement.description || ''}\n\nSkills: ${requirement.skills || ''}`;
    navigator.clipboard.writeText(text);
    alert('JD copied to clipboard!');
  };

  const avgAssessment = (entry: PipelineEntry) => {
    const scores = [entry.assessment_soft_skills, entry.assessment_stability, entry.assessment_technical, entry.assessment_experience].filter(Boolean);
    if (scores.length === 0) return null;
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!requirement) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">Requirement not found</p>
        <button onClick={() => router.back()} className="text-fx-600 text-sm mt-2 hover:underline">Go back</button>
      </div>
    );
  }

  const priorityBg: Record<string, string> = { Critical: 'bg-red-500', High: 'bg-orange-400', Medium: 'bg-blue-400', Low: 'bg-green-400' };

  // Group pipeline by status for Kanban
  const kanbanColumns = PIPELINE_STATUSES.map(status => ({
    status,
    entries: pipeline.filter(p => p.status === status),
  })).filter(col => col.entries.length > 0 || ['New', 'Screening', 'Submitted to Client', 'Client Review', 'Interview Stage', 'Offer', 'Joined'].includes(col.status));

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/requirements')}
          className="w-8 h-8 rounded-lg bg-white border border-gray-200 hover:bg-gray-50 flex items-center justify-center transition-colors">
          <ArrowLeft className="w-4 h-4 text-gray-500" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">{requirement.title}</h1>
            <div className={clsx('w-2 h-2 rounded-full', priorityBg[requirement.priority])} title={requirement.priority} />
            <span className={clsx('badge', requirement.status === 'Open' ? 'badge-open' : 'badge-closed')}>{requirement.status}</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400 mt-0.5">
            <span className="flex items-center gap-1"><Building2 className="w-3 h-3" />{requirement.client_name} ({requirement.client_tier})</span>
            <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{requirement.location}</span>
            <span>Exp: {requirement.exp_min}-{requirement.exp_max} yrs</span>
            <span>{requirement.type}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyJD} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Copy className="w-3 h-3" /> Copy JD
          </button>
          <button onClick={() => setShowJD(!showJD)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <ChevronDown className={clsx('w-3 h-3 transition-transform', showJD && 'rotate-180')} /> {showJD ? 'Hide' : 'Show'} Details
          </button>
        </div>
      </div>

      {/* Expandable details */}
      {showJD && (
        <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">CTC Range</p>
              <p className="font-medium text-gray-800">{requirement.ctc_min || 0} - {requirement.ctc_max || 0} LPA</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Positions</p>
              <p className="font-medium text-gray-800">{requirement.positions_count}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Deadline</p>
              <p className="font-medium text-gray-800">{requirement.deadline ? new Date(requirement.deadline).toLocaleDateString('en-IN') : '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Client SPOC</p>
              <p className="font-medium text-gray-800">{requirement.client_spoc || '—'}</p>
              {requirement.client_spoc_email && <p className="text-xs text-gray-500">{requirement.client_spoc_email}</p>}
            </div>
          </div>

          {requirement.skills && (
            <div>
              <p className="text-xs text-gray-400 mb-2">Required Skills</p>
              <div className="flex flex-wrap gap-1.5">
                {requirement.skills.split(',').map((skill: string, i: number) => (
                  <span key={i} className="px-2.5 py-1 bg-fx-50 text-fx-700 rounded-md text-xs font-medium">{skill.trim()}</span>
                ))}
              </div>
            </div>
          )}

          {requirement.description && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Job Description</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{requirement.description}</p>
            </div>
          )}

          {/* Assigned team */}
          <div>
            <p className="text-xs text-gray-400 mb-2">Assigned Team ({assignedTeam.length})</p>
            <div className="flex flex-wrap gap-2">
              {assignedTeam.map((m) => (
                <div key={m.team_member_id} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-fx-100 text-fx-700 flex items-center justify-center text-[9px] font-medium">
                    {m.name.split(' ').map((w: string) => w[0]).join('').substring(0, 2)}
                  </div>
                  <span className="text-xs font-medium text-gray-700">{m.name}</span>
                  <span className="text-[10px] text-gray-400">{m.role}</span>
                </div>
              ))}
              {assignedTeam.length === 0 && <p className="text-xs text-gray-400">No one assigned yet</p>}
            </div>
          </div>
        </div>
      )}

      {/* Pipeline Kanban */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Candidate Pipeline ({pipeline.length})</h2>
        </div>

        {pipeline.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-100 p-10 text-center">
            <Users className="w-8 h-8 text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">No candidates in pipeline yet</p>
            <p className="text-xs text-gray-300 mt-1">Add candidates from the Candidates module to see them here</p>
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-4">
            {kanbanColumns.map(({ status, entries }) => (
              <div key={status} className="min-w-[240px] w-[240px] shrink-0">
                <div className={clsx('rounded-t-lg px-3 py-2 border-b-2', STATUS_COLORS[status] || 'bg-gray-50 border-gray-200')}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700">{status}</span>
                    <span className="text-[10px] bg-white/80 px-1.5 py-0.5 rounded-full text-gray-500 font-medium">{entries.length}</span>
                  </div>
                </div>
                <div className="space-y-2 mt-2 min-h-[100px]">
                  {entries.map((entry) => (
                    <div key={entry.id} className="bg-white rounded-lg border border-gray-100 p-3 hover:shadow-sm transition-shadow">
                      <p className="text-sm font-medium text-gray-900 truncate">{entry.candidate_name}</p>
                      <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                        <span>{entry.experience_years}y exp</span>
                        {entry.candidate_location && <span>· {entry.candidate_location}</span>}
                      </div>
                      {entry.ai_match_percent && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={clsx('h-full rounded-full', entry.ai_match_percent >= 70 ? 'bg-emerald-500' : entry.ai_match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                              style={{ width: `${entry.ai_match_percent}%` }} />
                          </div>
                          <span className="text-[10px] font-medium text-gray-500">{entry.ai_match_percent}%</span>
                        </div>
                      )}
                      {avgAssessment(entry) && (
                        <p className="text-[10px] text-gray-400 mt-1">Assessment: {avgAssessment(entry)}/10</p>
                      )}
                      {/* Status change dropdown */}
                      <select value={entry.status}
                        onChange={(e) => changeStatus(entry.id, e.target.value)}
                        className="mt-2 w-full text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600 cursor-pointer">
                        {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/requirements/[id]/page.tsx"

echo ""
echo "=========================================="
echo "🎉 Phase 3 setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Restart backend: cd server && Ctrl+C && node index.js"
echo "  2. Frontend auto-reloads"
echo "  3. Test: Requirements → see 27 seeded positions"
echo "  4. Test: Add Requirement with team assignment"
echo "  5. Test: Click a requirement → see detail view with Kanban"
echo "  6. Deploy: git add . && git commit -m 'Phase 3: Requirements' && git push"
echo ""
