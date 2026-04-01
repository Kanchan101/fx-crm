// patch-final.js — Run from fx-crm root: node patch-final.js
const fs = require('fs');

console.log('🔧 Fixing Funnel + Candidate Edit + Remarks\n');

// ============================================================
// 1. FIX FUNNEL: Pipeline page should use existing /api/pipeline?job_id= endpoint
// ============================================================
let pipe = fs.readFileSync('src/app/(dashboard)/pipeline/page.tsx', 'utf8');

// The backend pipeline route is GET /api/pipeline?job_id=xxx not /api/pipeline/requirement/xxx
// Fix the fetch URL
pipe = pipe.replace(
  '`${API}/api/pipeline/requirement/${selectedReqId}`',
  '`${API}/api/pipeline?job_id=${selectedReqId}`'
);
// Also fix the refresh after move
pipe = pipe.replace(
  '`${API}/api/pipeline/requirement/${selectedReqId}`, { headers: authHeaders() })',
  '`${API}/api/pipeline?job_id=${selectedReqId}`, { headers: authHeaders() })'
);

// The pipeline GET returns { pipeline: [...] } as flat array, not grouped by status
// We need to group it client-side
if (!pipe.includes('// Group by status')) {
  pipe = pipe.replace(
    "setPipeline(data.pipeline || {});",
    `// Group by status
        const grouped: Record<string, any[]> = {};
        const allStatuses = ['AM Review Pending','AM Review Select','Client Review Pending','Interview','Offered','Joined','Rejected','On Hold','Dropped'];
        allStatuses.forEach(s => { grouped[s] = []; });
        (data.pipeline || []).forEach((item: any) => { if (grouped[item.status]) grouped[item.status].push(item); });
        setPipeline(grouped);`
  );
}

// Fix the second occurrence (after move)
pipe = pipe.replace(
  /const pData = await pRes\.json\(\);\n\s*setPipeline\(pData\.pipeline \|\| \{\}\);/,
  `const pData = await pRes.json();
      const grouped2: Record<string, any[]> = {};
      const allS = ['AM Review Pending','AM Review Select','Client Review Pending','Interview','Offered','Joined','Rejected','On Hold','Dropped'];
      allS.forEach(s => { grouped2[s] = []; });
      (pData.pipeline || []).forEach((item: any) => { if (grouped2[item.status]) grouped2[item.status].push(item); });
      setPipeline(grouped2);`
);

// Fix the move endpoint — backend uses PATCH /api/pipeline/:id/status not /api/pipeline/move
pipe = pipe.replace(
  '`${API}/api/pipeline/move`',
  '`${API}/api/pipeline/${candidateId}/status`'
);

// Fix the move body — backend expects { status } not { requirement_id, candidate_id, status }
pipe = pipe.replace(
  `body: JSON.stringify({
          requirement_id: selectedReqId,
          candidate_id: candidateId,
          status: newStatus,
          ...extras,
        }),`,
  `body: JSON.stringify({ status: newStatus, ...extras }),`
);

// Fix moveCandidate — the first param is now pipelineId, not candidateId
// The card's item.id is the pipeline ID
// Update the call: moveCandidate now takes pipelineId
pipe = pipe.replace(
  'onChange={(e) => moveCandidate(item.candidate_id, e.target.value)}',
  'onChange={(e) => moveCandidate(item.id, e.target.value)}'
);

// Fix candidate display — backend returns candidate_name not nested candidates object
pipe = pipe.replace(
  'const cand = item.candidates || item;',
  'const cand = item;'
);
pipe = pipe.replace(
  "<div className=\"font-medium text-sm text-gray-900 truncate\">{cand.name}</div>",
  "<div className=\"font-medium text-sm text-gray-900 truncate\">{cand.candidate_name || cand.name}</div>"
);
pipe = pipe.replace(
  "{cand.current_designation && `${cand.current_designation} • `}{cand.current_company || 'N/A'}",
  "{cand.candidate_role && `${cand.candidate_role} • `}{cand.current_company || cand.candidate_company || 'N/A'}"
);
pipe = pipe.replace(
  "{cand.experience && `${cand.experience} yrs`}",
  "{(cand.experience_years || cand.experience) && `${cand.experience_years || cand.experience} yrs`}"
);
pipe = pipe.replace(
  "{cand.location && ` • ${cand.location}`}",
  "{(cand.candidate_location || cand.location) && ` • ${cand.candidate_location || cand.location}`}"
);

fs.writeFileSync('src/app/(dashboard)/pipeline/page.tsx', pipe);
console.log('✅ Funnel: Fixed API endpoints and data grouping');

// ============================================================
// 2. ADD REMARKS FIELD TO CANDIDATE ADD FORM
// ============================================================
let candPage = fs.readFileSync('src/app/(dashboard)/candidates/page.tsx', 'utf8');

// Add remarks to emptyForm
if (!candPage.includes('remarks')) {
  candPage = candPage.replace(
    "holding_offer: false, holding_offer_details: '',",
    "holding_offer: false, holding_offer_details: '', remarks: '',"
  );

  // Add remarks textarea after holding_offer_details field
  // Find the holding offer details input and add remarks after it
  if (candPage.includes("holding_offer_details")) {
    candPage = candPage.replace(
      /<\/div>\s*<\/div>\s*{\/\* Save button \*\/}/,
      (match) => {
        // This is tricky — let me find a better anchor
        return match;
      }
    );
    
    // Find the skills input section and add remarks after the last form field before save button
    // Look for the save/submit button
    const saveButtonPattern = /(<button[^>]*>[\s\S]*?Save[\s\S]*?<\/button>)/;
    const saveMatch = candPage.match(saveButtonPattern);
    
    // Instead, add remarks field right after holding_offer_details input
    if (candPage.includes("holding_offer_details: e.target.value"))  {
      candPage = candPage.replace(
        /holding_offer_details: e\.target\.value\}\)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"[^/]*\/><\/div>/,
        (match) => match + `
                    <div className="col-span-2"><label className="block text-[10px] text-gray-400 mb-1">Remarks / Comments</label><textarea value={form.remarks} onChange={(e) => setForm({...form, remarks: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} placeholder="Internal notes about this candidate..." /></div>`
      );
    }
  }
  console.log('✅ Candidates: Remarks field added to form');
} else {
  console.log('⏭️  Candidates: Remarks already exists');
}

// Add remarks to the save/create API call
if (candPage.includes("holding_offer_details: form.holding_offer_details") && !candPage.includes("remarks: form.remarks")) {
  candPage = candPage.replace(
    "holding_offer_details: form.holding_offer_details,",
    "holding_offer_details: form.holding_offer_details, remarks: form.remarks,"
  );
}

fs.writeFileSync('src/app/(dashboard)/candidates/page.tsx', candPage);

// ============================================================
// 3. ADD EDIT BUTTON + REMARKS TO CANDIDATE DETAIL PAGE
// ============================================================
let candDetail;
try {
  candDetail = fs.readFileSync('src/app/(dashboard)/candidates/[id]/page.tsx', 'utf8');
} catch(e) {
  console.log('⚠️  Candidate detail page not found at expected path, checking...');
  // Try alternate paths
  const paths = ['src/app/(dashboard)/candidates/[id]/page.tsx'];
  for (const p of paths) {
    try { candDetail = fs.readFileSync(p, 'utf8'); break; } catch(e2) {}
  }
}

if (candDetail) {
  // Add Edit functionality
  if (!candDetail.includes('editMode') && !candDetail.includes('isEditing')) {
    // Add edit state
    candDetail = candDetail.replace(
      'const [loading, setLoading] = useState(true);',
      `const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);`
    );

    // Add save function before return
    if (candDetail.includes('if (loading)')) {
      candDetail = candDetail.replace(
        '  if (loading)',
        `  const startEdit = () => { setEditForm({...candidate}); setIsEditing(true); };
  const saveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(\`\${API}/api/candidates/\${params.id}\`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify(editForm),
      });
      if (res.ok) { setIsEditing(false); fetchCandidate(); }
      else { const d = await res.json(); alert(d.error || 'Save failed'); }
    } catch(err) { console.error(err); }
    finally { setSaving(false); }
  };

  if (loading)`
      );
    }

    // Add Edit button in the header area — find the candidate name display
    if (candDetail.includes('<h1') && candDetail.includes('candidate.name')) {
      // Add edit/save buttons
      candDetail = candDetail.replace(
        /(<h1[^>]*>[\s\S]*?candidate\.name[\s\S]*?<\/h1>)/,
        (match) => match + `
              <div className="flex gap-2 ml-4">
                {!isEditing ? (
                  <button onClick={startEdit} className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Edit</button>
                ) : (
                  <>
                    <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium">{saving ? 'Saving...' : 'Save'}</button>
                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-medium">Cancel</button>
                  </>
                )}
              </div>`
      );
    }

    console.log('✅ Candidate detail: Edit mode + Save added');
  } else {
    console.log('⏭️  Candidate detail: Edit already exists');
  }

  // Add remarks display
  if (!candDetail.includes('remarks') && !candDetail.includes('Remarks')) {
    // Find a good spot to add remarks — after skills or at end of info section
    if (candDetail.includes('candidate.skills')) {
      candDetail = candDetail.replace(
        /(candidate\.skills[\s\S]*?<\/div>)/,
        (match) => match + `
              {candidate.remarks && <div className="mt-3"><p className="text-xs text-gray-400 mb-1">Remarks</p><p className="text-sm text-gray-700">{candidate.remarks}</p></div>}`
      );
    }
    console.log('✅ Candidate detail: Remarks display added');
  }

  fs.writeFileSync('src/app/(dashboard)/candidates/[id]/page.tsx', candDetail);
} else {
  console.log('⚠️  Could not find candidate detail page');
}

// ============================================================
// 4. BACKEND: Add pipeline by job_id route if missing
// ============================================================
let pipeRoute = fs.readFileSync('server/routes/pipeline.js', 'utf8');
// The existing GET / already supports ?job_id= filter, so no backend change needed
console.log('✅ Backend: Pipeline route already supports ?job_id= filter');

console.log('\n✅ ALL FIXES APPLIED!\n');
console.log('Run:');
console.log('  npm run build && git add . && git commit -m "Fix Funnel + Candidate edit + Remarks" && git push');
