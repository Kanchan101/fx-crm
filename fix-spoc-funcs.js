const fs = require('fs');
let f = fs.readFileSync('src/app/(dashboard)/clients/page.tsx', 'utf8');

// Check imports
if (!f.includes('getToken')) {
  if (f.includes("import { api }")) {
    f = f.replace("import { api }", "import { api, getToken }");
  } else if (f.includes("import { api,")) {
    f = f.replace("import { api,", "import { api, getToken,");
  }
}

// Add API constant if missing
if (!f.includes('const API')) {
  f = f.replace(
    "export default function",
    "const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';\n\nexport default function"
  );
}

// Add functions before openEdit
if (!f.includes('fetchClientSpocs')) {
  f = f.replace(
    '  const openEdit = (client: Client) => {',
    `  const fetchClientSpocs = async (clientId: string) => {
    try {
      const res = await fetch(\`\${API}/api/clients/\${clientId}/spocs\`, { headers: { Authorization: \`Bearer \${getToken()}\` } });
      const data = await res.json();
      setAdditionalSpocs(data.spocs || []);
    } catch(e) { console.error(e); }
  };

  const addSpoc = async (clientId: string) => {
    if (!newSpoc.name || !newSpoc.email) return;
    try {
      await fetch(\`\${API}/api/clients/\${clientId}/spocs\`, {
        method: 'POST',
        headers: { Authorization: \`Bearer \${getToken()}\`, 'Content-Type': 'application/json' },
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
      await fetch(\`\${API}/api/clients/\${clientId}/spocs/\${spocId}\`, {
        method: 'DELETE',
        headers: { Authorization: \`Bearer \${getToken()}\` },
      });
      fetchClientSpocs(clientId);
    } catch(e) { console.error(e); }
  };

  const openEdit = (client: Client) => {`
  );
}

// Add fetchClientSpocs call when opening edit
if (!f.includes('fetchClientSpocs(client.id)')) {
  f = f.replace(
    'const openEdit = (client: Client) => {\n    setEditingClient(client);',
    'const openEdit = (client: Client) => {\n    setEditingClient(client);\n    fetchClientSpocs(client.id);'
  );
}

fs.writeFileSync('src/app/(dashboard)/clients/page.tsx', f);
console.log('Done - SPOC functions added');
