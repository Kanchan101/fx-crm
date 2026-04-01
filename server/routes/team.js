const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /api/team — list all team members with stats
router.get('/', authenticate, async (req, res) => {
  try {
    const result = await query(`
      SELECT t.id, t.name, t.email, t.role, t.phone, t.is_active, t.last_login, t.created_at,
        (SELECT COUNT(*) FROM candidates c WHERE c.owner_id = t.id) as total_candidates,
        (SELECT COUNT(*) FROM pipeline p
         JOIN candidates c ON c.id = p.candidate_id
         WHERE c.owner_id = t.id AND p.status = 'Client Review Pending'
         AND p.created_at >= DATE_TRUNC('month', NOW())) as monthly_submissions,
        (SELECT COUNT(*) FROM pipeline p
         JOIN candidates c ON c.id = p.candidate_id
         WHERE c.owner_id = t.id AND p.status = 'Joined') as total_placements,
        (SELECT COUNT(*) FROM job_assignments ja WHERE ja.team_member_id = t.id) as assigned_positions
      FROM team t
      ORDER BY t.role, t.name
    `);
    res.json({ team: result.rows });
  } catch (err) {
    console.error('List team error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/team/:id — single team member
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, name, email, role, phone, is_active, last_login, created_at FROM team WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team member not found' });
    res.json({ member: result.rows[0] });
  } catch (err) {
    console.error('Get team member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/team — add team member (Super Admin only)
router.post('/', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }

    const validRoles = ['Super Admin', 'Account Manager', 'Recruiter'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const existing = await query('SELECT id FROM team WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already exists' });
    }

    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO team (name, email, password_hash, role, phone) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, role, phone, is_active, created_at',
      [name, email, hash, role, phone || null]
    );

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'CREATE', 'team', result.rows[0].id, JSON.stringify({ name, role })]
    );

    res.status(201).json({ member: result.rows[0] });
  } catch (err) {
    console.error('Create team member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/team/:id — update team member (Super Admin only)
router.put('/:id', authenticate, authorize('Super Admin'), async (req, res) => {
  try {
    const { name, email, role, phone, is_active, password } = req.body;

    let sql, params;
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      sql = `UPDATE team SET name=$1, email=$2, role=$3, phone=$4, is_active=$5, password_hash=$6, updated_at=NOW() WHERE id=$7
             RETURNING id, name, email, role, phone, is_active, created_at`;
      params = [name, email, role, phone || null, is_active, hash, req.params.id];
    } else {
      sql = `UPDATE team SET name=$1, email=$2, role=$3, phone=$4, is_active=$5, updated_at=NOW() WHERE id=$6
             RETURNING id, name, email, role, phone, is_active, created_at`;
      params = [name, email, role, phone || null, is_active, req.params.id];
    }

    const result = await query(sql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Team member not found' });

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'UPDATE', 'team', req.params.id, JSON.stringify({ name, role })]
    );

    res.json({ member: result.rows[0] });
  } catch (err) {
    console.error('Update team member error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
