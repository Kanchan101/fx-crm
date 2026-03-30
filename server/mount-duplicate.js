const fs = require('fs');
let c = fs.readFileSync('routes/candidates.js', 'utf8');

if (!c.includes('check-duplicate')) {
  // Add the duplicate check route at the top, after the router declaration
  const marker = "const router = express.Router();";
  const idx = c.indexOf(marker);
  if (idx !== -1) {
    const insertPoint = idx + marker.length;
    const duplicateRoute = `

// POST /api/candidates/check-duplicate — check if candidate already exists
router.post('/check-duplicate', authenticate, async (req, res) => {
  try {
    const { email, phone } = req.body;
    if (!email && !phone) return res.json({ duplicate: false });

    const conditions = [];
    const params = [];
    let idx = 1;

    if (email && email.trim()) {
      conditions.push('LOWER(ca.email) = LOWER($' + idx++ + ')');
      params.push(email.trim());
    }
    if (phone && phone.trim()) {
      const cleanPhone = phone.replace(/\\D/g, '').slice(-10);
      if (cleanPhone.length === 10) {
        conditions.push('ca.phone = $' + idx++);
        params.push(cleanPhone);
      }
    }

    if (conditions.length === 0) return res.json({ duplicate: false });

    const result = await query(
      'SELECT ca.id, ca.name, ca.email, ca.phone, ca.location, ca.experience_years, ' +
      'ca."current_role", ca.current_company, ca.created_at, t.name as uploaded_by, ' +
      '(SELECT string_agg(DISTINCT j.title, \\', \\') FROM pipeline p JOIN jobs j ON j.id = p.job_id WHERE p.candidate_id = ca.id) as mapped_positions, ' +
      '(SELECT string_agg(DISTINCT p.status, \\', \\') FROM pipeline p WHERE p.candidate_id = ca.id) as pipeline_statuses ' +
      'FROM candidates ca LEFT JOIN team t ON t.id = ca.owner_id ' +
      'WHERE ' + conditions.join(' OR ') + ' ORDER BY ca.created_at DESC',
      params
    );

    if (result.rows.length > 0) {
      res.json({ duplicate: true, matches: result.rows });
    } else {
      res.json({ duplicate: false });
    }
  } catch (err) {
    console.error('Duplicate check error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});
`;
    c = c.substring(0, insertPoint) + duplicateRoute + c.substring(insertPoint);
    fs.writeFileSync('routes/candidates.js', c);
    console.log('Duplicate check route added to candidates.js');
  }
} else {
  console.log('Duplicate check already exists');
}
