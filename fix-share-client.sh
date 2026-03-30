#!/bin/bash
# FX CRM — Hide client name in Share JD
# Run from: cd /Users/kanchankuwarbi/Downloads/fx-crm && bash fix-share-client.sh

set -e
echo "🔧 Hiding client name from Share JD..."

cat > fix-client-share.js << 'EOF'
const fs = require('fs');
const fp = 'src/app/(dashboard)/requirements/[id]/page.tsx';
let c = fs.readFileSync(fp, 'utf8');

// Add a helper function to anonymize client name based on domain/industry
const helperFunc = `
  // Anonymize client name for public sharing
  const getPublicCompanyLabel = () => {
    if (!requirement) return 'A leading company';
    const domain = (requirement.client_domain || requirement.client_industry || '').toLowerCase();
    if (domain.includes('hvac') || domain.includes('engineering')) return 'A world-leading manufacturing company in the HVAC space';
    if (domain.includes('internet') || domain.includes('ecommerce') || domain.includes('e-commerce')) return 'One of India\\'s leading internet companies';
    if (domain.includes('it product') || domain.includes('technology')) return 'A leading technology product company';
    if (domain.includes('it services')) return 'A prominent IT services company';
    if (domain.includes('bfsi') || domain.includes('banking') || domain.includes('finance')) return 'A top BFSI company';
    if (domain.includes('telecom')) return 'A leading telecom company';
    if (domain.includes('healthcare') || domain.includes('pharma')) return 'A leading healthcare company';
    if (domain.includes('automotive')) return 'A major automotive company';
    if (domain.includes('retail')) return 'A leading retail brand';
    if (domain.includes('manufacturing')) return 'A leading manufacturing company';
    return 'A leading company in the ' + (requirement.client_industry || 'industry') + ' space';
  };

`;

// Insert helper after publicUrl declaration
c = c.replace(
  "const publicUrl = `https://crm.fxconsulting.in/jobs/${params.id}`;",
  "const publicUrl = `https://crm.fxconsulting.in/jobs/${params.id}`;" + helperFunc
);

// Fix shareLinkedInPost — replace client_name with anonymized label
c = c.replace(
  /const shareLinkedInPost = \(\) => \{[\s\S]*?doCopy\(t, 'li-post'\);\s*\};/,
  `const shareLinkedInPost = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    const t = \`🚀 We're Hiring: \${requirement.title}\\n\\n📍 \${requirement.location} | \${requirement.type}\\n🏢 \${company}\\n📅 Experience: \${requirement.exp_min}-\${requirement.exp_max} years\\n\${requirement.skills ? \`\\n🔧 Skills: \${requirement.skills}\\n\` : ''}\\n\${(requirement.description || '').substring(0, 400)}\\n\\nApply: \${publicUrl}\\n\\n#hiring #jobs #recruitment\`;
    doCopy(t, 'li-post');
  };`
);

// Fix shareWhatsApp — replace client_name
c = c.replace(
  /const shareWhatsApp = \(\) => \{[\s\S]*?window\.open\(`https:\/\/wa\.me\/[\s\S]*?\};/,
  `const shareWhatsApp = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    const t = \`*\${requirement.title}*\\nCompany: \${company}\\nLocation: \${requirement.location}\\nExperience: \${requirement.exp_min}-\${requirement.exp_max} years\\n\${requirement.skills ? \`\\nSkills: \${requirement.skills}\` : ''}\\n\\nApply: \${publicUrl}\`;
    window.open(\`https://wa.me/?text=\${encodeURIComponent(t)}\`, '_blank');
  };`
);

// Fix shareJobBoard — replace client_name
c = c.replace(
  /const shareJobBoard = \(\) => \{[\s\S]*?doCopy\(t, 'board'\);\s*\};/,
  `const shareJobBoard = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    const t = \`Job Title: \${requirement.title}\\nCompany: \${company}\\nLocation: \${requirement.location}\\nType: \${requirement.type}\\nExperience: \${requirement.exp_min}-\${requirement.exp_max} years\\n\\nSkills Required:\\n\${requirement.skills || 'Not specified'}\\n\\nJob Description:\\n\${requirement.description || 'Not specified'}\\n\\nHow to Apply:\\nSend CV to careers@fxconsulting.in with subject "\${requirement.title} Application"\`;
    doCopy(t, 'board');
  };`
);

// Fix shareEmail — replace client_name
c = c.replace(
  /const shareEmail = \(\) => \{[\s\S]*?window\.open\(`mailto:[\s\S]*?\};/,
  `const shareEmail = () => {
    if (!requirement) return;
    const company = getPublicCompanyLabel();
    window.open(\`mailto:?subject=\${encodeURIComponent(\`Job: \${requirement.title} - \${company}\`)}&body=\${encodeURIComponent(\`\${requirement.title}\\n\${company}\\n\${requirement.location}\\nExp: \${requirement.exp_min}-\${requirement.exp_max}y\\n\\n\${publicUrl}\`)}\`, '_blank');
  };`
);

// Also fix the public JD page — hide client name there too
const pubFp = 'src/app/jobs/[id]/page.tsx';
let pub = fs.readFileSync(pubFp, 'utf8');

// In public page, don't show raw client name
// Replace company display with industry-based label
if (!pub.includes('getPublicLabel')) {
  pub = pub.replace(
    "const [job, setJob] = useState<any>(null);",
    `const [job, setJob] = useState<any>(null);
  const getPublicLabel = (j: any) => {
    if (!j) return '';
    const ind = (j.industry || '').toLowerCase();
    if (ind.includes('hvac') || ind.includes('engineering')) return 'A world-leading manufacturing company in the HVAC space';
    if (ind.includes('internet')) return 'One of India\\'s leading internet companies';
    if (ind.includes('technology')) return 'A leading technology product company';
    if (ind.includes('it services')) return 'A prominent IT services company';
    if (ind.includes('telecom')) return 'A leading telecom company';
    if (ind.includes('healthcare')) return 'A leading healthcare company';
    return 'A leading ' + (j.industry || '') + ' company';
  };`
  );

  // Replace {job.company} with getPublicLabel(job) in display
  pub = pub.replace(/<span>\{job\.company\}<\/span>/g, '<span>{getPublicLabel(job)}</span>');
  pub = pub.replace(/{job\.company}/g, '{getPublicLabel(job)}');

  fs.writeFileSync(pubFp, pub);
  console.log('Public JD page updated — client name hidden');
}

// Also update the public page layout.tsx meta tags
const layoutFp = 'src/app/jobs/[id]/layout.tsx';
if (fs.existsSync(layoutFp)) {
  let layout = fs.readFileSync(layoutFp, 'utf8');
  // Replace job.company in meta with generic label
  layout = layout.replace(
    '`${job.title} at ${job.company}',
    '`${job.title} — ${job.location}'
  );
  layout = layout.replace(
    '${job.company} |',
    '|'
  );
  fs.writeFileSync(layoutFp, layout);
  console.log('Meta tags updated — no client name in LinkedIn preview');
}

fs.writeFileSync(fp, c);
console.log('Share functions updated — client name replaced with industry label');
EOF
node fix-client-share.js
rm fix-client-share.js
echo "✅ Done"

echo ""
echo "=========================================="
echo "Client name hidden from all public shares"
echo "=========================================="
echo ""
echo "What changed:"
echo "  - LinkedIn Post: 'A world-leading manufacturing company in HVAC space'"
echo "  - WhatsApp: same anonymized label"
echo "  - Job Boards: same anonymized label"
echo "  - Email share: same"
echo "  - Public JD page: shows industry label, not client name"
echo "  - LinkedIn preview meta: no client name"
echo ""
echo "Mapping:"
echo "  BB (Technology)     → 'A leading technology product company'"
echo "  StatusNeo (IT Svc)  → 'A prominent IT services company'"
echo "  Shaadi.com (Internet) → 'One of India's leading internet companies'"
echo "  TT (HVAC)           → 'A world-leading manufacturing company in HVAC space'"
echo ""
echo "Internal CRM pages still show real client names."
echo ""
echo "Deploy: npm run build && git add . && git commit -m 'Hide client in public shares' && git push"
