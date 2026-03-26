const fs = require('fs');
let c = fs.readFileSync('routes/candidates.js', 'utf8');

const m1 = "router.post('/', authenticate, async (req, res) => {";
const m2 = "router.put('/:id'";
const i1 = c.indexOf(m1);
const i2 = c.indexOf(m2, i1 + 1);
if (i1 === -1 || i2 === -1) { console.log('Not found', i1, i2); process.exit(1); }

const newPost = `router.post('/', authenticate, async (req, res) => {
  try {
    const b = req.body;
    if (!b.name) return res.status(400).json({ error: 'Name required' });
    let safeCvText = null;
    if (b.cv_text && typeof b.cv_text === 'string') {
      safeCvText = '';
      for (let i = 0; i < b.cv_text.length; i++) {
        const code = b.cv_text.charCodeAt(i);
        if (code > 31 || code === 10 || code === 13 || code === 9) safeCvText += b.cv_text[i];
      }
    }
    console.log('[Candidate] Saving:', b.name, 'cv_storage_path:', b.cv_storage_path || 'NONE');
    const result = await transaction(async (client) => {
      const cr = await client.query(
        'INSERT INTO candidates (name, email, phone, location, experience_years, skills, "current_role", current_company, education, current_ctc_fixed, current_ctc_variable, expected_ctc_fixed, expected_ctc_variable, notice_period, last_working_day, holding_offer, holding_offer_details, referral_name, referral_phone, referral_bonus_eligible, assessment_soft_skills, assessment_stability, assessment_technical, assessment_experience, cv_text, cv_url, owner_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *',
        [b.name, b.email, b.phone, b.location, b.experience_years || null, b.skills, b.current_role, b.current_company, b.education, b.current_ctc_fixed || null, b.current_ctc_variable || null, b.expected_ctc_fixed || null, b.expected_ctc_variable || null, b.notice_period, b.last_working_day || null, b.holding_offer || false, b.holding_offer_details, b.referral_name, b.referral_phone, b.referral_bonus_eligible || false, b.assessment_soft_skills || null, b.assessment_stability || null, b.assessment_technical || null, b.assessment_experience || null, safeCvText, b.cv_storage_path || null, req.user.id]
      );
      const candidate = cr.rows[0];
      console.log('[Candidate] Saved OK:', candidate.name, 'cv_url:', candidate.cv_url || 'STILL NULL');
      if (b.job_id) {
        await client.query('INSERT INTO pipeline (candidate_id, job_id, status, ai_match_percent, ai_match_details, updated_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [candidate.id, b.job_id, 'New', b.ai_match_percent || null, b.ai_match_details ? JSON.stringify(b.ai_match_details) : null, req.user.id]);
        await client.query('INSERT INTO candidate_status_history (candidate_id, job_id, new_status, changed_by) VALUES ($1,$2,$3,$4)', [candidate.id, b.job_id, 'New', req.user.id]);
      }
      await client.query('INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)', [req.user.id, 'CREATE', 'candidate', candidate.id, JSON.stringify({ name: b.name })]);
      return candidate;
    });
    res.status(201).json({ candidate: result });
  } catch (err) { console.error('Create candidate error:', err); res.status(500).json({ error: 'Server error' }); }
});

`;

fs.writeFileSync('routes/candidates.js', c.substring(0, i1) + newPost + c.substring(i2));
console.log('DONE - POST route patched');
