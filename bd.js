const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { callClaude, SMART_MODEL } = require('../lib/ai');

const router = express.Router();

const OPEN_STAGES = ['Prospecting', 'Qualified', 'Proposal', 'Negotiation'];
const ALL_STAGES = [...OPEN_STAGES, 'Won', 'Lost'];
const PROB = { Prospecting: 10, Qualified: 25, Proposal: 50, Negotiation: 75, Won: 100, Lost: 0 };

const OPP_SELECT = `
  SELECT o.*,
    COALESCE(c.name, p.name, o.prospect_name) AS client_name,
    (o.client_id IS NULL) AS is_prospect,
    c.tier    AS client_tier,
    c.vertical AS client_vertical,
    t.name    AS owner_name,
    NULL::text AS owner_color,
    GREATEST(0, DATE_PART('day', NOW() - o.last_stage_at))::int AS idle_days
  FROM bd_opportunities o
  LEFT JOIN clients c ON c.id = o.client_id
  LEFT JOIN bd_prospects p ON p.id = o.prospect_id
  LEFT JOIN team t    ON t.id = o.owner_id
`;

function logActivity(action, entityType, entityId, details, userId) {
  query(
    `INSERT INTO activity_log (user_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId || null, action, entityType, entityId, JSON.stringify(details || {})]
  ).catch((e) => console.warn('activity_log insert skipped:', e.message));
}

/* ═══════════════════════ ACCESS ═══════════════════════ */
router.get('/my-access', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'Super Admin') return res.json({ access: true });
    const { rows } = await query('SELECT role, bd_access FROM team WHERE id = $1', [req.user.id]);
    const ok = rows.length && (rows[0].role === 'Super Admin' || rows[0].bd_access === true);
    res.json({ access: !!ok });
  } catch (err) { res.json({ access: false }); }
});

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

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'Super Admin') return res.status(403).json({ error: 'Super Admin only' });
  next();
};

router.get('/access', adminOnly, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, email, role, COALESCE(bd_access, false) AS bd_access
       FROM team WHERE is_active = true ORDER BY name`
    );
    res.json({ members: rows });
  } catch (err) { console.error('BD access list error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/access/:teamId', adminOnly, async (req, res) => {
  try {
    const { bd_access } = req.body;
    await query('UPDATE team SET bd_access = $1 WHERE id = $2', [bd_access === true, req.params.teamId]);
    res.json({ success: true, bd_access: bd_access === true });
  } catch (err) { console.error('BD access update error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ OPPORTUNITIES ═══════════════════════ */

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
  } catch (err) { console.error('BD list opportunities error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/opportunities/:id', async (req, res) => {
  try {
    const { rows } = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ opportunity: rows[0] });
  } catch (err) { console.error('BD get opportunity error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.post('/opportunities', async (req, res) => {
  try {
    const { client_id, prospect_name, title, stage, value, owner_id, source, expected_close, next_step } = req.body;
    if (!title || (!client_id && !prospect_name)) {
      return res.status(400).json({ error: 'Title and either a client or a new company name are required' });
    }
    const st = ALL_STAGES.includes(stage) ? stage : 'Prospecting';

    // A "new company" is a Prospect that lives in BD (never in the clients table).
    // Reuse an existing prospect of the same name, otherwise create one.
    let prospectId = null;
    if (!client_id) {
      const nm = String(prospect_name || '').trim();
      const found = await query('SELECT id FROM bd_prospects WHERE LOWER(name) = LOWER($1) LIMIT 1', [nm]);
      if (found.rows.length) prospectId = found.rows[0].id;
      else {
        const np = await query('INSERT INTO bd_prospects (name, created_by) VALUES ($1, $2) RETURNING id', [nm, req.user.id]);
        prospectId = np.rows[0].id;
      }
    }

    const { rows } = await query(
      `INSERT INTO bd_opportunities
         (client_id, prospect_id, prospect_name, title, stage, value, owner_id, source, expected_close, next_step, created_by, last_stage_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW()) RETURNING id`,
      [client_id || null, prospectId, client_id ? null : String(prospect_name || '').trim(), title.trim(), st,
       value || 0, owner_id || req.user.id, source || null, expected_close || null, next_step || null, req.user.id]
    );
    logActivity('created', 'opportunity', rows[0].id, { title, stage: st }, req.user.id);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [rows[0].id]);
    res.status(201).json({ opportunity: full.rows[0] });
  } catch (err) { console.error('BD create opportunity error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/opportunities/:id/stage', async (req, res) => {
  try {
    const { stage, lost_reason } = req.body;
    if (!ALL_STAGES.includes(stage)) return res.status(400).json({ error: 'Invalid stage' });
    const prev = await query('SELECT stage FROM bd_opportunities WHERE id = $1', [req.params.id]);
    if (!prev.rows.length) return res.status(404).json({ error: 'Not found' });
    await query(
      `UPDATE bd_opportunities SET stage = $1, lost_reason = $2, last_stage_at = NOW(), updated_at = NOW() WHERE id = $3`,
      [stage, stage === 'Lost' ? (lost_reason || null) : null, req.params.id]
    );
    logActivity('stage_changed', 'opportunity', req.params.id, { from: prev.rows[0].stage, to: stage }, req.user.id);
    const full = await query(OPP_SELECT + ' WHERE o.id = $1', [req.params.id]);
    res.json({ opportunity: full.rows[0] });
  } catch (err) { console.error('BD move stage error:', err); res.status(500).json({ error: 'Server error' }); }
});

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
  } catch (err) { console.error('BD edit opportunity error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/opportunities/:id', authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    await query('DELETE FROM bd_opportunities WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error('BD delete opportunity error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ ACCOUNTS (BD lens on clients) ═══════════════════════ */

// List clients with their BD aggregates.
router.get('/accounts', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT c.id, c.name, c.vertical, c.tier,
        COUNT(o.id) FILTER (WHERE o.stage IN ('Prospecting','Qualified','Proposal','Negotiation'))::int AS open_count,
        COALESCE(SUM(o.value) FILTER (WHERE o.stage IN ('Prospecting','Qualified','Proposal','Negotiation')),0)::float AS open_value,
        COUNT(o.id) FILTER (WHERE o.stage = 'Won')::int AS won_count,
        MAX(o.updated_at) AS last_activity
       FROM clients c
       LEFT JOIN bd_opportunities o ON o.client_id = c.id
       WHERE COALESCE(c.status, '') <> 'Prospect'
       GROUP BY c.id, c.name, c.vertical, c.tier
       ORDER BY open_value DESC, c.name`
    );
    res.json({ accounts: rows });
  } catch (err) { console.error('BD accounts list error:', err); res.status(500).json({ error: 'Server error' }); }
});

// One account: client info, its opportunities, contacts, stats, and timeline.
router.get('/accounts/:clientId', async (req, res) => {
  try {
    const cid = req.params.clientId;
    const clientRes = await query(
      `SELECT id, name, vertical, tier, location, status, spoc_name, spoc_role, spoc_email,
              fee_percent, payment_terms FROM clients WHERE id = $1`, [cid]
    );
    if (!clientRes.rows.length) return res.status(404).json({ error: 'Account not found' });

    const oppsRes = await query(OPP_SELECT + ' WHERE o.client_id = $1 ORDER BY o.value DESC NULLS LAST', [cid]);
    const opps = oppsRes.rows;

    const stats = {
      openCount: opps.filter((o) => OPEN_STAGES.includes(o.stage)).length,
      openValue: opps.filter((o) => OPEN_STAGES.includes(o.stage)).reduce((a, o) => a + Number(o.value || 0), 0),
      wonCount: opps.filter((o) => o.stage === 'Won').length,
      wonValue: opps.filter((o) => o.stage === 'Won').reduce((a, o) => a + Number(o.value || 0), 0),
    };

    let contacts = [];
    try {
      const cs = await query(
        `SELECT id, name, designation, email, phone, is_primary, COALESCE(bd_authority, '') AS authority
         FROM client_spocs WHERE client_id = $1 ORDER BY is_primary DESC, name`, [cid]
      );
      contacts = cs.rows;
    } catch (e) { /* client_spocs shape differs */ }

    let timeline = [];
    try {
      const oppIds = opps.map((o) => o.id);
      const tl = await query(
        `SELECT a.action, a.entity_type, a.details, a.created_at, t.name AS user_name
         FROM activity_log a LEFT JOIN team t ON t.id = a.user_id
         WHERE (a.entity_type = 'client' AND a.entity_id = $1)
            OR (a.entity_type = 'opportunity' AND a.entity_id = ANY($2::uuid[]))
         ORDER BY a.created_at DESC LIMIT 40`,
        [cid, oppIds]
      );
      timeline = tl.rows;
    } catch (e) { /* activity_log shape differs — empty timeline */ }

    let account_notes = null;
    try {
      const nres = await query(
        `SELECT n.notes, n.updated_at, t.name AS updated_by_name
         FROM bd_account_notes n LEFT JOIN team t ON t.id = n.updated_by
         WHERE n.client_id = $1`, [cid]
      );
      account_notes = nres.rows[0] || null;
    } catch (e) { /* notes table missing */ }

    res.json({ account: clientRes.rows[0], opportunities: opps, contacts, stats, timeline, account_notes });
  } catch (err) { console.error('BD account detail error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Log a note onto an account's timeline.
router.post('/accounts/:clientId/note', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: 'Note text is required' });
    logActivity('note', 'client', req.params.clientId, { text: String(text).trim() }, req.user.id);
    res.status(201).json({ success: true });
  } catch (err) { console.error('BD account note error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Save (upsert) the running handover notes for an account.
router.put('/accounts/:clientId/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    await query(
      `INSERT INTO bd_account_notes (client_id, notes, updated_by, updated_at)
       VALUES ($1,$2,$3,NOW())
       ON CONFLICT (client_id) DO UPDATE
         SET notes = EXCLUDED.notes, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [req.params.clientId, notes || '', req.user.id]
    );
    res.json({ success: true });
  } catch (err) { console.error('BD save notes error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ CONTACTS ═══════════════════════ */

router.post('/accounts/:clientId/contacts', async (req, res) => {
  try {
    const { name, designation, email, phone, authority, is_primary } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Contact name is required' });
    if (is_primary === true) await query('UPDATE client_spocs SET is_primary = false WHERE client_id = $1', [req.params.clientId]);
    const { rows } = await query(
      `INSERT INTO client_spocs (client_id, name, designation, email, phone, is_primary, bd_authority)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.params.clientId, name.trim(), designation || null, email || null, phone || null, is_primary === true, authority || null]
    );
    logActivity('contact_added', 'client', req.params.clientId, { name: name.trim() }, req.user.id);
    res.status(201).json({ id: rows[0].id });
  } catch (err) { console.error('BD add contact error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/contacts/:contactId', async (req, res) => {
  try {
    const { name, designation, email, phone, authority, is_primary } = req.body;
    if (is_primary === true) {
      const c = await query('SELECT client_id FROM client_spocs WHERE id = $1', [req.params.contactId]);
      if (c.rows.length) await query('UPDATE client_spocs SET is_primary = false WHERE client_id = $1', [c.rows[0].client_id]);
    }
    const map = { name, designation, email, phone, bd_authority: authority, is_primary };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(map)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(v); } }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.contactId);
    await query(`UPDATE client_spocs SET ${sets.join(', ')} WHERE id = $${i}`, params);
    res.json({ success: true });
  } catch (err) { console.error('BD update contact error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/contacts/:contactId', async (req, res) => {
  try {
    await query('DELETE FROM client_spocs WHERE id = $1', [req.params.contactId]);
    res.json({ success: true });
  } catch (err) { console.error('BD delete contact error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ PROSPECTS (BD-only companies, not clients) ═══════════════════════ */

// One prospect: its details, opportunities, contacts.
router.get('/prospects/:id', async (req, res) => {
  try {
    const pid = req.params.id;
    const pRes = await query('SELECT * FROM bd_prospects WHERE id = $1', [pid]);
    if (!pRes.rows.length) return res.status(404).json({ error: 'Prospect not found' });
    const oppsRes = await query(OPP_SELECT + ' WHERE o.prospect_id = $1 ORDER BY o.value DESC NULLS LAST', [pid]);
    const opps = oppsRes.rows;
    const stats = {
      openCount: opps.filter((o) => OPEN_STAGES.includes(o.stage)).length,
      openValue: opps.filter((o) => OPEN_STAGES.includes(o.stage)).reduce((a, o) => a + Number(o.value || 0), 0),
      wonCount: opps.filter((o) => o.stage === 'Won').length,
    };
    let contacts = [];
    try {
      const cs = await query(
        `SELECT id, name, designation, email, phone, is_primary, COALESCE(authority,'') AS authority
         FROM bd_prospect_contacts WHERE prospect_id = $1 ORDER BY is_primary DESC, name`, [pid]);
      contacts = cs.rows;
    } catch (e) { /* table missing */ }
    res.json({ prospect: pRes.rows[0], opportunities: opps, contacts, stats });
  } catch (err) { console.error('BD prospect detail error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Update prospect fields (name, sector).
router.patch('/prospects/:id', async (req, res) => {
  try {
    const { name, sector } = req.body;
    const sets = []; const params = []; let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); params.push(String(name).trim()); }
    if (sector !== undefined) { sets.push(`sector = $${i++}`); params.push(sector); }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at = NOW()'); params.push(req.params.id);
    await query(`UPDATE bd_prospects SET ${sets.join(', ')} WHERE id = $${i}`, params);
    res.json({ success: true });
  } catch (err) { console.error('BD prospect update error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Save the prospect's handover notes.
router.put('/prospects/:id/notes', async (req, res) => {
  try {
    await query('UPDATE bd_prospects SET notes = $1, updated_at = NOW() WHERE id = $2', [req.body.notes || '', req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error('BD prospect notes error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Prospect contacts (people) — stored in BD, separate from client contacts.
router.post('/prospects/:id/contacts', async (req, res) => {
  try {
    const { name, designation, email, phone, authority, is_primary } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Contact name is required' });
    if (is_primary === true) await query('UPDATE bd_prospect_contacts SET is_primary = false WHERE prospect_id = $1', [req.params.id]);
    await query(
      `INSERT INTO bd_prospect_contacts (prospect_id, name, designation, email, phone, authority, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [req.params.id, name.trim(), designation || null, email || null, phone || null, authority || null, is_primary === true]
    );
    res.status(201).json({ success: true });
  } catch (err) { console.error('BD prospect add contact error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.patch('/prospect-contacts/:contactId', async (req, res) => {
  try {
    const { name, designation, email, phone, authority, is_primary } = req.body;
    if (is_primary === true) {
      const c = await query('SELECT prospect_id FROM bd_prospect_contacts WHERE id = $1', [req.params.contactId]);
      if (c.rows.length) await query('UPDATE bd_prospect_contacts SET is_primary = false WHERE prospect_id = $1', [c.rows[0].prospect_id]);
    }
    const map = { name, designation, email, phone, authority, is_primary };
    const sets = []; const params = []; let i = 1;
    for (const [k, v] of Object.entries(map)) { if (v !== undefined) { sets.push(`${k} = $${i++}`); params.push(v); } }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.contactId);
    await query(`UPDATE bd_prospect_contacts SET ${sets.join(', ')} WHERE id = $${i}`, params);
    res.json({ success: true });
  } catch (err) { console.error('BD prospect edit contact error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/prospect-contacts/:contactId', async (req, res) => {
  try {
    await query('DELETE FROM bd_prospect_contacts WHERE id = $1', [req.params.contactId]);
    res.json({ success: true });
  } catch (err) { console.error('BD prospect delete contact error:', err); res.status(500).json({ error: 'Server error' }); }
});

// Onboard a prospect: they've come onboard, so they become a real Client.
// Creates the client, moves contacts + notes + opportunities over, and marks the prospect onboarded.
router.post('/prospects/:id/onboard', authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const pRes = await query('SELECT * FROM bd_prospects WHERE id = $1', [req.params.id]);
    if (!pRes.rows.length) return res.status(404).json({ error: 'Prospect not found' });
    const p = pRes.rows[0];
    if (p.onboarded_client_id) return res.json({ client_id: p.onboarded_client_id });

    const ins = await query(
      `INSERT INTO clients (name, vertical, created_by) VALUES ($1, $2, $3) RETURNING id`,
      [p.name, p.sector || null, req.user.id]
    );
    const clientId = ins.rows[0].id;

    // Move contacts into the shared client contacts table.
    try {
      await query(
        `INSERT INTO client_spocs (client_id, name, designation, email, phone, is_primary, bd_authority)
         SELECT $1, name, designation, email, phone, is_primary, authority
         FROM bd_prospect_contacts WHERE prospect_id = $2`,
        [clientId, req.params.id]
      );
    } catch (e) { console.warn('onboard contacts copy skipped:', e.message); }

    // Move handover notes.
    if (p.notes) {
      try {
        await query(
          `INSERT INTO bd_account_notes (client_id, notes, updated_by, updated_at)
           VALUES ($1,$2,$3,NOW()) ON CONFLICT (client_id) DO UPDATE SET notes = EXCLUDED.notes`,
          [clientId, p.notes, req.user.id]
        );
      } catch (e) { console.warn('onboard notes copy skipped:', e.message); }
    }

    // Relink opportunities from the prospect to the new client.
    await query('UPDATE bd_opportunities SET client_id = $1, prospect_id = NULL, prospect_name = NULL WHERE prospect_id = $2', [clientId, req.params.id]);
    await query('UPDATE bd_prospects SET onboarded_client_id = $1, updated_at = NOW() WHERE id = $2', [clientId, req.params.id]);
    logActivity('onboarded', 'client', clientId, { from_prospect: p.name }, req.user.id);
    res.status(201).json({ client_id: clientId });
  } catch (err) { console.error('BD onboard error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ AI STRATEGY BUILDER ═══════════════════════ */

router.post('/strategy', async (req, res) => {
  try {
    const { target_name, sector, notes } = req.body;
    if (!target_name || !String(target_name).trim()) return res.status(400).json({ error: 'Target company name is required' });

    // Ground the playbook in our OWN book of business.
    const clientsRes = await query(
      `SELECT name, vertical, tier FROM clients ORDER BY name LIMIT 80`
    );
    const rolesRes = await query(
      `SELECT DISTINCT title FROM jobs WHERE title IS NOT NULL AND title <> '' ORDER BY title LIMIT 60`
    );
    const clientList = clientsRes.rows.map((c) => `${c.name}${c.vertical ? ' (' + c.vertical + ')' : ''}`).join('; ') || 'None on record';
    const roleList = rolesRes.rows.map((r) => r.title).join('; ') || 'General IT & engineering roles';

    const prompt = `You are the head of business development at FX Consulting, an Indian IT & engineering recruitment firm. Build a concise, practical account-based playbook to WIN a new B2B client for our recruitment services: "${target_name.trim()}"${sector ? ` (sector: ${sector})` : ''}. This is B2B sales — winning the company as a client that hires through us. It is NOT about poaching their employees.

OUR EXISTING CLIENTS (use ONLY these real names as proof points — pick the 2 to 4 most comparable to the target's space):
${clientList}

ROLES WE ACTIVELY RECRUIT FOR:
${roleList}

${notes ? `EXTRA CONTEXT FROM THE BD LEAD: ${notes}\n` : ''}
Rules: Be specific and India-context aware. Currency is INR. Do NOT invent statistics or client names not listed above. Keep each text field tight (1-3 sentences). Map roles the target likely hires to roles we already recruit.

Return ONLY valid JSON, no prose, in exactly this shape:
{
  "target": "${target_name.trim()}",
  "sector": "best guess of the target's sector",
  "hypothesis": "why they are likely hiring now and where our help fits (2-3 sentences)",
  "positioning": "our tailored value proposition for this target (2-3 sentences)",
  "proof_points": [{"client": "one of our real clients above", "relevance": "why this makes us credible for the target"}],
  "roles_to_target": ["specific role titles the target likely hires that we staff"],
  "stakeholders": [{"title": "role to reach e.g. VP Talent Acquisition", "why": "why they matter", "approach": "how to open"}],
  "outreach_sequence": [{"step": 1, "channel": "LinkedIn/Email/Referral/Call", "angle": "the message angle"}],
  "objections": [{"objection": "a likely pushback", "response": "how we answer it"}],
  "first_meeting_goals": ["what a first meeting should achieve"],
  "suggested_opportunities": [{"title": "a concrete mandate to pursue", "rationale": "why"}]
}`;

    const result = await callClaude(prompt, { model: SMART_MODEL, maxTokens: 4000 });
    if (result === null) return res.status(503).json({ error: 'AI is not configured on the server (missing API key).' });
    if (typeof result === 'string') return res.status(502).json({ error: 'The AI returned an unexpected response. Please try again.' });

    const saved = await query(
      `INSERT INTO bd_playbooks (target_name, sector, playbook, created_by)
       VALUES ($1,$2,$3,$4) RETURNING id, target_name, sector, playbook, created_at`,
      [target_name.trim(), sector || result.sector || null, JSON.stringify(result), req.user.id]
    );
    res.status(201).json({ playbook: saved.rows[0] });
  } catch (err) {
    console.error('BD strategy error:', err);
    res.status(500).json({ error: 'Could not generate the playbook. Please try again.' });
  }
});

router.get('/playbooks', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT p.id, p.target_name, p.sector, p.created_at, t.name AS created_by_name
       FROM bd_playbooks p LEFT JOIN team t ON t.id = p.created_by
       ORDER BY p.created_at DESC LIMIT 100`
    );
    res.json({ playbooks: rows });
  } catch (err) { console.error('BD playbooks list error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.get('/playbooks/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM bd_playbooks WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ playbook: rows[0] });
  } catch (err) { console.error('BD playbook get error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/playbooks/:id', async (req, res) => {
  try {
    await query('DELETE FROM bd_playbooks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error('BD playbook delete error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ TASKS ═══════════════════════ */

router.get('/tasks', async (req, res) => {
  try {
    const { owner_id, done } = req.query;
    let sql = `
      SELECT bt.*,
        t.name AS owner_name, NULL::text AS owner_color,
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
  } catch (err) { console.error('BD list tasks error:', err); res.status(500).json({ error: 'Server error' }); }
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
  } catch (err) { console.error('BD create task error:', err); res.status(500).json({ error: 'Server error' }); }
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
  } catch (err) { console.error('BD toggle task error:', err); res.status(500).json({ error: 'Server error' }); }
});

router.delete('/tasks/:id', async (req, res) => {
  try {
    await query('DELETE FROM bd_tasks WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { console.error('BD delete task error:', err); res.status(500).json({ error: 'Server error' }); }
});

/* ═══════════════════════ OVERVIEW ═══════════════════════ */

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
      const pr = await query(`SELECT COALESCE(SUM(fee_amount),0)::float AS total FROM placements WHERE joining_date >= $1`, [since]);
      placedRevenue = pr.rows[0].total;
    } catch (e) { /* placements shape differs */ }

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
      period, stages, openValue, openCount, weighted,
      wonCount: won.count, wonValue: won.value, lostCount: lost.count, winRate, placedRevenue,
      topOpportunities: topOpps.rows, tasksDue: tasksDue.rows,
    });
  } catch (err) { console.error('BD overview error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;
