const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// POST /api/candidates/check-duplicate
router.post('/check-duplicate', authenticate, async (req, res) => {
  try {
    const { email, phone, name } = req.body;

    if (!email && !phone) {
      return res.json({ duplicate: false });
    }

    let sql = `
      SELECT ca.id, ca.name, ca.email, ca.phone, ca.location,
        ca.experience_years, ca."current_role", ca.current_company,
        ca.skills, ca.created_at, t.name as uploaded_by,
        (SELECT string_agg(DISTINCT j.title || ' (' || cl.name || ')', ', ')
         FROM pipeline p JOIN jobs j ON j.id = p.job_id JOIN clients cl ON cl.id = j.client_id
         WHERE p.candidate_id = ca.id) as mapped_positions,
        (SELECT string_agg(DISTINCT p.status, ', ')
         FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_statuses
      FROM candidates ca
      LEFT JOIN team t ON t.id = ca.owner_id
      WHERE 1=1
    `;
    const params = [];
    let idx = 1;
    const conditions = [];

    if (email && email.trim()) {
      conditions.push(`LOWER(ca.email) = LOWER($${idx++})`);
      params.push(email.trim());
    }
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        conditions.push(`ca.phone = $${idx++}`);
        params.push(cleanPhone);
      }
    }

    if (conditions.length === 0) {
      return res.json({ duplicate: false });
    }

    sql += ` AND (${conditions.join(' OR ')})`;
    sql += ' ORDER BY ca.created_at DESC';

    const result = await query(sql, params);

    if (result.rows.length > 0) {
      res.json({
        duplicate: true,
        matches: result.rows.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          location: c.location,
          experience_years: c.experience_years,
          current_role: c.current_role,
          current_company: c.current_company,
          skills: c.skills ? c.skills.substring(0, 100) : null,
          uploaded_by: c.uploaded_by,
          uploaded_on: c.created_at,
          mapped_positions: c.mapped_positions,
          pipeline_statuses: c.pipeline_statuses,
        })),
      });
    } else {
      res.json({ duplicate: false });
    }
  } catch (err) {
    console.error('Duplicate check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
