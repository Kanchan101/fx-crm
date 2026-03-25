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
