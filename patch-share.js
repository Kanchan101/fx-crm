// patch-share.js — Run from fx-crm root: node patch-share.js
const fs = require('fs');
const filePath = 'src/app/(dashboard)/requirements/[id]/page.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add Globe import if missing
if (!code.includes('Globe,') && !code.includes('Globe }')) {
  code = code.replace(
    "Check, X, ExternalLink, Share2, FileText,",
    "Check, X, ExternalLink, Share2, FileText, Globe,"
  );
}

// 2. Add showShare state after copied state
if (!code.includes('showShare')) {
  code = code.replace(
    "const [copied, setCopied] = useState('');",
    "const [copied, setCopied] = useState('');\n  const [showShare, setShowShare] = useState(false);"
  );
}

// 3. Add Share helper functions before "if (loading) return"
if (!code.includes('shareLinkedInPost')) {
  code = code.replace(
    '  if (loading) return',
    `  // --- Share helpers ---
  const publicUrl = \`https://crm.fxconsulting.in/jobs/\${params.id}\`;

  const shareLinkedInPost = () => {
    if (!requirement) return;
    const t = \`🚀 We're Hiring: \${requirement.title}\\n\\n📍 \${requirement.location} | \${requirement.type}\\n🏢 \${requirement.client_name}\\n📅 Experience: \${requirement.exp_min}-\${requirement.exp_max} years\\n\${requirement.skills ? \`\\n🔧 Skills: \${requirement.skills}\\n\` : ''}\\n\${(requirement.description || '').substring(0, 400)}\\n\\nApply: \${publicUrl}\\n\\n#hiring #jobs #recruitment\`;
    copyText(t, 'li-post');
  };

  const shareLinkedInLink = () => {
    window.open(\`https://www.linkedin.com/sharing/share-offsite/?url=\${encodeURIComponent(publicUrl)}\`, '_blank');
  };

  const shareWhatsApp = () => {
    if (!requirement) return;
    const t = \`*\${requirement.title}*\\nCompany: \${requirement.client_name}\\nLocation: \${requirement.location}\\nExperience: \${requirement.exp_min}-\${requirement.exp_max} years\\n\${requirement.skills ? \`\\nSkills: \${requirement.skills}\` : ''}\\n\\nApply: \${publicUrl}\`;
    window.open(\`https://wa.me/?text=\${encodeURIComponent(t)}\`, '_blank');
  };

  const shareJobBoard = () => {
    if (!requirement) return;
    const t = \`Job Title: \${requirement.title}\\nCompany: \${requirement.client_name}\\nLocation: \${requirement.location}\\nType: \${requirement.type}\\nExperience: \${requirement.exp_min}-\${requirement.exp_max} years\\n\\nSkills Required:\\n\${requirement.skills || 'Not specified'}\\n\\nJob Description:\\n\${requirement.description || 'Not specified'}\\n\\nHow to Apply:\\nSend CV to careers@fxconsulting.in with subject "\${requirement.title} Application"\`;
    copyText(t, 'board');
  };

  const shareEmail = () => {
    if (!requirement) return;
    window.open(\`mailto:?subject=\${encodeURIComponent(\`Job: \${requirement.title} at \${requirement.client_name}\`)}&body=\${encodeURIComponent(\`\${requirement.title}\\n\${requirement.client_name}\\n\${requirement.location}\\nExp: \${requirement.exp_min}-\${requirement.exp_max}y\\n\\n\${publicUrl}\`)}\`, '_blank');
  };

  const shareLink = () => { copyText(publicUrl, 'link'); };

  if (loading) return`
  );
}

// 4. Add Share JD button in header (after AI Outreach button)
if (!code.includes('Share JD')) {
  code = code.replace(
    `<button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
            <Sparkles className="w-3 h-3" /> AI Outreach
          </button>`,
    `<button onClick={() => openOutreach()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-medium transition-colors">
            <Sparkles className="w-3 h-3" /> AI Outreach
          </button>
          <button onClick={() => setShowShare(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
            <Share2 className="w-3 h-3" /> Share JD
          </button>`
  );
}

// 5. Add Share JD modal before SEND CVs MODAL
if (!code.includes('SHARE JD MODAL')) {
  code = code.replace(
    '{/* ===== SEND CVs MODAL ===== */}',
    `{/* ===== SHARE JD MODAL ===== */}
      {showShare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div><h2 className="text-lg font-semibold text-gray-900">Share JD</h2><p className="text-xs text-gray-400 mt-0.5">{requirement.title} — {requirement.client_name}</p></div>
              <button onClick={() => setShowShare(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                { id: 'li-post', name: 'LinkedIn Post', icon: Linkedin, color: 'bg-[#0077B5]', label: copied === 'li-post' ? 'Copied!' : 'Copy Post', desc: 'Copy formatted post with hashtags', action: shareLinkedInPost },
                { id: 'li-share', name: 'LinkedIn Share', icon: ExternalLink, color: 'bg-[#0077B5]', label: 'Open LinkedIn', desc: 'Share JD link on LinkedIn', action: shareLinkedInLink },
                { id: 'wa', name: 'WhatsApp', icon: MessageSquare, color: 'bg-[#25D366]', label: 'Share', desc: 'Send JD to WhatsApp group', action: shareWhatsApp },
                { id: 'board', name: 'IIMJobs / Hirist / Naukri', icon: Globe, color: 'bg-orange-500', label: copied === 'board' ? 'Copied!' : 'Copy JD', desc: 'Copy formatted JD for job boards', action: shareJobBoard },
                { id: 'mail', name: 'Email', icon: Mail, color: 'bg-gray-600', label: 'Compose', desc: 'Open email with JD details', action: shareEmail },
                { id: 'link', name: 'Public Link', icon: Copy, color: 'bg-fx-600', label: copied === 'link' ? 'Copied!' : 'Copy Link', desc: publicUrl, action: shareLink },
              ].map(p => {
                const Icon = p.icon;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-3 border border-gray-100 rounded-xl hover:bg-gray-50">
                    <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center text-white shrink-0', p.color)}><Icon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium text-gray-900">{p.name}</p><p className="text-[11px] text-gray-400 truncate">{p.desc}</p></div>
                    <button onClick={p.action} className={clsx('px-3 py-1.5 rounded-lg text-xs font-medium', p.label.includes('Copied') ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700')}>{p.label}</button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 pb-5"><div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700"><strong>Tip:</strong> For IIMJobs, Hirist, Naukri — click "Copy JD" then paste into their posting form.</div></div>
          </div>
        </div>
      )}

      {/* ===== SEND CVs MODAL ===== */}`
  );
}

fs.writeFileSync(filePath, code);
console.log('✅ Share JD restored successfully!');
console.log('  - Share JD button in header');
console.log('  - LinkedIn Post (copy), LinkedIn Share (open), WhatsApp, IIMJobs/Naukri, Email, Public Link');
