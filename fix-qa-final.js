const fs = require('fs');
let f = fs.readFileSync('src/app/(dashboard)/candidates/[id]/page.tsx', 'utf8');

// Find and replace the entire STATUS_COLORS block
const oldPattern = /const STATUS_COLORS: Record<string, string> = \{[^}]+\};/s;
const newColors = `const STATUS_COLORS: Record<string, string> = {
  'AM Review Pending': 'bg-gray-100 text-gray-700',
  'AM Review Select': 'bg-blue-100 text-blue-700',
  'Client Review Pending': 'bg-purple-100 text-purple-700',
  'Interview': 'bg-amber-100 text-amber-700',
  'Offered': 'bg-teal-100 text-teal-700',
  'Joined': 'bg-green-100 text-green-700',
  'Rejected': 'bg-red-100 text-red-700',
  'On Hold': 'bg-yellow-100 text-yellow-700',
  'Dropped': 'bg-gray-200 text-gray-600',
};`;

if (oldPattern.test(f)) {
  f = f.replace(oldPattern, newColors);
  console.log('✅ Fixed: candidate detail status colors updated');
} else {
  console.log('⚠️  Could not find STATUS_COLORS block');
}

fs.writeFileSync('src/app/(dashboard)/candidates/[id]/page.tsx', f);
