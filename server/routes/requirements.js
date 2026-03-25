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
        sendAssignmentEmail(member, jobWithClient, req.user.name, req.user.email).catch(console.error);
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
          sendAssignmentEmail(member, jobWithClient, req.user.name, req.user.email).catch(console.error);
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
