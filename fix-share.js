const fs = require('fs');
const fp = 'src/app/(dashboard)/requirements/page.tsx';
const lines = fs.readFileSync(fp, 'utf8').split('\n');

let start = -1;
let braceCount = 0;
let end = -1;

for (let i = 0; i < lines.length; i++) {
  if (start === -1 && lines[i].includes('shareJob &&')) {
    start = i;
  }
  if (start !== -1 && end === -1) {
    for (const ch of lines[i]) {
      if (ch === '{' || ch === '(') braceCount++;
      if (ch === '}' || ch === ')') braceCount--;
    }
    if (braceCount <= 0 && i > start) {
      end = i;
      break;
    }
  }
}

if (start !== -1 && end !== -1) {
  console.log('Removing lines', start + 1, 'to', end + 1);
  lines.splice(start, end - start + 1);
} else {
  console.log('Block not found');
}

const result = lines.filter(function(l) { return l.indexOf('import ShareJD') === -1; }).join('\n');
fs.writeFileSync(fp, result);
console.log('Done');
