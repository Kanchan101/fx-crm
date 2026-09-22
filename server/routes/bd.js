const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Sales stages and the probability each carries for a weighted forecast.
const OPEN_STAGES = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation'];
const ALL_STAGES = [...OPEN_STAGES, 'Won', 'Lost'];
const PROB = { Prospecting: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };

// Select an opportunity joined to its client + owner, with a computed idle-days.
const OPP_SELECT = `
  SELECT o.*,
    c.name    AS client_name,
    c.tier    AS client_tier,
    c.vertical AS client_vertical,
    t.name    AS owner_name,
    t.avatar_color AS owner_color,
    GREATEST(0, DATE_PART('day', NOW() - o.last_stage_at))::int AS idle_days
  FROM bd_opportunities o
  LEFT JOIN clients c ON c.id = o.client_id
  LEFT JOIN team t    ON t.id = o.owner_id
`;

function logActivity(entityType, entityId, action, details, userId) {
  // activity_log already exists in the CRM — reuse it for the BD timeline.
  query(
    `INSERT INTO activity_log (entity_type, entity_id, action, details, performed_by)
     VALUES ($1, $2, $3, $4, $5)`,
    [entityType, entityId, action, JSON.stringify(details || {}), userId || null]
  ).catch((e) => console.warn('activity_log insert skipped:', e.message));
}

/* ═══════════════════════ OPPORTUNITIES ═══════════════════════ */

// GET /api/bd/opportunities?stage=&owner_id=&client_id=&search=
router.get('/opportunities', authenticate, async (req, res) => {
  try {
    const { stage, owner_id, client_id, search } = req.query;
    let sql = OPP_SELECT + ' WHERE 1=1';
    const params = [];
    let i = 1;
    if (stage && stage !== 'All') { sql += ` AND o.stage = $${i++}`; params.push(stage); }
    if (owner_id) { sql += ` AND o.owner_id = $${i++}`; params.push(owner_id); }
    if (client_id) { sql += ` AND o.client_id = $${i++}`; params.push(client_id); }
    if (search) {
      sql += ` AND (LOWER(o.title) LIKE $${i} OR LOWER(c.name) LIKE $${i})`;
      params.push(`%${String(search).toLowerCase()}%`); i++;
    }
    sql += ' ORDER BY o.value DESC NULLS LAST, o.updated_at DESC';
    const { rows } = await query(sql, params);
    res.json({ opportunities: rows, total: rows.length });
  } catch (err) {
    console.error('BD list opportunities error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/bd/opportunities/:id  (detail + recent timeline)
router.get('/opportunities/:id', authenticate, async (req, res) => {
  try {
    const { rows } = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const timeline = await query(
      `SELECT a.*, t.name AS performed_by_name
       FROM activity_log a LEFT JOIN team t ON t.id = a.performed_by
       WHERE a.entity_type = 'opportunity' AND a.entity_id = $1
       ORDER BY a.performed_at DESC LIMIT 30`,
      [req.params.id]
    );
    res.json({ opportunity: rows[0], timeline: timeline.rows });
  } catch (err) {
    console.error('BD get opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/bd/opportunities
router.post('/opportunities', authenticate, async (req, res) => {
  try {
    const { client_id, title, stage, value, owner_id, source, expected_close, next_step } = req.body;
    if (!client_id || !title) return res.status(400).json({ error: 'Client and title are required' });
    const st = ALL_STAGES.includes(stage) ? stage : 'Prospecting';
    const { rows } = await query(
      `INSERT INTO bd_opportunities
         (client_id, title, stage, value, owner_id, source, expected_close, next_step, created_by, last_stage_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, NOW()) RETURNING id`,
      [client_id, title.trim(), st, value || 0, owner_id || req.user.id, source || null,
       expected_close || null, next_step || null, req.user.id]
    );
    logActivity('opportunity', rows[0].id, 'created', { title, stage: st }, req.user.id);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [rows[0].id]);
    res.status(201).json({ opportunity: full.rows[0] });
  } catch (err) {
    console.error('BD create opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/bd/opportunities/:id/stage   { stage, lost_reason? }
router.patch('/opportunities/:id/stage', authenticate, async (req, res) => {
  try {
    const { stage, lost_reason } = req.body;
    if (!ALL_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
    const prev = await query('SELECT stage FROM bd_opportunities WHERE id = $1', [req.params.id]);
    if (!prev.rows.length) return res.status(404).json({ error: 'Not found' });
    await query(
      `UPDATE bd_opportunities
       SET stage = $1, lost_reason = $2, last_stage_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [stage, stage === 'Lost' ? (lost_reason || null) : null, req.params.id]
    );
    logActivity('opportunity', req.params.id, 'stage_changed',
      { from: prev.rows[0].stage, to: stage }, req.user.id);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    res.json({ opportunity: full.rows[0] });
  } catch (err) {
    console.error('BD move stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/bd/opportunities/:id   (edit fields)
router.patch('/opportunities/:id', authenticate, async (req, res) => {
  try {
    const allowed = ['title', 'value', 'owner_id', 'source', 'expected_close', 'next_step', 'notes', 'client_id'];
    const sets = [];
    const params = [];
    let i = 1;
    for (const key of allowed) {
      if (req.body[key] !== undefined) { sets.push(`${key} = $${i++}`); params.push(req.body[key]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    params.push(req.params.id);
    await query(`UPDATE bd_opportunities SET ${sets.join(', ')} WHERE id = $${i}`, params);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    if (!full.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ opportunity: full.rows[0] });
  } catch (err) {
    console.error('BD edit opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/bd/opportunities/:id   (managers only)
router.delete('/opportunities/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    await query('DELETE FROM bd_opportunities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('BD delete opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════ TASKS ═══════════════════════ */

// GET /api/bd/tasks?owner_id=&done=
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const { owner_id, done } = req.query;
    let sql = `
      SELECT bt.*,
        t.name AS owner_name, t.avatar_color AS owner_color,
        ct.name AS completed_by_name,
        c.name AS client_name,
        o.title AS opportunity_title
      FROM bd_tasks bt
      LEFT JOIN team t  ON t.id = bt.owner_id
      LEFT JOIN team ct ON ct.id = bt.completed_by
      LEFT JOIN clients c ON c.id = bt.client_id
      LEFT JOIN bd_opportunities o ON o.id = bt.opportunity_id
      WHERE 1=1`;
    const params = [];
    let i = 1;
    if (owner_id) { sql += ` AND bt.owner_id = $${i++}`; params.push(owner_id); }
    if (done === 'true' || done === 'false') { sql += ` AND bt.done = $${i++}`; params.push(done === 'true'); }
    sql += ' ORDER BY bt.done ASC, bt.due_date ASC NULLS LAST, bt.created_at DESC';
    const { rows } = await query(sql, params);
    // Bucket by due date for the Activities view.
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const r of rows) {
      if (r.done) { r.bucket = 'Done'; continue; }
      if (!r.due_date) { r.bucket = 'Upcoming'; continue; }
      const d = new Date(r.due_date); d.setHours(0, 0, 0, 0);
      r.bucket = d < today ? 'Overdue' : (d.getTime() === today.getTime() ? 'Today' : 'Upcoming');
    }
    res.json({ tasks: rows, total: rows.length });
  } catch (err) {
    console.error('BD list tasks error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/bd/tasks
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { title, opportunity_id, client_id, owner_id, due_date } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });
    const { rows } = await query(
      `INSERT INTO bd_tasks (title, opportunity_id, client_id, owner_id, due_date, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [title.trim(), opportunity_id || null, client_id || null, owner_id || req.user.id, due_date || null, req.user.id]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('BD create task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/bd/tasks/:id/toggle
router.patch('/tasks/:id/toggle', authenticate, async (req, res) => {
  try {
    const cur = await query('SELECT done FROM bd_tasks WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const nd = !cur.rows[0].done;
    await query(
      `UPDATE bd_tasks
       SET done = $1, completed_by = $2, completed_at = $3 WHERE id = $4`,
      [nd, nd ? req.user.id : null, nd ? new Date() : null, req.params.id]
    );
    res.json({ done: nd });
  } catch (err) {
    console.error('BD toggle task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/bd/tasks/:id
router.delete('/tasks/:id', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM bd_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('BD delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════ OVERVIEW (dashboard KPIs) ═══════════════════════ */

// GET /api/bd/overview?period=week|month|quarter
router.get('/overview', authenticate, async (req, res) => {
  try {
    const period = ['week', 'month', 'quarter'].includes(req.query.period) ? req.query.period : 'month';
    const since = new Date();
    if (period === 'week') since.setDate(since.getDate() - 7);
    else if (period === 'quarter') since.setMonth(since.getMonth() - 3);
    else since.setMonth(since.getMonth() - 1);

    // Value + count per stage (all open + won/lost).
    const byStage = await query(
      `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value),0)::float AS value
       FROM bd_opportunities GROUP BY stage`
    );
    const stages = ALL_STAGES.map((s) => {
      const row = byStage.rows.find((r) => r.stage === s) || { count: 0, value: 0 };
      return { stage: s, count: row.count, value: row.value };
    });

    const openValue = stages.filter((s) => OPEN_STAGES.includes(s.stage)).reduce((a, s) => a + s.value, 0);
    const openCount = stages.filter((s) => OPEN_STAGES.includes(s.stage)).reduce((a, s) => a + s.count, 0);
    const weighted = stages.reduce((a, s) => OPEN_STAGES.includes(s.stage) ? a + s.value * (PROB[s.stage] / 100) : a, 0);

    // Won / lost this period (from the BD funnel).
    const wl = await query(
      `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value),0)::float AS value
       FROM bd_opportunities
       WHERE stage IN ('Won','Lost') AND updated_at >= $1 GROUP BY stage`,
      [since]
    );
    const won = wl.rows.find((r) => r.stage === 'Won') || { count: 0, value: 0 };
    const lost = wl.rows.find((r) => r.stage === 'Lost') || { count: 0, value: 0 };
    const winRate = (won.count + lost.count) ? Math.round((won.count / (won.count + lost.count)) * 100) : 0;

    // Real placed-revenue this period, straight from the CRM's placements table.
    let placedRevenue = 0;
    try {
      const pr = await query(
        `SELECT COALESCE(SUM(fee_amount),0)::float AS total FROM placements WHERE joining_date >= $1`,
        [since]
      );
      placedRevenue = pr.rows[0].total;
    } catch (e) { /* placements shape differs — leave at 0 */ }

    // Top open opportunities + tasks due.
    const topOpps = await query(
      OPP_SELECT + ` WHERE o.stage IN ('Prospecting','Qualified','Proposal','Negotiation')
       ORDER BY o.value DESC NULLS LAST LIMIT 5`
    );
    const tasksDue = await query(
      `SELECT bt.*, c.name AS client_name, t.name AS owner_name
       FROM bd_tasks bt LEFT JOIN clients c ON c.id = bt.client_id
       LEFT JOIN team t ON t.id = bt.owner_id
       WHERE bt.done = false AND (bt.due_date IS NULL OR bt.due_date <= CURRENT_DATE + INTERVAL '2 days')
       ORDER BY bt.due_date ASC NULLS LAST LIMIT 6`
    );

    res.json({
      period, stages,
      openValue, openCount, weighted,
      wonCount: won.count, wonValue: won.value,
      lostCount: lost.count, winRate, placedRevenue,
      topOpportunities: topOpps.rows, tasksDue: tasksDue.rows,
    });
  } catch (err) {
    console.error('BD overview error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
