const express = require('express');
const { query } = require('../db');

const router = express.Router();

// GET /api/public/jobs/:id — public JD view (no auth)
router.get('/jobs/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT j.title, j.location, j.type, j.exp_min, j.exp_max, j.description, j.skills,
        j.priority, j.positions_count, j.status,
        c.name as client_name, c.industry as client_industry, c.location as client_location
       FROM jobs j JOIN clients c ON c.id = j.client_id
       WHERE j.id = $1 AND j.status = 'Open'`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Position not found or closed' });
    }

    const job = result.rows[0];

    res.json({
      title: job.title,
      company: job.client_name,
      industry: job.client_industry,
      location: job.location || job.client_location,
      type: job.type,
      experience: `${job.exp_min}-${job.exp_max} years`,
      skills: job.skills,
      description: job.description,
      positions: job.positions_count,
      posted_by: 'FX Consulting',
      apply_info: 'Send your CV to careers@fxconsulting.in',
    });
  } catch (err) {
    console.error('Public JD error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
