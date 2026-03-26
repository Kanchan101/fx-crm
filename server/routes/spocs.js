const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/clients/:clientId/spocs
router.get('/:clientId/spocs', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM client_spocs WHERE client_id = $1 ORDER BY is_primary DESC, name',
      [req.params.clientId]
    );
    res.json({ spocs: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/clients/:clientId/spocs
router.post('/:clientId/spocs', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { name, email, phone, designation, is_primary } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });

    if (is_primary) {
      await query('UPDATE client_spocs SET is_primary = false WHERE client_id = $1', [req.params.clientId]);
    }

    const result = await query(
      'INSERT INTO client_spocs (client_id, name, email, phone, designation, is_primary) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.clientId, name, email, phone, designation, is_primary || false]
    );
    res.status(201).json({ spoc: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/clients/:clientId/spocs/:spocId
router.put('/:clientId/spocs/:spocId', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { name, email, phone, designation, is_primary } = req.body;
    if (is_primary) {
      await query('UPDATE client_spocs SET is_primary = false WHERE client_id = $1', [req.params.clientId]);
    }
    const result = await query(
      'UPDATE client_spocs SET name=$1, email=$2, phone=$3, designation=$4, is_primary=$5 WHERE id=$6 AND client_id=$7 RETURNING *',
      [name, email, phone, designation, is_primary || false, req.params.spocId, req.params.clientId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ spoc: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/clients/:clientId/spocs/:spocId
router.delete('/:clientId/spocs/:spocId', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    await query('DELETE FROM client_spocs WHERE id = $1 AND client_id = $2', [req.params.spocId, req.params.clientId]);
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
