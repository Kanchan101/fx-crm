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
