const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Sales stages and the probability each carries for a weighted forecast.
const OPEN_STAGES = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation'];
const ALL_STAGES = [...OPEN_STAGES, 'Won', 'Lost'];
const PROB = { Prospecting: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };

// An opportunity's "account" is either a real client OR a typed-in prospect.
const OPP_SELECT = `
  SELECT o.*,
    COALESCE(c.name, o.prospect_name) AS client_name,
    (o.client_id IS NULL) AS is_prospect,
    c.tier    AS client_tier,
    c.vertical AS client_vertical,
    t.name    AS owner_name,
    t.avatar_color AS owner_color,
    GREATEST(0, DATE_PART('day', NOW() - o.last_stage_at))::int AS idle_days
  FROM bd_opportunities o
  LEFT JOIN clients c ON c.id = o.client_id
  LEFT JOIN team t    ON t.id = o.owner_id
`;

function logActivity(action, entityId, details, userId) {
  // Reuse the CRM's activity_log (columns: user_id, action, entity_type, entity_id, details).
  query(
    `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, 'opportunity', $3, $4)`,
    [userId || null, action, entityId, JSON.stringify(details || {})]
  ).catch((e) => console.warn('activity_log insert skipped:', e.message));
}

/* ═══════════════════════ ACCESS ═══════════════════════ */
// This endpoint is intentionally BEFORE the access guard so any signed-in
// user can ask whether they personally have BD access (drives the nav link).
router.get('/my-access', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'Super Admin') return res.json({ access: true });
    const { rows } = await query('SELECT role, bd_access FROM team WHERE id = $1', [req.user.id]);
    const ok = rows.length && (rows[0].role === 'Super Admin' || rows[0].bd_access === true);
    res.json({ access: !!ok });
  } catch (err) {
    res.json({ access: false });
  }
});

// Gate for everything below: Super Admin, or a team member the admin enabled.
async function requireBdAccess(req, res, next) {
  try {
    if (req.user.role === 'Super Admin') return next();
    const { rows } = await query('SELECT role, bd_access FROM team WHERE id = $1', [req.user.id]);
    if (rows.length && (rows[0].role === 'Super Admin' || rows[0].bd_access === true)) return next();
    return res.status(403).json({ error: 'No BD access' });
  } catch (err) {
    console.error('BD access check error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
router.use(authenticate, requireBdAccess);

// Super-Admin-only: list team members with their BD access flag.
router.get('/access', (req, res, next) => {
  if (req.user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin only' });
  next();
}, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, COALESCE(bd_access, false) AS bd_access
       FROM team WHERE is_active = true ORDER BY name`
    );
    res.json({ members: rows });
  } catch (err) {
    console.error('BD access list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Super-Admin-only: grant / revoke a team member's BD access.
router.patch('/access/:teamId', (req, res, next) => {
  if (req.user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin only' });
  next();
}, async (req, res) => {
  try {
    const { bd_access } = req.body;
    await query('UPDATE team SET bd_access = $1 WHERE id = $2', [bd_access === true, req.params.teamId]);
    res.json({ success: true, bd_access: bd_access === true });
  } catch (err) {
    console.error('BD access update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════ OPPORTUNITIES ═══════════════════════ */

// GET /api/bd/opportunities?stage=&owner_id=&client_id=&search=
router.get('/opportunities', async (req, res) => {
  try {
    const { stage, owner_id, client_id, search } = req.query;
    let sql = OPP_SELECT + ' WHERE 1=1';
    const params = [];
    let i = 1;
    if (stage && stage !== 'All') { sql += ` AND o.stage = $${i++}`; params.push(stage); }
    if (owner_id) { sql += ` AND o.owner_id = $${i++}`; params.push(owner_id); }
    if (client_id) { sql += ` AND o.client_id = $${i++}`; params.push(client_id); }
    if (search) {
      sql += ` AND (LOWER(o.title) LIKE $${i} OR LOWER(COALESCE(c.name, o.prospect_name, '')) LIKE $${i})`;
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
router.get('/opportunities/:id', async (req, res) => {
  try {
    const { rows } = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    let timeline = [];
    try {
      const tl = await query(
        `SELECT a.*, t.name AS user_name
         FROM activity_log a LEFT JOIN team t ON t.id = a.user_id
         WHERE a.entity_type = 'opportunity' AND a.entity_id = $1
         ORDER BY a.created_at DESC LIMIT 30`,
        [req.params.id]
      );
      timeline = tl.rows;
    } catch (e) { /* timestamp/column shape differs — return empty timeline */ }
    res.json({ opportunity: rows[0], timeline });
  } catch (err) {
    console.error('BD get opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/bd/opportunities   (existing client OR new prospect)
router.post('/opportunities', async (req, res) => {
  try {
    const { client_id, prospect_name, title, stage, value, owner_id, source, expected_close, next_step } = req.body;
    if (!title || (!client_id && !prospect_name)) {
      return res.status(400).json({ error: 'Title and either a client or a new company name are required' });
    }
    const st = ALL_STAGES.includes(stage) ? stage : 'Prospecting';
    const { rows } = await query(
      `INSERT INTO bd_opportunities
         (client_id, prospect_name, title, stage, value, owner_id, source, expected_close, next_step, created_by, last_stage_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, NOW()) RETURNING id`,
      [client_id || null, client_id ? null : (prospect_name || null).toString().trim(), title.trim(), st,
       value || 0, owner_id || req.user.id, source || null, expected_close || null, next_step || null, req.user.id]
    );
    logActivity('created', rows[0].id, { title, stage: st }, req.user.id);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [rows[0].id]);
    res.status(201).json({ opportunity: full.rows[0] });
  } catch (err) {
    console.error('BD create opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/bd/opportunities/:id/stage   { stage, lost_reason? }
router.patch('/opportunities/:id/stage', async (req, res) => {
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
    logActivity('stage_changed', req.params.id, { from: prev.rows[0].stage, to: stage }, req.user.id);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    res.json({ opportunity: full.rows[0] });
  } catch (err) {
    console.error('BD move stage error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/bd/opportunities/:id   (edit fields)
router.patch('/opportunities/:id', async (req, res) => {
  try {
    const allowed = ['title', 'value', 'owner_id', 'source', 'expected_close', 'next_step', 'notes', 'client_id', 'prospect_name'];
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
router.delete('/opportunities/:id', authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    await query('DELETE FROM bd_opportunities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('BD delete opportunity error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════ TASKS ═══════════════════════ */

router.get('/tasks', async (req, res) => {
  try {
    const { owner_id, done } = req.query;
    let sql = `
      SELECT bt.*,
        t.name AS owner_name, t.avatar_color AS owner_color,
        ct.name AS completed_by_name,
        COALESCE(c.name, o.prospect_name) AS client_name,
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

router.post('/tasks', async (req, res) => {
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

router.patch('/tasks/:id/toggle', async (req, res) => {
  try {
    const cur = await query('SELECT done FROM bd_tasks WHERE id = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Not found' });
    const nd = !cur.rows[0].done;
    await query(
      `UPDATE bd_tasks SET done = $1, completed_by = $2, completed_at = $3 WHERE id = $4`,
      [nd, nd ? req.user.id : null, nd ? new Date() : null, req.params.id]
    );
    res.json({ done: nd });
  } catch (err) {
    console.error('BD toggle task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await query('DELETE FROM bd_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('BD delete task error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ═══════════════════════ OVERVIEW (dashboard KPIs) ═══════════════════════ */

router.get('/overview', async (req, res) => {
  try {
    const period = ['week', 'month', 'quarter'].includes(req.query.period) ? req.query.period : 'month';
    const since = new Date();
    if (period === 'week') since.setDate(since.getDate() - 7);
    else if (period === 'quarter') since.setMonth(since.getMonth() - 3);
    else since.setMonth(since.getMonth() - 1);

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

    const wl = await query(
      `SELECT stage, COUNT(*)::int AS count, COALESCE(SUM(value),0)::float AS value
       FROM bd_opportunities WHERE stage IN ('Won','Lost') AND updated_at >= $1 GROUP BY stage`,
      [since]
    );
    const won = wl.rows.find((r) => r.stage === 'Won') || { count: 0, value: 0 };
    const lost = wl.rows.find((r) => r.stage === 'Lost') || { count: 0, value: 0 };
    const winRate = (won.count + lost.count) ? Math.round((won.count / (won.count + lost.count)) * 100) : 0;

    let placedRevenue = 0;
    try {
      const pr = await query(
        `SELECT COALESCE(SUM(fee_amount),0)::float AS total FROM placements WHERE joining_date >= $1`,
        [since]
      );
      placedRevenue = pr.rows[0].total;
    } catch (e) { /* placements shape differs — leave at 0 */ }

    const topOpps = await query(
      OPP_SELECT + ` WHERE o.stage IN ('Prospecting','Qualified','Proposal','Negotiation')
       ORDER BY o.value DESC NULLS LAST LIMIT 5`
    );
    const tasksDue = await query(
      `SELECT bt.*, COALESCE(c.name, o.prospect_name) AS client_name, t.name AS owner_name
       FROM bd_tasks bt
       LEFT JOIN clients c ON c.id = bt.client_id
       LEFT JOIN bd_opportunities o ON o.id = bt.opportunity_id
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
