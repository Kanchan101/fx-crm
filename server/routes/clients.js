const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients — list all clients with filters
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, tier, vertical, search, sort_by, sort_order } = req.query;
    let sql = `
      SELECT c.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id AND j.status = 'Open') as open_positions,
        (SELECT COUNT(*) FROM jobs j WHERE j.client_id = c.id) as total_positions,
        t.name as created_by_name
      FROM clients c
      LEFT JOIN team t ON t.id = c.created_by
      WHERE 1=1
    `;
    const params = [];
    let paramIdx = 1;

    if (status && status !== 'All') {
      sql += ` AND c.status = $${paramIdx++}`;
      params.push(status);
    }
    if (tier && tier !== 'All') {
      sql += ` AND c.tier = $${paramIdx++}`;
      params.push(tier);
    }
    if (vertical && vertical !== 'All') {
      sql += ` AND c.vertical = $${paramIdx++}`;
      params.push(vertical);
    }
    if (search) {
      sql += ` AND (LOWER(c.name) LIKE $${paramIdx} OR LOWER(c.spoc_name) LIKE $${paramIdx} OR LOWER(c.location) LIKE $${paramIdx})`;
      params.push(`%${search.toLowerCase()}%`);
      paramIdx++;
    }

    const validSorts = ['name', 'tier', 'status', 'created_at', 'location'];
    const sortCol = validSorts.includes(sort_by) ? sort_by : 'created_at';
    const sortDir = sort_order === 'asc' ? 'ASC' : 'DESC';
    sql += ` ORDER BY c.${sortCol} ${sortDir}`;

    const result = await query(sql, params);
    res.json({ clients: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('List clients error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/clients/:id — single client with positions
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.*, t.name as created_by_name FROM clients c
       LEFT JOIN team t ON t.id = c.created_by WHERE c.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    const positions = await query(
      `SELECT j.*, (SELECT COUNT(*) FROM pipeline p WHERE p.job_id = j.id) as candidates_count
       FROM jobs j WHERE j.client_id = $1 ORDER BY j.created_at DESC`,
      [req.params.id]
    );

    res.json({ client: result.rows[0], positions: positions.rows });
  } catch (err) {
    console.error('Get client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients — create client (AM + Super Admin only)
router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const {
      name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
      location, tier, fee_percent, payment_terms, contract_end_date, notes
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const result = await query(
      `INSERT INTO clients (name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
        location, tier, fee_percent, payment_terms, contract_end_date, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
       location, tier, fee_percent || null, payment_terms, contract_end_date || null, notes, req.user.id]
    );

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'CREATE', 'client', result.rows[0].id, JSON.stringify({ name })]
    );

    res.status(201).json({ client: result.rows[0] });
  } catch (err) {
    console.error('Create client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/:id — update client
router.put('/:id', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const {
      name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
      location, tier, fee_percent, payment_terms, contract_end_date, status, notes
    } = req.body;

    const result = await query(
      `UPDATE clients SET
        name=$1, industry=$2, vertical=$3, domain=$4, spoc_name=$5, spoc_role=$6,
        spoc_email=$7, spoc_phone=$8, location=$9, tier=$10, fee_percent=$11,
        payment_terms=$12, contract_end_date=$13, status=$14, notes=$15, updated_at=NOW()
       WHERE id=$16 RETURNING *`,
      [name, industry, vertical, domain, spoc_name, spoc_role, spoc_email, spoc_phone,
       location, tier, fee_percent || null, payment_terms, contract_end_date || null, status, notes, req.params.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'UPDATE', 'client', req.params.id, JSON.stringify({ name })]
    );

    res.json({ client: result.rows[0] });
  } catch (err) {
    console.error('Update client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/clients/:id — Super Admin only
router.delete('/:id', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    const result = await query('DELETE FROM clients WHERE id = $1 RETURNING name', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'DELETE', 'client', req.params.id, JSON.stringify({ name: result.rows[0].name })]
    );

    res.json({ message: 'Client deleted' });
  } catch (err) {
    console.error('Delete client error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
