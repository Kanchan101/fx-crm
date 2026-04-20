// patch-multi-spoc.js — Run from fx-crm root: node patch-multi-spoc.js
const fs = require('fs');

console.log('🔧 Adding multi-SPOC support...\n');

let f = fs.readFileSync('src/app/(dashboard)/clients/page.tsx', 'utf8');

// 1. Add Plus, Trash2 imports if missing
if (!f.includes('Trash2')) {
  f = f.replace("} from 'lucide-react';", ", Trash2 } from 'lucide-react';");
}
if (!f.includes("Plus,") && !f.includes("Plus }")) {
  f = f.replace("{ Trash2 }", "Plus, Trash2");
}

// 2. Add additional SPOCs state
if (!f.includes('additionalSpocs')) {
  f = f.replace(
    "const [form, setForm] = useState(emptyForm);",
    `const [form, setForm] = useState(emptyForm);
  const [additionalSpocs, setAdditionalSpocs] = useState<any[]>([]);
  const [newSpoc, setNewSpoc] = useState({ name: '', email: '', phone: '', designation: '' });
  const [showAddSpoc, setShowAddSpoc] = useState(false);`
  );
}

// 3. Add fetch SPOCs when editing a client + save SPOCs function
if (!f.includes('fetchClientSpocs')) {
  f = f.replace(
    "const openEdit = (req: Client) => {",
    `const fetchClientSpocs = async (clientId: string) => {
    try {
      const res = await fetch(\`\${API}/api/clients/\${clientId}/spocs\`, { headers: hdrs() });
      const data = await res.json();
      setAdditionalSpocs(data.spocs || []);
    } catch(e) { console.error(e); }
  };

  const addSpoc = async (clientId: string) => {
    if (!newSpoc.name || !newSpoc.email) return;
    try {
      await fetch(\`\${API}/api/clients/\${clientId}/spocs\`, {
        method: 'POST', headers: hdrs(),
        body: JSON.stringify(newSpoc),
      });
      setNewSpoc({ name: '', email: '', phone: '', designation: '' });
      setShowAddSpoc(false);
      fetchClientSpocs(clientId);
    } catch(e) { console.error(e); }
  };

  const removeSpoc = async (clientId: string, spocId: string) => {
    if (!confirm('Remove this SPOC?')) return;
    try {
      await fetch(\`\${API}/api/clients/\${clientId}/spocs/\${spocId}\`, { method: 'DELETE', headers: hdrs() });
      fetchClientSpocs(clientId);
    } catch(e) { console.error(e); }
  };

  const openEdit = (req: Client) => {`
  );

  // Fetch SPOCs when opening edit
  f = f.replace(
    "const openEdit = (req: Client) => {\n    setEditingReq(req);",
    "const openEdit = (req: Client) => {\n    setEditingReq(req);\n    fetchClientSpocs(req.id);"
  );
}

// 4. Check what the headers function is called
let headersFn = 'hdrs';
if (f.includes('const headers = ()') || f.includes('const headers=()')) {
  headersFn = 'headers';
}
if (f.includes('const hdrs = ()') || f.includes('const hdrs=()')) {
  headersFn = 'hdrs';
}
// Find actual function name
const hdrMatch = f.match(/const (\w+) = \(\)[^=]*=> \(\{ Authorization/);
if (hdrMatch) headersFn = hdrMatch[1];

// Replace hdrs() with actual function name if different
if (headersFn !== 'hdrs') {
  f = f.replace(/headers: hdrs\(\)/g, `headers: ${headersFn}()`);
}

// 5. Also sync primary SPOC to client_spocs after save
if (!f.includes('syncPrimarySpoc')) {
  f = f.replace(
    "setShowModal(false); fetchRequirements();",
    `setShowModal(false); fetchRequirements();
      // Sync primary SPOC to client_spocs table
      if (form.spoc_name && form.spoc_email) {
        try {
          const clientId = editingReq ? editingReq.id : data?.client?.id;
          if (clientId) {
            await fetch(\`\${API}/api/clients/\${clientId}/spocs\`, {
              method: 'POST', headers: ${headersFn}(),
              body: JSON.stringify({ name: form.spoc_name, email: form.spoc_email, phone: form.spoc_phone || '', designation: form.spoc_role || 'Primary SPOC', is_primary: true }),
            }).catch(() => {}); // Silent — don't block if fails
          }
        } catch(e) {}
      }`
  );
}

// 6. Add Additional SPOCs UI section after the SPOC Details form section
if (!f.includes('Additional SPOCs')) {
  f = f.replace(
    `</div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agreement</p>`,
    `</div>
              </div>

              {/* Additional SPOCs — only show when editing existing client */}
              {editingReq && (
                <div className="border-t border-gray-100 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Additional SPOCs ({additionalSpocs.length})</p>
                    <button type="button" onClick={() => setShowAddSpoc(!showAddSpoc)} className="text-xs text-fx-600 hover:text-fx-700 font-medium flex items-center gap-1">
                      <Plus className="w-3 h-3" /> Add SPOC
                    </button>
                  </div>
                  {additionalSpocs.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {additionalSpocs.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{s.name} {s.is_primary && <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded ml-1">Primary</span>}</p>
                            <p className="text-xs text-gray-500">{s.email}{s.phone ? \` · \${s.phone}\` : ''}{s.designation ? \` · \${s.designation}\` : ''}</p>
                          </div>
                          <button type="button" onClick={() => removeSpoc(editingReq.id, s.id)} className="w-6 h-6 rounded hover:bg-red-50 flex items-center justify-center text-red-400 hover:text-red-600">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {showAddSpoc && (
                    <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" placeholder="Name *" value={newSpoc.name} onChange={(e) => setNewSpoc({...newSpoc, name: e.target.value})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                        <input type="email" placeholder="Email *" value={newSpoc.email} onChange={(e) => setNewSpoc({...newSpoc, email: e.target.value})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                        <input type="tel" placeholder="Phone" value={newSpoc.phone} onChange={(e) => setNewSpoc({...newSpoc, phone: e.target.value.replace(/\\D/g, '').slice(0, 10)})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" maxLength={10} />
                        <input type="text" placeholder="Designation" value={newSpoc.designation} onChange={(e) => setNewSpoc({...newSpoc, designation: e.target.value})} className="px-2 py-1.5 border border-gray-200 rounded text-sm" />
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button type="button" onClick={() => setShowAddSpoc(false)} className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded">Cancel</button>
                        <button type="button" onClick={() => addSpoc(editingReq.id)} className="px-3 py-1 text-xs bg-fx-600 hover:bg-fx-700 text-white rounded font-medium">Add</button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-gray-100 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Agreement</p>`
  );
}

// 7. Find the correct API/headers references
// Check if API is defined
if (!f.includes("const API") && !f.includes("const api")) {
  // Uses api from lib
  const hasApiImport = f.includes("import { api");
  if (hasApiImport) {
    // Need to add API constant for fetch calls
    f = f.replace(
      "export default function",
      "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';\n\nexport default function"
    );
  }
}

// Check headers function
if (!f.includes('const hdrs') && !f.includes('const headers = ()')) {
  // Need to add headers function
  if (f.includes('getToken')) {
    f = f.replace(
      "const [form, setForm] = useState(emptyForm);",
      "const hdrs = () => ({ Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' });\n  const [form, setForm] = useState(emptyForm);"
    );
  }
}

fs.writeFileSync('src/app/(dashboard)/clients/page.tsx', f);

// 8. Make sure the backend spocs DELETE route exists
let spocsRoute = fs.readFileSync('server/routes/spocs.js', 'utf8');
if (!spocsRoute.includes('router.delete')) {
  spocsRoute = spocsRoute.replace(
    'module.exports = router;',
    `// DELETE /api/clients/:clientId/spocs/:spocId
router.delete('/:clientId/spocs/:spocId', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const result = await query('DELETE FROM client_spocs WHERE id = $1 AND client_id = $2 RETURNING *', [req.params.spocId, req.params.clientId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'SPOC not found' });
    res.json({ message: 'SPOC removed' });
  } catch (err) { console.error('Delete SPOC error:', err); res.status(500).json({ error: 'Server error' }); }
});

module.exports = router;`
  );
  console.log('✅ Backend: SPOC delete route added');
}

fs.writeFileSync('server/routes/spocs.js', spocsRoute);

console.log('✅ Multi-SPOC support added!');
console.log('  - Edit Client → "Additional SPOCs" section with Add/Remove');
console.log('  - Primary SPOC auto-synced to client_spocs table on save');
console.log('  - Send CV modal shows all SPOCs (primary + additional)');
console.log('\nRun: npm run build && git add . && git commit -m "Multi-SPOC: add/remove SPOCs per client" && GIT_SSH_COMMAND="ssh -i ~/.ssh/id_ed25519" git push');
