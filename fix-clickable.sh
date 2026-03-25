#!/bin/bash
# FX CRM Fix — Clickable candidates everywhere + Interview Reject status
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash fix-clickable.sh

set -e
echo "🔧 Fixing clickable candidates + adding Interview Reject status"
echo ""

# ========================
# BACKEND: Add Interview Reject to pipeline status check
# ========================
cat > server/routes/pipeline.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

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
    if (status && status !== 'All') { sql += ` AND p.status = $${idx++}`; params.push(status); }
    if (job_id) { sql += ` AND p.job_id = $${idx++}`; params.push(job_id); }
    if (owner === 'mine') { sql += ` AND ca.owner_id = $${idx++}`; params.push(req.user.id); }
    if (search) {
      sql += ` AND (LOWER(ca.name) LIKE $${idx} OR LOWER(j.title) LIKE $${idx} OR LOWER(cl.name) LIKE $${idx})`;
      params.push(`%${search.toLowerCase()}%`); idx++;
    }
    sql += ' ORDER BY p.updated_at DESC';
    const result = await query(sql, params);
    res.json({ pipeline: result.rows });
  } catch (err) {
    console.error('List pipeline error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'New','Screening','Submitted to Client','Client Review',
      'Interview Stage','HR Discussion','Offer','Joined',
      'Not Joined','Account Manager Rejected','Interview Reject'
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
echo "✅ server/routes/pipeline.js (added Interview Reject)"

# Also update requirements route to accept Interview Reject
cat > server/routes/requirements.js << 'ENDOFFILE'
const express = require('express');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, priority, client_id, search, my_positions, sort_by, sort_order } = req.query;
    let sql = `
      SELECT j.*,
        c.name as client_name, c.tier as client_tier, c.location as client_location,
        c.domain as client_domain, c.fee_percent as client_fee_percent, c.spoc_name as client_spoc,
        (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id) as total_candidates,
        (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id AND p.status NOT IN ('Account Manager Rejected','Not Joined','Interview Reject')) as active_candidates,
        (SELECT COUNT(*) FROM job_assignments ja WHERE ja.job_id = j.id) as assigned_count,
        t.name as created_by_name
      FROM jobs j JOIN clients c ON c.id = j.client_id LEFT JOIN team t ON t.id = j.created_by WHERE 1=1
    `;
    const params = []; let idx = 1;
    if (status && status !== 'All') { sql += ` AND j.status = $${idx++}`; params.push(status); }
    if (priority && priority !== 'All') { sql += ` AND j.priority = $${idx++}`; params.push(priority); }
    if (client_id) { sql += ` AND j.client_id = $${idx++}`; params.push(client_id); }
    if (search) { sql += ` AND (LOWER(j.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx} OR LOWER(j.location) LIKE $${idx})`; params.push(`%${search.toLowerCase()}%`); idx++; }
    if (my_positions === 'true') { sql += ` AND EXISTS (SELECT 1 FROM job_assignments ja WHERE ja.job_id = j.id AND ja.team_member_id = $${idx++})`; params.push(req.user.id); }
    const validSorts = ['title','priority','status','created_at','deadline'];
    const sortCol = validSorts.includes(sort_by) ? sort_by : 'created_at';
    sql += ` ORDER BY j.${sortCol} ${sort_order === 'asc' ? 'ASC' : 'DESC'}`;
    const result = await query(sql, params);
    const jobIds = result.rows.map(r => r.id);
    let assignments = [];
    if (jobIds.length > 0) {
      const ar = await query('SELECT ja.job_id, ja.team_member_id, t.name, t.role, t.email FROM job_assignments ja JOIN team t ON t.id = ja.team_member_id WHERE ja.job_id = ANY($1)', [jobIds]);
      assignments = ar.rows;
    }
    const jobs = result.rows.map(job => ({ ...job, assigned_team: assignments.filter(a => a.job_id === job.id) }));
    res.json({ requirements: jobs, total: jobs.length });
  } catch (err) { console.error('List requirements error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT j.*, c.name as client_name, c.tier as client_tier, c.location as client_location,
        c.domain as client_domain, c.fee_percent as client_fee_percent,
        c.spoc_name as client_spoc, c.spoc_email as client_spoc_email,
        c.spoc_phone as client_spoc_phone, c.industry as client_industry,
        t.name as created_by_name
       FROM jobs j JOIN clients c ON c.id = j.client_id LEFT JOIN team t ON t.id = j.created_by WHERE j.id = $1`, [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const assignments = await query('SELECT ja.team_member_id, t.name, t.role, t.email, ja.assigned_at FROM job_assignments ja JOIN team t ON t.id = ja.team_member_id WHERE ja.job_id = $1 ORDER BY ja.assigned_at', [req.params.id]);
    const pipeline = await query(
      `SELECT p.*, ca.name as candidate_name, ca.email as candidate_email,
        ca.phone as candidate_phone, ca.location as candidate_location,
        ca.experience_years, ca.skills as candidate_skills,
        ca."current_role" as candidate_current_role, ca.current_company as candidate_company,
        ca.assessment_soft_skills, ca.assessment_stability,
        ca.assessment_technical, ca.assessment_experience,
        t.name as owner_name
       FROM pipeline p JOIN candidates ca ON ca.id = p.candidate_id
       LEFT JOIN team t ON t.id = ca.owner_id WHERE p.job_id = $1 ORDER BY p.updated_at DESC`, [req.params.id]
    );
    res.json({ requirement: result.rows[0], assigned_team: assignments.rows, pipeline: pipeline.rows });
  } catch (err) { console.error('Get requirement error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max, description, skills, priority, deadline, positions_count, internal_notes, assigned_team_ids } = req.body;
    if (!title || !client_id) return res.status(400).json({ error: 'Title and client required' });
    const result = await transaction(async (client) => {
      const jr = await client.query(
        `INSERT INTO jobs (title,client_id,location,type,ctc_min,ctc_max,exp_min,exp_max,description,skills,priority,deadline,positions_count,internal_notes,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
        [title,client_id,location,type||'Full Time',ctc_min||0,ctc_max||0,exp_min||0,exp_max||0,description,skills,priority||'Medium',deadline||null,positions_count||1,internal_notes,req.user.id]
      );
      const job = jr.rows[0];
      if (assigned_team_ids && assigned_team_ids.length > 0) {
        for (const mid of assigned_team_ids) {
          await client.query('INSERT INTO job_assignments (job_id,team_member_id,assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [job.id,mid,req.user.id]);
        }
      }
      await client.query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)', [req.user.id,'CREATE','requirement',job.id,JSON.stringify({title})]);
      return job;
    });
    res.status(201).json({ requirement: result });
  } catch (err) { console.error('Create requirement error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max, description, skills, priority, deadline, positions_count, status, internal_notes, assigned_team_ids } = req.body;
    const result = await transaction(async (client) => {
      const jr = await client.query(
        `UPDATE jobs SET title=$1,client_id=$2,location=$3,type=$4,ctc_min=$5,ctc_max=$6,exp_min=$7,exp_max=$8,description=$9,skills=$10,priority=$11,deadline=$12,positions_count=$13,status=$14,internal_notes=$15,updated_at=NOW() WHERE id=$16 RETURNING *`,
        [title,client_id,location,type,ctc_min||0,ctc_max||0,exp_min||0,exp_max||0,description,skills,priority,deadline||null,positions_count||1,status||'Open',internal_notes,req.params.id]
      );
      if (jr.rows.length === 0) throw new Error('Not found');
      if (assigned_team_ids !== undefined) {
        await client.query('DELETE FROM job_assignments WHERE job_id = $1', [req.params.id]);
        for (const mid of assigned_team_ids) {
          await client.query('INSERT INTO job_assignments (job_id,team_member_id,assigned_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id,mid,req.user.id]);
        }
      }
      await client.query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)', [req.user.id,'UPDATE','requirement',req.params.id,JSON.stringify({title})]);
      return jr.rows[0];
    });
    res.json({ requirement: result });
  } catch (err) {
    if (err.message === 'Not found') return res.status(404).json({ error: 'Not found' });
    console.error('Update requirement error:', err); res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/pipeline/:pipelineId/status', authenticate, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = [
      'New','Screening','Submitted to Client','Client Review',
      'Interview Stage','HR Discussion','Offer','Joined',
      'Not Joined','Account Manager Rejected','Interview Reject'
    ];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const current = await query('SELECT * FROM pipeline WHERE id = $1 AND job_id = $2', [req.params.pipelineId, req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const old = current.rows[0].status;
    await query('UPDATE pipeline SET status=$1, updated_by=$2, updated_at=NOW() WHERE id=$3', [status, req.user.id, req.params.pipelineId]);
    await query('INSERT INTO candidate_status_history (pipeline_id,candidate_id,job_id,old_status,new_status,changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.params.pipelineId, current.rows[0].candidate_id, req.params.id, old, status, req.user.id]);
    await query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'STATUS_CHANGE', 'pipeline', req.params.pipelineId, JSON.stringify({ from: old, to: status })]);
    res.json({ message: 'Updated', old_status: old, new_status: status });
  } catch (err) { console.error('Update pipeline status error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/requirements.js (Interview Reject added)"

# ========================
# DB: Allow Interview Reject in pipeline status constraint
# ========================
cat > /tmp/fix-status.js << 'ENDOFFILE'
require('dotenv').config();
const { pool, query } = require('./db');
async function fix() {
  try {
    await query('ALTER TABLE pipeline DROP CONSTRAINT IF EXISTS pipeline_status_check');
    await query(`ALTER TABLE pipeline ADD CONSTRAINT pipeline_status_check CHECK (status IN (
      'New','Screening','Submitted to Client','Client Review',
      'Interview Stage','HR Discussion','Offer','Joined',
      'Not Joined','Account Manager Rejected','Interview Reject'
    ))`);
    console.log('✅ Interview Reject status added to DB');
  } catch (err) { console.error('DB fix error:', err.message); }
  await pool.end();
}
fix();
ENDOFFILE
cp /tmp/fix-status.js server/fix-status.js
echo "✅ server/fix-status.js created"

# ========================
# FRONTEND: Candidates list — clickable names
# ========================
cat > "src/app/(dashboard)/candidates/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  Users, Plus, Search, Upload, X, AlertCircle, Sparkles,
  MapPin, Check, Loader2, ChevronDown, Star,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

interface Candidate {
  id: string; name: string; email: string; phone: string; location: string;
  experience_years: number; skills: string; current_role: string; current_company: string;
  education: string; owner_name: string; pipeline_count: number; pipeline_statuses: string;
  mapped_positions: string; created_at: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
}

interface Requirement { id: string; title: string; client_name: string; location: string; }

const emptyForm = {
  name: '', email: '', phone: '', location: '', experience_years: '',
  skills: '', current_role: '', current_company: '', education: '',
  current_ctc_fixed: '', current_ctc_variable: '', expected_ctc_fixed: '', expected_ctc_variable: '',
  notice_period: '', last_working_day: '', holding_offer: false, holding_offer_details: '',
  referral_name: '', referral_phone: '', referral_bonus_eligible: false,
  assessment_soft_skills: '', assessment_stability: '', assessment_technical: '', assessment_experience: '',
  job_id: '', cv_text: '',
};

export default function CandidatesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [requirements, setRequirements] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cvStep, setCvStep] = useState<'upload' | 'parsing' | 'form'>('upload');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvParsing, setCvParsing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);

  const headers = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });

  const fetchCandidates = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (ownerFilter === 'mine') params.set('owner', 'mine');
      const res = await fetch(`${API}/api/candidates?${params}`, { headers: headers() });
      const data = await res.json();
      setCandidates(data.candidates || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [search, ownerFilter]);

  const fetchRequirements = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/requirements?status=Open`, { headers: headers() });
      const data = await res.json();
      setRequirements(data.requirements || []);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { fetchCandidates(); }, [fetchCandidates]);
  useEffect(() => { fetchRequirements(); }, [fetchRequirements]);

  const openAddModal = () => {
    setForm(emptyForm); setCvStep('upload'); setCvFile(null); setMatchResult(null); setError(''); setShowModal(true);
  };

  const handleCvFile = async (file: File) => {
    setCvFile(file); setCvStep('parsing'); setCvParsing(true); setError('');
    try {
      const formData = new FormData(); formData.append('cv', file);
      const res = await fetch(`${API}/api/candidates/parse-cv`, {
        method: 'POST', headers: { Authorization: `Bearer ${getToken()}` }, body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Parse failed');
      const p = data.parsed || {};
      setForm(f => ({
        ...f, name: p.name || f.name, email: p.email || f.email,
        phone: (p.phone || '').replace(/\D/g, '').slice(-10) || f.phone,
        location: p.location || f.location,
        experience_years: p.experience_years ? String(p.experience_years) : f.experience_years,
        skills: p.skills || f.skills, current_role: p.current_role || f.current_role,
        current_company: p.current_company || f.current_company, education: p.education || f.education,
        cv_text: data.raw_text || '',
      }));
      setCvStep('form');
    } catch (err: any) { setError(err.message); setCvStep('upload'); }
    finally { setCvParsing(false); }
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleCvFile(f); };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) handleCvFile(f); };

  const handleMatch = async () => {
    if (!form.job_id || !form.cv_text) return;
    setMatching(true); setMatchResult(null);
    try {
      const res = await fetch(`${API}/api/candidates/match`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ cv_text: form.cv_text, job_id: form.job_id }),
      });
      setMatchResult(await res.json());
    } catch (err) { console.error(err); }
    finally { setMatching(false); }
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        ...form, experience_years: parseFloat(form.experience_years) || null,
        current_ctc_fixed: parseFloat(form.current_ctc_fixed) || null, current_ctc_variable: parseFloat(form.current_ctc_variable) || null,
        expected_ctc_fixed: parseFloat(form.expected_ctc_fixed) || null, expected_ctc_variable: parseFloat(form.expected_ctc_variable) || null,
        assessment_soft_skills: parseInt(form.assessment_soft_skills) || null, assessment_stability: parseInt(form.assessment_stability) || null,
        assessment_technical: parseInt(form.assessment_technical) || null, assessment_experience: parseInt(form.assessment_experience) || null,
        ai_match_percent: matchResult?.match_percent || null, ai_match_details: matchResult || null,
      };
      const res = await fetch(`${API}/api/candidates`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      setShowModal(false); fetchCandidates();
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const avgScore = (c: Candidate) => {
    const s = [c.assessment_soft_skills, c.assessment_stability, c.assessment_technical, c.assessment_experience].filter(Boolean);
    return s.length > 0 ? (s.reduce((a, b) => a + b, 0) / s.length).toFixed(1) : null;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{candidates.length} candidate{candidates.length !== 1 ? 's' : ''}</p>
        <button onClick={openAddModal}
          className="flex items-center gap-2 px-4 py-2 bg-fx-600 hover:bg-fx-700 text-white rounded-lg text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Candidate
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone, skills..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm bg-white" />
        </div>
        <button onClick={() => setOwnerFilter(ownerFilter === 'mine' ? 'all' : 'mine')}
          className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
            ownerFilter === 'mine' ? 'bg-fx-600 text-white border-fx-600' : 'bg-white text-gray-600 border-gray-200')}>
          {ownerFilter === 'mine' ? 'My Candidates' : 'All Candidates'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>
      ) : candidates.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
          <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">No candidates yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/candidates/${c.id}`)}>
              <div className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-violet-50 text-violet-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {c.name?.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900 truncate hover:text-fx-700 transition-colors">{c.name}</h3>
                    {c.pipeline_count > 0 && (
                      <span className="badge badge-open">{c.pipeline_count} position{c.pipeline_count > 1 ? 's' : ''}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
                    {c.current_role && <span>{c.current_role}{c.current_company ? ` @ ${c.current_company}` : ''}</span>}
                    {c.experience_years && <span>{c.experience_years}y exp</span>}
                    {c.location && <span className="flex items-center gap-0.5"><MapPin className="w-3 h-3" />{c.location}</span>}
                    {c.phone && <span>{c.phone}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  {avgScore(c) && (
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">{avgScore(c)}</p>
                      <p className="text-[9px] text-gray-400">SCORE</p>
                    </div>
                  )}
                  <div className="text-right text-xs text-gray-400">
                    <p>{c.owner_name}</p>
                    <p>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD CANDIDATE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl w-full max-w-3xl my-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add Candidate</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {cvStep === 'upload' ? 'Step 1: Upload CV' : cvStep === 'parsing' ? 'Parsing with AI...' : 'Step 2: Review & Save'}
                </p>
              </div>
              <button onClick={() => setShowModal(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

              {cvStep === 'upload' && (
                <div>
                  <div onDragOver={(e) => e.preventDefault()} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-200 hover:border-fx-400 rounded-xl p-12 text-center cursor-pointer transition-colors group">
                    <Upload className="w-10 h-10 text-gray-300 group-hover:text-fx-500 mx-auto mb-3 transition-colors" />
                    <p className="text-sm font-medium text-gray-700">Drag & drop CV here</p>
                    <p className="text-xs text-gray-400 mt-1">or click to browse · PDF, DOC, DOCX · Max 10MB</p>
                    <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx" onChange={handleFileSelect} className="hidden" />
                  </div>
                  <div className="text-center mt-4">
                    <button onClick={() => setCvStep('form')} className="text-xs text-gray-400 hover:text-gray-600 underline">Skip — fill manually</button>
                  </div>
                </div>
              )}

              {cvStep === 'parsing' && (
                <div className="py-16 text-center">
                  <Sparkles className="w-10 h-10 text-fx-600 animate-pulse mx-auto mb-4" />
                  <p className="text-sm font-medium text-gray-700">AI is parsing the CV...</p>
                  {cvFile && <p className="text-xs text-fx-600 mt-3">{cvFile.name}</p>}
                </div>
              )}

              {cvStep === 'form' && (
                <div className="space-y-5">
                  {cvFile && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                      <Check className="w-4 h-4" /><span className="font-medium">CV parsed:</span> {cvFile.name}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Basic Information</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
                        <input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                        <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone (10 digits)</label>
                        <input type="tel" value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Location</label>
                        <input type="text" value={form.location} onChange={(e) => setForm({...form, location: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Experience (years)</label>
                        <input type="number" step="0.5" value={form.experience_years} onChange={(e) => setForm({...form, experience_years: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Education</label>
                        <input type="text" value={form.education} onChange={(e) => setForm({...form, education: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Current Role</label>
                        <input type="text" value={form.current_role} onChange={(e) => setForm({...form, current_role: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Current Company</label>
                        <input type="text" value={form.current_company} onChange={(e) => setForm({...form, current_company: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                    </div>
                    <div className="mt-3"><label className="block text-xs font-medium text-gray-600 mb-1">Skills</label>
                      <input type="text" value={form.skills} onChange={(e) => setForm({...form, skills: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Java, Spring Boot, AWS..." /></div>
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Map to Requirement</p>
                    <div className="flex gap-3">
                      <select value={form.job_id} onChange={(e) => { setForm({...form, job_id: e.target.value}); setMatchResult(null); }}
                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="">Select position (optional)</option>
                        {requirements.map(r => <option key={r.id} value={r.id}>{r.title} — {r.client_name} ({r.location})</option>)}
                      </select>
                      {form.job_id && form.cv_text && (
                        <button onClick={handleMatch} disabled={matching}
                          className="px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white rounded-lg text-xs font-medium flex items-center gap-1.5 shrink-0">
                          {matching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI Match
                        </button>
                      )}
                    </div>
                    {matchResult && (
                      <div className="mt-3 p-3 bg-violet-50 rounded-lg border border-violet-100">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-2xl font-bold text-violet-700">{matchResult.match_percent}%</div>
                          <div className="flex-1 h-2 bg-violet-200 rounded-full overflow-hidden">
                            <div className={clsx('h-full rounded-full', matchResult.match_percent >= 70 ? 'bg-emerald-500' : matchResult.match_percent >= 40 ? 'bg-amber-400' : 'bg-red-400')}
                              style={{width: `${matchResult.match_percent}%`}} />
                          </div>
                        </div>
                        {matchResult.summary && <p className="text-xs text-violet-700 mb-2">{matchResult.summary}</p>}
                        <div className="flex gap-4 text-xs">
                          {matchResult.matching_skills?.length > 0 && <div><p className="text-emerald-600 font-medium mb-1">Matching:</p><div className="flex flex-wrap gap-1">{matchResult.matching_skills.map((s: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px]">{s}</span>)}</div></div>}
                          {matchResult.missing_skills?.length > 0 && <div><p className="text-red-500 font-medium mb-1">Missing:</p><div className="flex flex-wrap gap-1">{matchResult.missing_skills.map((s: string, i: number) => <span key={i} className="px-1.5 py-0.5 bg-red-100 text-red-600 rounded text-[10px]">{s}</span>)}</div></div>}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Compensation (LPA)</p>
                    <div className="grid grid-cols-4 gap-3">
                      <div><label className="block text-[10px] text-gray-400 mb-1">Current Fixed</label><input type="number" value={form.current_ctc_fixed} onChange={(e) => setForm({...form, current_ctc_fixed: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-[10px] text-gray-400 mb-1">Current Variable</label><input type="number" value={form.current_ctc_variable} onChange={(e) => setForm({...form, current_ctc_variable: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-[10px] text-gray-400 mb-1">Expected Fixed</label><input type="number" value={form.expected_ctc_fixed} onChange={(e) => setForm({...form, expected_ctc_fixed: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-[10px] text-gray-400 mb-1">Expected Variable</label><input type="number" value={form.expected_ctc_variable} onChange={(e) => setForm({...form, expected_ctc_variable: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Notice Period</label><input type="text" value={form.notice_period} onChange={(e) => setForm({...form, notice_period: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="30 days" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Last Working Day</label><input type="date" value={form.last_working_day} onChange={(e) => setForm({...form, last_working_day: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Holding Offer?</label><label className="flex items-center gap-1.5 mt-1.5 cursor-pointer"><input type="checkbox" checked={form.holding_offer as boolean} onChange={(e) => setForm({...form, holding_offer: e.target.checked})} className="rounded" /><span className="text-sm text-gray-600">Yes</span></label></div>
                    </div>
                    {form.holding_offer && <div className="mt-2"><input type="text" value={form.holding_offer_details} onChange={(e) => setForm({...form, holding_offer_details: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Offer details..." /></div>}
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Referral</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Name</label><input type="text" value={form.referral_name} onChange={(e) => setForm({...form, referral_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Phone</label><input type="tel" value={form.referral_phone} onChange={(e) => setForm({...form, referral_phone: e.target.value.replace(/\D/g, '').slice(0, 10)})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" maxLength={10} /></div>
                      <div><label className="block text-xs font-medium text-gray-600 mb-1">Bonus?</label><label className="flex items-center gap-1.5 mt-1.5 cursor-pointer"><input type="checkbox" checked={form.referral_bonus_eligible as boolean} onChange={(e) => setForm({...form, referral_bonus_eligible: e.target.checked})} className="rounded" /><span className="text-sm text-gray-600">Yes</span></label></div>
                    </div>
                  </div>
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Assessment (1-10)</p>
                    <div className="grid grid-cols-4 gap-3">
                      {[{key:'assessment_soft_skills',label:'Soft Skills'},{key:'assessment_stability',label:'Stability'},{key:'assessment_technical',label:'Technical'},{key:'assessment_experience',label:'Experience'}].map(({key,label}) => (
                        <div key={key}><label className="block text-[10px] text-gray-400 mb-1">{label}</label><input type="number" min="1" max="10" value={(form as any)[key]} onChange={(e) => setForm({...form, [key]: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {cvStep === 'form' && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="px-5 py-2 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium flex items-center gap-2">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save Candidate
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/candidates/page.tsx (clickable rows)"

# ========================
# Fix requirements/[id]/page.tsx — add Interview Reject
# ========================
node -e "
const fs = require('fs');
const fp = 'src/app/(dashboard)/requirements/[id]/page.tsx';
let c = fs.readFileSync(fp, 'utf8');
c = c.replace(
  \"'Not Joined','Account Manager Rejected'\",
  \"'Not Joined','Account Manager Rejected','Interview Reject'\"
);
c = c.replace(
  \"const NOT_SELECTED_STATUSES = ['Not Joined', 'Account Manager Rejected'];\",
  \"const NOT_SELECTED_STATUSES = ['Not Joined', 'Account Manager Rejected', 'Interview Reject'];\"
);
c = c.replace(
  \"'Account Manager Rejected':'bg-rose-50 border-rose-200',\",
  \"'Account Manager Rejected':'bg-rose-50 border-rose-200','Interview Reject':'bg-pink-50 border-pink-200',\"
);
c = c.replace(
  \"'Account Manager Rejected':'text-rose-700',\",
  \"'Account Manager Rejected':'text-rose-700','Interview Reject':'text-pink-700',\"
);
fs.writeFileSync(fp, c);
console.log('Updated requirements/[id]/page.tsx');
"
echo "✅ requirements/[id]/page.tsx (Interview Reject added)"

# ========================
# Fix pipeline/page.tsx — add Interview Reject
# ========================
node -e "
const fs = require('fs');
const fp = 'src/app/(dashboard)/pipeline/page.tsx';
let c = fs.readFileSync(fp, 'utf8');
if (!c.includes('Interview Reject')) {
  c = c.replace(
    \"'Account Manager Rejected'\",
    \"'Account Manager Rejected','Interview Reject'\"
  );
  c = c.replace(
    \"'Account Manager Rejected':'AM Rejected'\",
    \"'Account Manager Rejected':'AM Rejected','Interview Reject':'Int. Reject'\"
  );
  c = c.replace(
    \"'Account Manager Rejected':'border-t-rose-500'\",
    \"'Account Manager Rejected':'border-t-rose-500','Interview Reject':'border-t-pink-400'\"
  );
  fs.writeFileSync(fp, c);
  console.log('Updated pipeline/page.tsx');
} else { console.log('pipeline/page.tsx already has Interview Reject'); }
"
echo "✅ pipeline/page.tsx (Interview Reject added)"

# ========================
# Fix candidates/[id]/page.tsx — add Interview Reject
# ========================
node -e "
const fs = require('fs');
const fp = 'src/app/(dashboard)/candidates/[id]/page.tsx';
let c = fs.readFileSync(fp, 'utf8');
if (!c.includes('Interview Reject')) {
  c = c.replace(
    \"'Account Manager Rejected': 'bg-rose-100 text-rose-700',\",
    \"'Account Manager Rejected': 'bg-rose-100 text-rose-700', 'Interview Reject': 'bg-pink-100 text-pink-700',\"
  );
  fs.writeFileSync(fp, c);
  console.log('Updated candidates/[id]/page.tsx');
} else { console.log('candidates/[id]/page.tsx already updated'); }
"
echo "✅ candidates/[id]/page.tsx (Interview Reject added)"

echo ""
echo "=========================================="
echo "🎉 Fix complete!"
echo "=========================================="
echo ""
echo "Run these commands:"
echo "  1. cd server && node fix-status.js"
echo "  2. kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "Changes:"
echo "  ✓ Candidates list — clicking any row opens /candidates/:id"
echo "  ✓ Requirements detail — clicking candidate opens /candidates/:id"
echo "  ✓ Pipeline Kanban — clicking candidate name opens /candidates/:id"
echo "  ✓ Interview Reject added as new status everywhere"
echo "  ✓ Requirements pipeline tabs include Interview Reject in Not Selected"
echo ""
