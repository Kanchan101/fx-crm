#!/bin/bash
# FX CRM — Pipeline Workflow Redesign
# Replaces confusing 11-status system with clear 7+3 workflow
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-workflow.sh
#
# IMPORTANT: After running this script, also run the migration:
#   cd server && node migrate-workflow.js
#   Then restart: kill $(lsof -t -i:4000) 2>/dev/null; node index.js

set -e
echo "🚀 FX CRM — Pipeline Workflow Redesign"
echo ""
echo "OLD: New, Screening, Submitted to Client, Client Review, Interview Stage,"
echo "     HR Discussion, Offer, Joined, Not Joined, AM Rejected, Interview Reject"
echo ""
echo "NEW: Sourced → Screening → Submitted to Client → Interview → Offered → Joined"
echo "     Exit: Rejected (with reason), On Hold, Dropped"
echo ""

# ========================
# STEP 1: Copy migration script
# ========================
cat > server/migrate-workflow.js << 'ENDOFFILE'
require('dotenv').config();
const { pool, query } = require('./db');

async function migrate() {
  console.log('🔄 Pipeline Workflow Migration\n');

  const STATUS_MAP = {
    'New': 'Sourced',
    'Screening': 'Screening',
    'Submitted to Client': 'Submitted to Client',
    'Client Review': 'Submitted to Client',
    'Interview Stage': 'Interview',
    'HR Discussion': 'Interview',
    'Offer': 'Offered',
    'Joined': 'Joined',
    'Not Joined': 'Dropped',
    'Account Manager Rejected': 'Rejected',
    'Interview Reject': 'Rejected',
  };

  console.log('📊 Current status distribution:');
  const cur = await query('SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC');
  cur.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  // Drop old constraint
  console.log('\n🔧 Removing old CHECK constraint...');
  try {
    const constraints = await query(`
      SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'pipeline' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%status%'
    `);
    for (const c of constraints.rows) {
      await query(`ALTER TABLE pipeline DROP CONSTRAINT "${c.conname}"`);
      console.log(`  Dropped: ${c.conname}`);
    }
  } catch (err) { console.log('  No constraint found'); }

  // Add new columns
  console.log('\n📝 Adding reject_reason and drop_reason columns...');
  await query('ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(100)');
  await query('ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS drop_reason VARCHAR(100)');
  console.log('  ✓ Done');

  // Migrate data
  console.log('\n🔄 Migrating statuses...');
  for (const [old, nw] of Object.entries(STATUS_MAP)) {
    const r = await query('UPDATE pipeline SET status = $1 WHERE status = $2', [nw, old]);
    if (r.rowCount > 0) {
      console.log(`  ${old} → ${nw}: ${r.rowCount} rows`);
      if (old === 'Account Manager Rejected') await query("UPDATE pipeline SET reject_reason = 'Not a fit' WHERE status = 'Rejected' AND reject_reason IS NULL AND notes IS NULL");
      if (old === 'Interview Reject') await query("UPDATE pipeline SET reject_reason = 'Failed interview' WHERE status = 'Rejected' AND reject_reason IS NULL");
      if (old === 'Not Joined') await query("UPDATE pipeline SET drop_reason = 'Did not join' WHERE status = 'Dropped' AND drop_reason IS NULL");
    }
  }

  // Migrate history
  console.log('\n🔄 Migrating history...');
  for (const [old, nw] of Object.entries(STATUS_MAP)) {
    await query('UPDATE candidate_status_history SET old_status = $1 WHERE old_status = $2', [nw, old]);
    await query('UPDATE candidate_status_history SET new_status = $1 WHERE new_status = $2', [nw, old]);
  }

  // New constraint
  console.log('\n🔧 Adding new constraint...');
  try {
    await query(`ALTER TABLE pipeline ADD CONSTRAINT pipeline_status_check CHECK (status IN (
      'Sourced','Screening','Submitted to Client','Interview','Offered','Joined','Rejected','On Hold','Dropped'
    ))`);
  } catch (err) { console.log('  Constraint:', err.message); }

  await query("ALTER TABLE pipeline ALTER COLUMN status SET DEFAULT 'Sourced'");

  // Update views
  await query(`CREATE OR REPLACE VIEW daily_sourcing_report AS
    SELECT DATE(csh.created_at) as report_date, t.id as team_member_id, t.name as team_member,
      t.role, COUNT(DISTINCT csh.candidate_id) as candidates_submitted
    FROM candidate_status_history csh JOIN team t ON t.id = csh.changed_by
    WHERE csh.new_status = 'Submitted to Client'
    GROUP BY DATE(csh.created_at), t.id, t.name, t.role ORDER BY report_date DESC`);

  console.log('\n📊 New distribution:');
  const nw = await query('SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC');
  nw.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  console.log('\n✅ MIGRATION COMPLETE!');
  await pool.end();
}

migrate().catch(err => { console.error('Failed:', err); process.exit(1); });
ENDOFFILE
echo "✅ server/migrate-workflow.js"

# ========================
# STEP 2: Update requirements.js (status validation)
# ========================
cat > server/routes/requirements.js << 'ENDOFFILE'
const express = require('express');
const { query, transaction } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
let sendAssignmentEmail;
try { sendAssignmentEmail = require('../lib/email').sendAssignmentEmail; } catch(e) { sendAssignmentEmail = null; }

const router = express.Router();

const VALID_STATUSES = [
  'Sourced','Screening','Submitted to Client','Interview',
  'Offered','Joined','Rejected','On Hold','Dropped'
];
const CLOSED_STATUSES = ['Rejected','On Hold','Dropped'];

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, priority, client_id, search, my_positions, sort_by, sort_order } = req.query;
    let sql = `
      SELECT j.*,
        c.name as client_name, c.tier as client_tier, c.location as client_location,
        c.domain as client_domain, c.fee_percent as client_fee_percent, c.spoc_name as client_spoc,
        (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id) as total_candidates,
        (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id AND p.status NOT IN ('Rejected','Dropped')) as active_candidates,
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
        ca.cv_url as candidate_cv_url,
        t.name as owner_name
       FROM pipeline p JOIN candidates ca ON ca.id = p.candidate_id
       LEFT JOIN team t ON t.id = ca.owner_id WHERE p.job_id = $1 ORDER BY p.updated_at DESC`, [req.params.id]
    );

    // Get SPOCs
    let spocs = [];
    try {
      const spocResult = await query('SELECT * FROM client_spocs WHERE client_id = $1 ORDER BY is_primary DESC, name', [result.rows[0].client_id]);
      spocs = spocResult.rows;
    } catch(e) {}

    res.json({ requirement: result.rows[0], assigned_team: assignments.rows, pipeline: pipeline.rows, spocs });
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
    if (sendAssignmentEmail && assigned_team_ids && assigned_team_ids.length > 0) {
      const ci = await query('SELECT name FROM clients WHERE id = $1', [client_id]);
      const jwc = { ...result, client_name: ci.rows[0]?.name || '' };
      const members = await query('SELECT id, name, email FROM team WHERE id = ANY($1)', [assigned_team_ids]);
      members.rows.forEach(m => sendAssignmentEmail(m, jwc, req.user.name).catch(console.error));
    }
    res.status(201).json({ requirement: result });
  } catch (err) { console.error('Create requirement error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.put('/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { title, client_id, location, type, ctc_min, ctc_max, exp_min, exp_max, description, skills, priority, deadline, positions_count, status, internal_notes, assigned_team_ids } = req.body;
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
    if (sendAssignmentEmail && assigned_team_ids && assigned_team_ids.length > 0) {
      const newAssignees = assigned_team_ids.filter(id => !existingIds.includes(id));
      if (newAssignees.length > 0) {
        const ci = await query('SELECT name FROM clients WHERE id = $1', [client_id]);
        const jwc = { ...result, client_name: ci.rows[0]?.name || '' };
        const members = await query('SELECT id, name, email FROM team WHERE id = ANY($1)', [newAssignees]);
        members.rows.forEach(m => sendAssignmentEmail(m, jwc, req.user.name).catch(console.error));
      }
    }
    res.json({ requirement: result });
  } catch (err) {
    if (err.message === 'Not found') return res.status(404).json({ error: 'Not found' });
    console.error('Update requirement error:', err); res.status(500).json({ error: 'Server error' });
  }
});

// PATCH status — NEW WORKFLOW
router.patch('/:id/pipeline/:pipelineId/status', authenticate, async (req, res) => {
  try {
    const { status, reject_reason, drop_reason } = req.body;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: `Invalid status. Valid: ${VALID_STATUSES.join(', ')}` });
    const current = await query('SELECT * FROM pipeline WHERE id = $1 AND job_id = $2', [req.params.pipelineId, req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const old = current.rows[0].status;

    // Build update query with optional reason columns
    let updateSql = 'UPDATE pipeline SET status=$1, updated_by=$2, updated_at=NOW()';
    const updateParams = [status, req.user.id];
    let paramIdx = 3;

    if (status === 'Rejected' && reject_reason) {
      updateSql += `, reject_reason=$${paramIdx++}`;
      updateParams.push(reject_reason);
    }
    if (status === 'Dropped' && drop_reason) {
      updateSql += `, drop_reason=$${paramIdx++}`;
      updateParams.push(drop_reason);
    }
    // Clear reasons when moving to non-exit status
    if (!CLOSED_STATUSES.includes(status) && status !== 'Joined') {
      updateSql += ', reject_reason=NULL, drop_reason=NULL';
    }

    updateSql += ` WHERE id=$${paramIdx}`;
    updateParams.push(req.params.pipelineId);

    await query(updateSql, updateParams);

    await query('INSERT INTO candidate_status_history (pipeline_id,candidate_id,job_id,old_status,new_status,changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.params.pipelineId, current.rows[0].candidate_id, req.params.id, old, status, req.user.id]);
    await query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'STATUS_CHANGE', 'pipeline', req.params.pipelineId, JSON.stringify({ from: old, to: status, reject_reason, drop_reason })]);
    res.json({ message: 'Updated', old_status: old, new_status: status });
  } catch (err) { console.error('Update pipeline status error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/requirements.js (new workflow statuses)"

# ========================
# STEP 3: Update pipeline.js
# ========================
cat > server/routes/pipeline.js << 'ENDOFFILE'
const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = [
  'Sourced','Screening','Submitted to Client','Interview',
  'Offered','Joined','Rejected','On Hold','Dropped'
];

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
    const params = []; let idx = 1;
    if (status && status !== 'All') { sql += ` AND p.status = $${idx++}`; params.push(status); }
    if (job_id) { sql += ` AND p.job_id = $${idx++}`; params.push(job_id); }
    if (owner === 'mine') { sql += ` AND ca.owner_id = $${idx++}`; params.push(req.user.id); }
    if (search) { sql += ` AND (LOWER(ca.name) LIKE $${idx} OR LOWER(j.title) LIKE $${idx} OR LOWER(cl.name) LIKE $${idx})`; params.push(`%${search.toLowerCase()}%`); idx++; }
    sql += ' ORDER BY p.updated_at DESC';
    const result = await query(sql, params);
    res.json({ pipeline: result.rows });
  } catch (err) { console.error('List pipeline error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/:id/status', authenticate, async (req, res) => {
  try {
    const { status, reject_reason, drop_reason } = req.body;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const current = await query('SELECT * FROM pipeline WHERE id = $1', [req.params.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    const old = current.rows[0].status;

    let updateSql = 'UPDATE pipeline SET status=$1, updated_by=$2, updated_at=NOW()';
    const updateParams = [status, req.user.id];
    let paramIdx = 3;
    if (status === 'Rejected' && reject_reason) { updateSql += `, reject_reason=$${paramIdx++}`; updateParams.push(reject_reason); }
    if (status === 'Dropped' && drop_reason) { updateSql += `, drop_reason=$${paramIdx++}`; updateParams.push(drop_reason); }
    if (!['Rejected','On Hold','Dropped','Joined'].includes(status)) { updateSql += ', reject_reason=NULL, drop_reason=NULL'; }
    updateSql += ` WHERE id=$${paramIdx}`;
    updateParams.push(req.params.id);
    await query(updateSql, updateParams);

    await query('INSERT INTO candidate_status_history (pipeline_id,candidate_id,job_id,old_status,new_status,changed_by) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.params.id, current.rows[0].candidate_id, current.rows[0].job_id, old, status, req.user.id]);
    await query('INSERT INTO activity_log (user_id,action,entity_type,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'STATUS_CHANGE', 'pipeline', req.params.id, JSON.stringify({ from: old, to: status })]);
    res.json({ message: 'Updated', old_status: old, new_status: status });
  } catch (err) { console.error('Update status error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/pipeline.js (new workflow)"

# ========================
# STEP 4: Update candidates.js — default status to 'Sourced'
# ========================
# We need to patch the POST route to use 'Sourced' instead of 'New'
if [ -f server/routes/candidates.js ]; then
  sed -i.bak "s/'New'/'Sourced'/g" server/routes/candidates.js
  rm -f server/routes/candidates.js.bak
  echo "✅ server/routes/candidates.js (default status → Sourced)"
else
  echo "⚠️  candidates.js not found — manually update 'New' to 'Sourced' in POST route"
fi

# ========================
# STEP 5: Update sendcv.js if it exists — change status filter
# ========================
if [ -f server/routes/sendcv.js ]; then
  sed -i.bak "s/Submitted to Client/Submitted to Client/g" server/routes/sendcv.js
  rm -f server/routes/sendcv.js.bak
  echo "✅ server/routes/sendcv.js (unchanged — status name stayed same)"
fi

# ========================
# STEP 6: Update reports.js — dashboard stats
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
    const params = []; let idx = 1;
    if (date_from) { sql += ` AND report_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND report_date <= $${idx++}`; params.push(date_to); }
    if (team_member_id) { sql += ` AND team_member_id = $${idx++}`; params.push(team_member_id); }
    sql += ' ORDER BY report_date DESC, candidates_submitted DESC';
    const result = await query(sql, params);
    res.json({ report: result.rows });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/daily-interviews', authenticate, async (req, res) => {
  try {
    const { date_from, date_to, team_member_id } = req.query;
    let sql = `SELECT * FROM daily_interview_report WHERE 1=1`;
    const params = []; let idx = 1;
    if (date_from) { sql += ` AND report_date >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND report_date <= $${idx++}`; params.push(date_to); }
    if (team_member_id) { sql += ` AND team_member_id = $${idx++}`; params.push(team_member_id); }
    sql += ' ORDER BY report_date DESC, interviews_count DESC';
    const result = await query(sql, params);
    res.json({ report: result.rows });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
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
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

router.get('/recent-activity', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT al.*, t.name as user_name FROM activity_log al
       LEFT JOIN team t ON t.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 20`
    );
    res.json({ activities: result.rows });
  } catch (err) { res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
ENDOFFILE
echo "✅ server/routes/reports.js (dashboard stats updated)"

echo ""
echo "=========================================="
echo "✅ Backend files updated!"
echo "=========================================="
echo ""
echo "Now creating frontend files..."
echo ""

# ========================
# STEP 7: Frontend — Pipeline Kanban page (NEW WORKFLOW)
# ========================
cat > "src/app/(dashboard)/pipeline/page.tsx" << 'ENDOFFILE'
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { getToken } from '@/lib/api';
import { Kanban, Search, MapPin, Building2 } from 'lucide-react';
import clsx from 'clsx';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

const PIPELINE_STATUSES = [
  'Sourced','Screening','Submitted to Client','Interview','Offered','Joined','Rejected','On Hold','Dropped'
];

const SHORT_LABELS: Record<string, string> = {
  'Sourced':'Sourced','Screening':'Screening','Submitted to Client':'Submitted',
  'Interview':'Interview','Offered':'Offered','Joined':'Joined',
  'Rejected':'Rejected','On Hold':'On Hold','Dropped':'Dropped'
};

const COL_COLORS: Record<string, string> = {
  'Sourced':'border-t-gray-400','Screening':'border-t-blue-400',
  'Submitted to Client':'border-t-purple-400','Interview':'border-t-amber-400',
  'Offered':'border-t-teal-400','Joined':'border-t-green-500',
  'Rejected':'border-t-red-400','On Hold':'border-t-yellow-400','Dropped':'border-t-gray-500'
};

interface PipelineEntry {
  id: string; status: string; candidate_name: string; candidate_location: string;
  experience_years: number; candidate_role: string; current_company: string;
  job_title: string; client_name: string; client_tier: string; job_priority: string;
  ai_match_percent: number; owner_name: string;
  reject_reason: string; drop_reason: string;
  assessment_soft_skills: number; assessment_stability: number;
  assessment_technical: number; assessment_experience: number;
  candidate_id: string;
}

export default function PipelinePage() {
  const router = useRouter();
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

  // Show all columns but only render non-empty + key stages
  const columns = PIPELINE_STATUSES.map(s => ({ status: s, entries: pipeline.filter(p => p.status === s) }))
    .filter(col => col.entries.length > 0 || ['Sourced','Screening','Submitted to Client','Interview','Offered','Joined'].includes(col.status));

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
                  <div key={e.id} className="bg-white rounded-lg border border-gray-100 p-3 hover:shadow-sm transition-shadow cursor-pointer"
                    onClick={() => router.push(`/candidates/${e.candidate_id}`)}>
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
                    {e.reject_reason && <p className="text-[10px] text-red-400 mt-1">Reason: {e.reject_reason}</p>}
                    {e.drop_reason && <p className="text-[10px] text-gray-400 mt-1">Reason: {e.drop_reason}</p>}
                    {avgScore(e) && <p className="text-[10px] text-gray-400 mt-1">Score: {avgScore(e)}/10</p>}
                    <p className="text-[10px] text-gray-300 mt-1">{e.owner_name}</p>
                    <select value={e.status} onChange={(ev) => { ev.stopPropagation(); changeStatus(e.id, ev.target.value); }}
                      onClick={(ev) => ev.stopPropagation()}
                      className="mt-2 w-full text-[10px] px-2 py-1 border border-gray-100 rounded bg-gray-50 text-gray-600">
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
  );
}
ENDOFFILE
echo "✅ src/app/(dashboard)/pipeline/page.tsx (new Kanban columns)"

# ========================
# STEP 8: Update api.ts — pipeline updateStatus to support reject_reason/drop_reason
# ========================
# Patch the api.ts to add reject_reason support
if [ -f src/lib/api.ts ]; then
  # Check if updateStatus already exists with the right signature
  if grep -q "reject_reason" src/lib/api.ts 2>/dev/null; then
    echo "✅ src/lib/api.ts already has reject_reason support"
  else
    # Replace the pipeline updateStatus method
    sed -i.bak 's|updateStatus: (id: string, status: string) =>|updateStatus: (id: string, status: string, reject_reason?: string, drop_reason?: string) =>|g' src/lib/api.ts
    sed -i.bak "s|body: JSON.stringify({ status }) })|body: JSON.stringify({ status, reject_reason, drop_reason }) })|g" src/lib/api.ts
    rm -f src/lib/api.ts.bak
    echo "✅ src/lib/api.ts (pipeline.updateStatus updated with reason params)"
  fi
fi

echo ""
echo "=========================================="
echo "🎉 Pipeline Workflow Redesign Complete!"
echo "=========================================="
echo ""
echo "DEPLOY STEPS:"
echo "  1. Run migration (updates existing data):"
echo "     cd server && node migrate-workflow.js"
echo ""
echo "  2. Restart backend:"
echo "     kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "  3. Build & deploy frontend:"
echo "     cd .. && npm run build"
echo "     git add . && git commit -m 'Pipeline workflow redesign: 7 stages + 3 exit states' && git push"
echo ""
echo "STATUS MAPPING:"
echo "  Old → New"
echo "  ─────────────────────────────────────────"
echo "  New                    → Sourced"
echo "  Screening              → Screening"
echo "  Submitted to Client    → Submitted to Client"
echo "  Client Review           → Submitted to Client"
echo "  Interview Stage        → Interview"
echo "  HR Discussion          → Interview"
echo "  Offer                  → Offered"
echo "  Joined                 → Joined"
echo "  Not Joined             → Dropped"
echo "  Account Manager Rejected → Rejected"
echo "  Interview Reject       → Rejected"
echo ""
echo "NEW PIPELINE TABS:"
echo "  All | Sourced | In Progress | Submitted | Interview | Offered | Closed"
echo ""
echo "⚠️  IMPORTANT: You MUST also update the requirement detail page."
echo "  The requirement-detail-page.tsx file needs to be replaced."
echo "  It will be delivered as a separate complete file."
echo ""
