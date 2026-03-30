#!/bin/bash
# FX CRM — Duplicate Candidate Detection
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash setup-duplicate.sh

set -e
echo "🚀 FX CRM — Duplicate Detection"
echo ""

# ========================
# BACKEND: Add duplicate check endpoint
# ========================
cat > server/routes/duplicate.js << 'EOF'
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
EOF
echo "✅ server/routes/duplicate.js"

# ========================
# BACKEND: Mount duplicate route inside candidates
# ========================
cat > server/mount-duplicate.js << 'EOF'
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
EOF
cd server && node mount-duplicate.js && cd ..
echo "✅ Duplicate check route mounted"

# ========================
# FRONTEND: Update candidates page — check duplicates after CV parse
# ========================
cat > update-duplicate-ui.js << 'EOF'
const fs = require('fs');
const fp = 'src/app/(dashboard)/candidates/page.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Add duplicate state variables
if (!c.includes('duplicateResult')) {
  // Add state after matchResult state
  c = c.replace(
    "const [matching, setMatching] = useState(false);",
    "const [matching, setMatching] = useState(false);\n  const [duplicateResult, setDuplicateResult] = useState<any>(null);\n  const [duplicateChecking, setDuplicateChecking] = useState(false);"
  );

  // After CV parsing succeeds, trigger duplicate check
  c = c.replace(
    "setCvStep('form');",
    `setCvStep('form');
      // Check for duplicates
      if (p.email || p.phone) {
        setDuplicateChecking(true);
        try {
          const dupRes = await fetch(\`\${API}/api/candidates/check-duplicate\`, {
            method: 'POST',
            headers: { Authorization: \`Bearer \${getToken()}\`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: p.email, phone: (p.phone || '').replace(/\\\\D/g, '').slice(-10) }),
          });
          const dupData = await dupRes.json();
          if (dupData.duplicate) setDuplicateResult(dupData);
          else setDuplicateResult(null);
        } catch (e) { console.error(e); }
        finally { setDuplicateChecking(false); }
      }`
  );

  // Reset duplicate state when opening modal
  c = c.replace(
    "setForm(emptyForm); setCvStep('upload'); setCvFile(null); setMatchResult(null); setError(''); setShowModal(true);",
    "setForm(emptyForm); setCvStep('upload'); setCvFile(null); setMatchResult(null); setDuplicateResult(null); setError(''); setShowModal(true);"
  );

  // Add duplicate warning UI after the CV parsed success message
  c = c.replace(
    '{cvFile && (\n                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">\n                      <Check className="w-4 h-4" /><span className="font-medium">CV parsed:</span> {cvFile.name}\n                    </div>\n                  )}',
    `{cvFile && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 rounded-lg text-sm text-emerald-700">
                      <Check className="w-4 h-4" /><span className="font-medium">CV parsed:</span> {cvFile.name}
                    </div>
                  )}
                  {duplicateChecking && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin" /> Checking for duplicate candidates...
                    </div>
                  )}
                  {duplicateResult && duplicateResult.duplicate && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertCircle className="w-5 h-5 text-amber-600" />
                        <p className="text-sm font-semibold text-amber-800">Duplicate Candidate Found</p>
                      </div>
                      <p className="text-xs text-amber-700 mb-3">A candidate with the same email/phone already exists in the system:</p>
                      {duplicateResult.matches.map((m: any) => (
                        <div key={m.id} className="bg-white rounded-lg border border-amber-100 p-3 mb-2 last:mb-0">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-gray-900">{m.name}</p>
                            <button onClick={() => router.push('/candidates/' + m.id)}
                              className="text-[10px] text-fx-600 hover:underline">View Profile</button>
                          </div>
                          <div className="grid grid-cols-2 gap-1 text-xs text-gray-500">
                            <span>Email: {m.email || '—'}</span>
                            <span>Phone: {m.phone || '—'}</span>
                            <span>Role: {m.current_role || '—'} {m.current_company ? '@ ' + m.current_company : ''}</span>
                            <span>Exp: {m.experience_years || '—'} years</span>
                            <span>Uploaded by: {m.uploaded_by || '—'}</span>
                            <span>Date: {m.uploaded_on ? new Date(m.uploaded_on).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
                          </div>
                          {m.mapped_positions && (
                            <div className="mt-2 pt-2 border-t border-amber-50">
                              <p className="text-[10px] text-amber-600">Already mapped to: {m.mapped_positions}</p>
                              {m.pipeline_statuses && <p className="text-[10px] text-amber-500">Status: {m.pipeline_statuses}</p>}
                            </div>
                          )}
                        </div>
                      ))}
                      <p className="text-[10px] text-amber-600 mt-2">You can still save this candidate if this is a different person with the same contact details.</p>
                    </div>
                  )}`
  );

  fs.writeFileSync(fp, c);
  console.log('Duplicate detection UI added');
} else {
  console.log('Duplicate detection already exists');
}
EOF
node update-duplicate-ui.js
rm update-duplicate-ui.js
echo "✅ Frontend duplicate detection added"

echo ""
echo "=========================================="
echo "Done! Restart backend:"
echo "  cd server && kill \$(lsof -t -i:4000) 2>/dev/null; node index.js"
echo ""
echo "How it works:"
echo "  1. Team member uploads CV → AI parses it"
echo "  2. Immediately after parsing, system checks email + phone"
echo "  3. If match found → yellow warning box appears showing:"
echo "     - Existing candidate name, email, phone"
echo "     - Who uploaded them and when"
echo "     - Which positions they're mapped to"
echo "     - Current pipeline status"
echo "     - 'View Profile' link to see full details"
echo "  4. Team member can still save if it's a different person"
echo ""
echo "Deploy: npm run build && git add . && git commit -m 'Duplicate detection' && git push"
echo ""
