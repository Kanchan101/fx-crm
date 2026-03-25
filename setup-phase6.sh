#!/bin/bash
# FX CRM Phase 6 — Email Notifications + Polish + Production Deploy
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-phase6.sh

set -e
echo "🚀 FX CRM Phase 6 — Email Notifications + Polish + Deploy"
echo ""

# ========================
# BACKEND: Install Resend
# ========================
cd server && npm install resend 2>/dev/null && cd ..
echo "✅ resend installed"

# ========================
# BACKEND: server/lib/email.js — Email service
# ========================
mkdir -p server/lib
cat > server/lib/email.js << 'ENDOFFILE'
const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || 'FX CRM <onboarding@resend.dev>';

async function sendAssignmentEmail(teamMember, job, assignedBy) {
  if (!resend) {
    console.log('[Email] Resend not configured — skipping email to', teamMember.email);
    return;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: teamMember.email,
      subject: `New Assignment: ${job.title} — ${job.client_name}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <div style="background: #1e3a5f; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 16px;">FX Consulting CRM</h2>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Hi ${teamMember.name.split(' ')[0]},</p>
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
              <strong>${assignedBy}</strong> has assigned you to a new requirement:
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
              <h3 style="margin: 0 0 8px; color: #111827; font-size: 16px;">${job.title}</h3>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Client: <strong>${job.client_name}</strong></p>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Location: ${job.location || 'Not specified'}</p>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Experience: ${job.exp_min}-${job.exp_max} years</p>
              <p style="margin: 0; color: #6b7280; font-size: 13px;">Priority: <strong>${job.priority}</strong></p>
            </div>
            <a href="https://crm.fxconsulting.in/requirements/${job.id}"
              style="display: inline-block; background: #4c6ef5; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;">
              View Requirement →
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin: 20px 0 0;">This is an automated notification from FX CRM.</p>
          </div>
        </div>
      `,
    });
    console.log('[Email] Assignment notification sent to', teamMember.email);
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
  }
}

async function sendStatusChangeEmail(teamMember, candidate, job, oldStatus, newStatus, changedBy) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: teamMember.email,
      subject: `Status Update: ${candidate.name} → ${newStatus}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <div style="background: #1e3a5f; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 16px;">FX Consulting CRM</h2>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Hi ${teamMember.name.split(' ')[0]},</p>
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
              <strong>${changedBy}</strong> updated a candidate status:
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
              <p style="margin: 0 0 4px; color: #111827; font-size: 14px;"><strong>${candidate.name}</strong></p>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Position: ${job.title} (${job.client_name})</p>
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                Status: <span style="text-decoration: line-through;">${oldStatus}</span> → <strong style="color: #4c6ef5;">${newStatus}</strong>
              </p>
            </div>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Email] Status notification failed:', err.message);
  }
}

module.exports = { sendAssignmentEmail, sendStatusChangeEmail };
ENDOFFILE
echo "✅ server/lib/email.js"

# ========================
# BACKEND: Update requirements.js to send emails on assignment
# ========================
cat > server/routes/requirements.js << 'ENDOFFILE'
const express = require('express');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { sendAssignmentEmail } = require('../lib/email');

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

    // Send email notifications to assigned team (async, don't block response)
    if (assigned_team_ids && assigned_team_ids.length > 0) {
      const clientInfo = await query('SELECT name FROM clients WHERE id = $1', [client_id]);
      const jobWithClient = { ...result, client_name: clientInfo.rows[0]?.name || '' };
      const members = await query('SELECT id, name, email FROM team WHERE id = ANY($1)', [assigned_team_ids]);
      members.rows.forEach(member => {
        sendAssignmentEmail(member, jobWithClient, req.user.name).catch(console.error);
      });
    }

    res.status(201).json({ requirement: result });
  } catch (err) { console.error('Create requirement error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max, description, skills, priority, deadline, positions_count, status, internal_notes, assigned_team_ids } = req.body;

    // Get existing assignments to find new ones
    const existingAssignments = await query('SELECT team_member_id FROM job_assignments WHERE job_id = $1', [req.params.id]);
    const existingIds = existingAssignments.rows.map(r => r.team_member_id);

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

    // Send email to newly assigned members only
    if (assigned_team_ids && assigned_team_ids.length > 0) {
      const newAssignees = assigned_team_ids.filter(id => !existingIds.includes(id));
      if (newAssignees.length > 0) {
        const clientInfo = await query('SELECT name FROM clients WHERE id = $1', [client_id]);
        const jobWithClient = { ...result, client_name: clientInfo.rows[0]?.name || '' };
        const members = await query('SELECT id, name, email FROM team WHERE id = ANY($1)', [newAssignees]);
        members.rows.forEach(member => {
          sendAssignmentEmail(member, jobWithClient, req.user.name).catch(console.error);
        });
      }
    }

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
echo "✅ server/routes/requirements.js (with email notifications)"

# ========================
# FRONTEND: Dashboard — working quick actions + responsive sidebar
# ========================
cat > "src/app/(dashboard)/dashboard/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import {
  Briefcase, Users, Building2, TrendingUp, Calendar, FileText,
  Clock, ChevronRight, ArrowUpRight, Plus,
} from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function DashboardPage() {
  const router = useRouter();
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
    const entity = a.entity_type === 'auth' ? '' : ` ${a.entity_type || ''}`;
    return `${labels[a.action] || a.action}${entity}`;
  };

  const timeAgo = (date: string) => {
    const mins = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Open Positions', value: stats.open_positions, icon: Briefcase, color: 'bg-blue-50 text-blue-600', href: '/requirements' },
          { label: 'Candidates', value: stats.active_candidates, icon: Users, color: 'bg-violet-50 text-violet-600', href: '/candidates' },
          { label: 'Active Clients', value: stats.active_clients, icon: Building2, color: 'bg-amber-50 text-amber-600', href: '/clients' },
          { label: 'Interviews Today', value: stats.interviews_today, icon: Calendar, color: 'bg-emerald-50 text-emerald-600', href: '/interviews' },
        ].map(({ label, value, icon: Icon, color, href }) => (
          <div key={label} onClick={() => router.push(href)}
            className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer group">
            <div className="flex items-start justify-between mb-3">
              <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', color)}><Icon className="w-5 h-5" /></div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {isRole('Super Admin', 'Account Manager') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div onClick={() => router.push('/reports')} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md transition-shadow cursor-pointer">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-orange-50 text-orange-600"><FileText className="w-5 h-5" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.submitted_this_week}</p>
            <p className="text-sm text-gray-500 mt-0.5">Submitted This Week</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-teal-50 text-teal-600"><TrendingUp className="w-5 h-5" /></div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats.placements_this_month}</p>
            <p className="text-sm text-gray-500 mt-0.5">Placements This Month</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick actions */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="space-y-2">
            <button onClick={() => router.push('/candidates')}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-fx-200 hover:shadow-sm transition-all text-left group w-full">
              <div className="w-10 h-10 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center group-hover:bg-violet-100"><Plus className="w-5 h-5" /></div>
              <div><p className="text-sm font-medium text-gray-900">Add Candidate</p><p className="text-xs text-gray-400">Upload CV and auto-parse with AI</p></div>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
            {isRole('Super Admin', 'Account Manager') && (
              <button onClick={() => router.push('/requirements')}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-fx-200 hover:shadow-sm transition-all text-left group w-full">
                <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-100"><Plus className="w-5 h-5" /></div>
                <div><p className="text-sm font-medium text-gray-900">Add Requirement</p><p className="text-xs text-gray-400">Create position and assign team</p></div>
                <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
              </button>
            )}
            {isRole('Super Admin', 'Account Manager') && (
              <button onClick={() => router.push('/clients')}
                className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-fx-200 hover:shadow-sm transition-all text-left group w-full">
                <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center group-hover:bg-amber-100"><Plus className="w-5 h-5" /></div>
                <div><p className="text-sm font-medium text-gray-900">Add Client</p><p className="text-xs text-gray-400">Onboard a new client</p></div>
                <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
              </button>
            )}
            <button onClick={() => router.push('/pipeline')}
              className="flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:border-fx-200 hover:shadow-sm transition-all text-left group w-full">
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:bg-emerald-100"><ArrowUpRight className="w-5 h-5" /></div>
              <div><p className="text-sm font-medium text-gray-900">View Pipeline</p><p className="text-xs text-gray-400">Track candidates across stages</p></div>
              <ChevronRight className="w-4 h-4 text-gray-300 ml-auto" />
            </button>
          </div>
        </div>

        {/* Recent activity */}
        <div>
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Recent Activity</h2>
          {activities.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
              <Clock className="w-8 h-8 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No activity yet</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50 max-h-[400px] overflow-y-auto">
              {activities.slice(0, 20).map((a: any) => (
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
      </div>
    </div>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/dashboard/page.tsx (quick actions working)"

# ========================
# FRONTEND: Fix sidebar collapse affecting content area
# ========================
cat > "src/app/(dashboard)/layout.tsx" << 'ENDOFFILE'
'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';

export const SidebarContext = createContext({ collapsed: false, setCollapsed: (v: boolean) => {} });

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-fx-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-400">Loading CRM...</p>
        </div>
      </div>
    );
  }
  if (!user) return null;

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed }}>
      <div className="min-h-screen bg-gray-50">
        <Sidebar />
        <div className={`${collapsed ? 'pl-[72px]' : 'pl-[260px]'} transition-all duration-300`}>
          <Header />
          <main className="p-6 page-enter">{children}</main>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/layout.tsx (sidebar collapse fix)"

# ========================
# FRONTEND: Update Sidebar to use context
# ========================
cat > src/components/Sidebar.tsx << 'ENDOFFILE'
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useContext } from 'react';
import { SidebarContext } from '@/app/(dashboard)/layout';
import {
  LayoutDashboard, Building2, Users, Kanban, Calendar,
  BarChart3, UserCog, LogOut, ChevronLeft, Briefcase,
} from 'lucide-react';
import clsx from 'clsx';

interface NavItem { label: string; href: string; icon: React.ElementType; roles?: string[]; }

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Requirements', href: '/requirements', icon: Briefcase },
  { label: 'Candidates', href: '/candidates', icon: Users },
  { label: 'Clients', href: '/clients', icon: Building2 },
  { label: 'Pipeline', href: '/pipeline', icon: Kanban },
  { label: 'Interviews', href: '/interviews', icon: Calendar },
  { label: 'Reports', href: '/reports', icon: BarChart3 },
  { label: 'Team', href: '/team', icon: UserCog, roles: ['Super Admin'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  let collapsed = false;
  let setCollapsed = (v: boolean) => {};
  try {
    const ctx = useContext(SidebarContext);
    collapsed = ctx.collapsed;
    setCollapsed = ctx.setCollapsed;
  } catch {}

  const handleLogout = async () => { await logout(); router.push('/login'); };

  const filteredNav = NAV_ITEMS.filter(item => !item.roles || (user && item.roles.includes(user.role)));
  const initials = user?.name?.split(' ').map((w: string) => w[0]).join('').substring(0, 2).toUpperCase();

  return (
    <aside className={clsx('fixed left-0 top-0 h-screen bg-fx-950 text-white flex flex-col z-40 transition-all duration-300',
      collapsed ? 'w-[72px]' : 'w-[260px]')}>
      <div className="h-16 flex items-center justify-between px-4 border-b border-white/5">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold">FX</div>
            <div className="leading-tight"><p className="text-sm font-semibold">FX CRM</p><p className="text-[10px] text-fx-300/50 uppercase tracking-widest">Consulting</p></div>
          </div>
        )}
        {collapsed && <div className="w-8 h-8 rounded-lg bg-fx-600 flex items-center justify-center text-xs font-bold mx-auto">FX</div>}
        <button onClick={() => setCollapsed(!collapsed)}
          className={clsx('w-6 h-6 rounded-md bg-white/5 hover:bg-white/10 flex items-center justify-center', collapsed && 'mx-auto mt-2')}>
          <ChevronLeft className={clsx('w-3.5 h-3.5 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto sidebar-scroll">
        {filteredNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          const Icon = item.icon;
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              className={clsx('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all group',
                isActive ? 'bg-fx-600 text-white shadow-lg shadow-fx-600/20' : 'text-gray-400 hover:text-white hover:bg-white/5')}
              title={collapsed ? item.label : undefined}>
              <Icon className={clsx('w-[18px] h-[18px] shrink-0', isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-300')} />
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-lg', collapsed && 'justify-center px-0')}>
          <div className="w-8 h-8 rounded-full bg-fx-700 flex items-center justify-center text-xs font-medium shrink-0">{initials}</div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-[11px] text-gray-500 truncate">{user?.role}</p>
            </div>
          )}
        </div>
        <button onClick={handleLogout}
          className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:text-red-400 hover:bg-white/5 transition-colors mt-1', collapsed && 'justify-center')}
          title="Logout">
          <LogOut className="w-[18px] h-[18px] shrink-0" />{!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
ENDOFFILE
echo "✅ src/components/Sidebar.tsx (collapse synced with layout)"

# ========================
# FRONTEND: Vercel config for production
# ========================
cat > vercel.json << 'ENDOFFILE'
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "outputDirectory": ".next"
}
ENDOFFILE
echo "✅ vercel.json"

# ========================
# BACKEND: Render start script (for production)
# ========================
cat > server/Procfile << 'ENDOFFILE'
web: node index.js
ENDOFFILE
echo "✅ server/Procfile"

echo ""
echo "=========================================="
echo "🎉 Phase 6 setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "  1. Restart backend: cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo "  2. Test dashboard quick actions (navigate to pages)"
echo "  3. Test sidebar collapse (content area adjusts)"
echo ""
echo "To enable email notifications:"
echo "  1. Go to resend.com → sign up → get API key"
echo "  2. Add to server/.env: RESEND_API_KEY=re_xxxxx"
echo "  3. Add: FROM_EMAIL=notifications@fxconsulting.in"
echo "  4. Also set on Render env vars"
echo ""
echo "Deploy to production:"
echo "  git add . && git commit -m 'Phase 6: Email + Polish + Deploy' && git push"
echo ""
echo "Vercel env vars needed:"
echo "  NEXT_PUBLIC_API_URL=https://fx-crm-api.onrender.com"
echo ""
echo "Render env vars needed:"
echo "  DATABASE_URL, JWT_SECRET, FRONTEND_URL, ANTHROPIC_API_KEY"
echo "  RESEND_API_KEY (optional), FROM_EMAIL (optional)"
echo ""
echo "=========================================="
echo "🏁 FX CRM is production-ready!"
echo "=========================================="
echo ""
