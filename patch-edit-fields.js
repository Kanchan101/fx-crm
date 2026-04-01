// patch-edit-fields.js — Run from fx-crm root: node patch-edit-fields.js
const fs = require('fs');
let f = fs.readFileSync('src/app/(dashboard)/candidates/[id]/page.tsx', 'utf8');

// Replace the Professional Details section with editable version
f = f.replace(
  `<h3 className="text-sm font-semibold text-gray-900 mb-4">Professional Details</h3>
            <div className="space-y-3">
              {[
                { label: 'Current Role', value: c.current_role },
                { label: 'Company', value: c.current_company },
                { label: 'Experience', value: c.experience_years ? \`\${c.experience_years} years\` : null },
                { label: 'Education', value: c.education },
                { label: 'Location', value: c.location },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between">
                  <span className="text-xs text-gray-400 w-28 shrink-0">{label}</span>
                  <span className="text-sm text-gray-800 text-right">{value || '—'}</span>
                </div>
              ))}
            </div>`,
  `<h3 className="text-sm font-semibold text-gray-900 mb-4">Professional Details</h3>
            <div className="space-y-3">
              {[
                { label: 'Current Role', key: 'current_role' },
                { label: 'Company', key: 'current_company' },
                { label: 'Experience (years)', key: 'experience_years' },
                { label: 'Education', key: 'education' },
                { label: 'Location', key: 'location' },
                { label: 'Email', key: 'email' },
                { label: 'Phone', key: 'phone' },
              ].map(({ label, key }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-gray-400 w-28 shrink-0 pt-1">{label}</span>
                  {isEditing ? (
                    <input type={key === 'experience_years' ? 'number' : 'text'} value={editForm[key] || ''} onChange={(e) => setEditForm({...editForm, [key]: e.target.value})} className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm text-right" />
                  ) : (
                    <span className="text-sm text-gray-800 text-right">{key === 'experience_years' && c[key] ? c[key] + ' years' : (c[key] || '—')}</span>
                  )}
                </div>
              ))}
            </div>`
);

// Replace Skills section with editable version
f = f.replace(
  `{c.skills && (
              <div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">Skills</p>
                <div className="flex flex-wrap gap-1.5">
                  {c.skills.split(',').map((skill: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 bg-fx-50 text-fx-700 rounded text-xs">{skill.trim()}</span>
                  ))}
                </div>
              </div>
            )}`,
  `<div className="mt-4 pt-4 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">Skills</p>
                {isEditing ? (
                  <input type="text" value={editForm.skills || ''} onChange={(e) => setEditForm({...editForm, skills: e.target.value})} className="w-full px-2 py-1 border border-gray-200 rounded text-sm" placeholder="Java, Python, AWS..." />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {c.skills ? c.skills.split(',').map((skill: string, i: number) => (
                      <span key={i} className="px-2 py-0.5 bg-fx-50 text-fx-700 rounded text-xs">{skill.trim()}</span>
                    )) : <span className="text-sm text-gray-400">—</span>}
                  </div>
                )}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50">
                <p className="text-xs text-gray-400 mb-2">Remarks</p>
                {isEditing ? (
                  <textarea value={editForm.remarks || ''} onChange={(e) => setEditForm({...editForm, remarks: e.target.value})} className="w-full px-2 py-1 border border-gray-200 rounded text-sm resize-none" rows={2} placeholder="Internal notes..." />
                ) : (
                  <p className="text-sm text-gray-700">{c.remarks || '—'}</p>
                )}
              </div>`
);

// Replace Compensation section with editable version
f = f.replace(
  `<h3 className="text-sm font-semibold text-gray-900 mb-4">Compensation & Availability</h3>
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Current CTC</span>
                <span className="text-sm text-gray-800 text-right">{formatCTC(c.current_ctc_fixed, c.current_ctc_variable)}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Expected CTC</span>
                <span className="text-sm text-gray-800 text-right">{formatCTC(c.expected_ctc_fixed, c.expected_ctc_variable)}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Notice Period</span>
                <span className="text-sm text-gray-800">{c.notice_period || '—'}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Last Working Day</span>
                <span className="text-sm text-gray-800">{c.last_working_day ? new Date(c.last_working_day).toLocaleDateString('en-IN') : '—'}</span>
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Holding Offer</span>
                <span className="text-sm text-gray-800">{c.holding_offer ? \`Yes — \${c.holding_offer_details || ''}\` : 'No'}</span>`,
  `<h3 className="text-sm font-semibold text-gray-900 mb-4">Compensation & Availability</h3>
            <div className="space-y-3">
              {[
                { label: 'Current CTC Fixed', key: 'current_ctc_fixed', display: () => formatCTC(c.current_ctc_fixed, c.current_ctc_variable) },
                { label: 'Current CTC Variable', key: 'current_ctc_variable', display: null },
                { label: 'Expected CTC Fixed', key: 'expected_ctc_fixed', display: () => formatCTC(c.expected_ctc_fixed, c.expected_ctc_variable) },
                { label: 'Expected CTC Variable', key: 'expected_ctc_variable', display: null },
                { label: 'Notice Period', key: 'notice_period', display: null },
              ].map(({ label, key, display }) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span className="text-xs text-gray-400 w-28 shrink-0 pt-1">{label}</span>
                  {isEditing ? (
                    <input type={key.includes('ctc') ? 'number' : 'text'} value={editForm[key] || ''} onChange={(e) => setEditForm({...editForm, [key]: e.target.value})} className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm text-right" />
                  ) : (
                    <span className="text-sm text-gray-800 text-right">{display ? display() : (c[key] || '—')}</span>
                  )}
                </div>
              ))}
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Last Working Day</span>
                {isEditing ? (
                  <input type="date" value={editForm.last_working_day?.split('T')[0] || ''} onChange={(e) => setEditForm({...editForm, last_working_day: e.target.value})} className="px-2 py-1 border border-gray-200 rounded text-sm" />
                ) : (
                  <span className="text-sm text-gray-800">{c.last_working_day ? new Date(c.last_working_day).toLocaleDateString('en-IN') : '—'}</span>
                )}
              </div>
              <div className="flex items-start justify-between">
                <span className="text-xs text-gray-400 w-28">Holding Offer</span>
                {isEditing ? (
                  <div className="flex-1 text-right"><label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={editForm.holding_offer || false} onChange={(e) => setEditForm({...editForm, holding_offer: e.target.checked})} /><span className="text-sm">Yes</span></label>{editForm.holding_offer && <input type="text" value={editForm.holding_offer_details || ''} onChange={(e) => setEditForm({...editForm, holding_offer_details: e.target.value})} className="w-full mt-1 px-2 py-1 border border-gray-200 rounded text-sm" placeholder="Details..." />}</div>
                ) : (
                  <span className="text-sm text-gray-800">{c.holding_offer ? \`Yes — \${c.holding_offer_details || ''}\` : 'No'}</span>
                )}`
);

fs.writeFileSync('src/app/(dashboard)/candidates/[id]/page.tsx', f);
console.log('✅ Candidate detail: All fields now editable in edit mode');
console.log('   - Professional: role, company, experience, education, location, email, phone');
console.log('   - Skills: editable text input');
console.log('   - Remarks: editable textarea');  
console.log('   - Compensation: CTC, notice period, LWD, holding offer');
