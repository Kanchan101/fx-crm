const express = require('express');
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
      `SELECT al.*, t.name as user_name FROM activity_log al
       LEFT JOIN team t ON t.id = al.user_id
       ORDER BY al.created_at DESC LIMIT 20`
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
    if (date_from) { dateFilter += ` AND p.created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND p.created_at <= $${idx++}`; params.push(date_to + 'T23:59:59'); }

    const result = await query(`
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
      LEFT JOIN pipeline p ON p.candidate_id = ca.id ${dateFilter}
      WHERE t.is_active = true
      GROUP BY t.id, t.name, t.role, t.email
      ORDER BY total_sourced DESC
    `, params);

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
    if (date_from) { dateFilter += ` AND p.created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND p.created_at <= $${idx++}`; params.push(date_to + 'T23:59:59'); }

    // Overall conversion funnel
    const funnel = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN p.status IN ('AM Review Select','Client Review Pending','Interview','Offered','Joined') THEN 1 END) as passed_review,
        COUNT(CASE WHEN p.status IN ('Client Review Pending','Interview','Offered','Joined') THEN 1 END) as submitted,
        COUNT(CASE WHEN p.status IN ('Interview','Offered','Joined') THEN 1 END) as interviewed,
        COUNT(CASE WHEN p.status IN ('Offered','Joined') THEN 1 END) as offered,
        COUNT(CASE WHEN p.status = 'Joined' THEN 1 END) as joined,
        COUNT(CASE WHEN p.status = 'Rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN p.status = 'Dropped' THEN 1 END) as dropped
      FROM pipeline p WHERE 1=1 ${dateFilter}
    `, params);

    // Rejection reasons breakdown
    const rejReasons = await query(`
      SELECT p.reject_reason, COUNT(*) as count
      FROM pipeline p WHERE p.status = 'Rejected' AND p.reject_reason IS NOT NULL ${dateFilter}
      GROUP BY p.reject_reason ORDER BY count DESC
    `, params);

    // Drop reasons breakdown
    const dropReasons = await query(`
      SELECT p.drop_reason, COUNT(*) as count
      FROM pipeline p WHERE p.status = 'Dropped' AND p.drop_reason IS NOT NULL ${dateFilter}
      GROUP BY p.drop_reason ORDER BY count DESC
    `, params);

    // Per-client conversion
    const clientConversion = await query(`
      SELECT c.name as client_name,
        COUNT(*) as total,
        COUNT(CASE WHEN p.status = 'Joined' THEN 1 END) as joined,
        COUNT(CASE WHEN p.status = 'Rejected' THEN 1 END) as rejected,
        COUNT(CASE WHEN p.status IN ('Offered','Joined') THEN 1 END) as offered
      FROM pipeline p
      JOIN jobs j ON j.id = p.job_id
      JOIN clients c ON c.id = j.client_id
      WHERE 1=1 ${dateFilter}
      GROUP BY c.name ORDER BY total DESC
    `, params);

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
    if (date_from) { dateFilter += ` AND h1.created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND h1.created_at <= $${idx++}`; params.push(date_to + 'T23:59:59'); }

    // Average TAT: Sourced to Submitted
    const tatSubmit = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Client Review Pending'
      WHERE h1.new_status = 'AM Review Pending' ${dateFilter}
    `, params);

    // Average TAT: Submitted to Interview
    const tatInterview = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Interview'
      WHERE h1.new_status = 'Client Review Pending' ${dateFilter}
    `, params);

    // Average TAT: Interview to Offer
    const tatOffer = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Offered'
      WHERE h1.new_status = 'Interview' ${dateFilter}
    `, params);

    // Average TAT: Offer to Joined
    const tatJoin = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Joined'
      WHERE h1.new_status = 'Offered' ${dateFilter}
    `, params);

    // Full cycle TAT
    const tatFull = await query(`
      SELECT AVG(EXTRACT(EPOCH FROM (h2.created_at - h1.created_at))/86400)::numeric(10,1) as avg_days
      FROM candidate_status_history h1
      JOIN candidate_status_history h2 ON h2.pipeline_id = h1.pipeline_id AND h2.new_status = 'Joined'
      WHERE h1.new_status = 'AM Review Pending' ${dateFilter}
    `, params);

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
    if (date_from) { dateFilter += ` AND p.created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { dateFilter += ` AND p.created_at <= $${idx++}`; params.push(date_to + 'T23:59:59'); }

    let data, headers;

    if (type === 'team-performance') {
      const result = await query(`
        SELECT t.name as "Team Member", t.role as "Role",
          COUNT(DISTINCT p.id) as "Total Sourced",
          COUNT(DISTINCT CASE WHEN p.status = 'AM Review Select' THEN p.id END) as "AM Selected",
          COUNT(DISTINCT CASE WHEN p.status = 'Client Review Pending' THEN p.id END) as "Submitted",
          COUNT(DISTINCT CASE WHEN p.status = 'Interview' THEN p.id END) as "Interviews",
          COUNT(DISTINCT CASE WHEN p.status = 'Offered' THEN p.id END) as "Offered",
          COUNT(DISTINCT CASE WHEN p.status = 'Joined' THEN p.id END) as "Joined",
          COUNT(DISTINCT CASE WHEN p.status = 'Rejected' THEN p.id END) as "Rejected"
        FROM team t LEFT JOIN candidates ca ON ca.owner_id = t.id
        LEFT JOIN pipeline p ON p.candidate_id = ca.id ${dateFilter}
        WHERE t.is_active = true GROUP BY t.name, t.role ORDER BY "Total Sourced" DESC
      `, params);
      data = result.rows;
    } else if (type === 'pipeline') {
      const result = await query(`
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
        WHERE 1=1 ${dateFilter}
        ORDER BY p.updated_at DESC
      `, params);
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
      if (val.includes(',') || val.includes('"') || val.includes('\n')) val = `"${val}"`;
      return val;
    }).join(','));
    const csv = [csvHeaders.join(','), ...csvRows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) { console.error('Export error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
