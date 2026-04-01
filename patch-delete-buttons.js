const fs = require('fs');

// 1. Requirements page - add delete button in stats area
let req = fs.readFileSync('src/app/(dashboard)/requirements/page.tsx', 'utf8');
if (!req.includes('handleDeleteReq(req.id')) {
  req = req.replace(
    `{/* Assigned avatars */}`,
    `{/* Delete */}
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteReq(req.id, req.title); }}
                    className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors" title="Delete requirement">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  {/* Assigned avatars */}`
  );
  console.log('✅ Requirements: delete button added');
}
fs.writeFileSync('src/app/(dashboard)/requirements/page.tsx', req);

// 2. Candidates page - add delete button after score/owner area
let cand = fs.readFileSync('src/app/(dashboard)/candidates/page.tsx', 'utf8');
if (!cand.includes('handleDeleteCand(c.id')) {
  cand = cand.replace(
    `<div className="text-right text-xs text-gray-400">
                    <p>{c.owner_name}</p>
                    <p>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>`,
    `<div className="text-right text-xs text-gray-400">
                    <p>{c.owner_name}</p>
                    <p>{new Date(c.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteCand(c.id, c.name); }}
                    className="w-7 h-7 rounded-lg bg-red-50 hover:bg-red-100 flex items-center justify-center text-red-500 transition-colors" title="Delete candidate">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>`
  );
  console.log('✅ Candidates: delete button added');
}
fs.writeFileSync('src/app/(dashboard)/candidates/page.tsx', cand);

console.log('Done! Run: npm run build');
