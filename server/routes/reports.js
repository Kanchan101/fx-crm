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
