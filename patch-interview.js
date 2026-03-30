// patch-interview.js — Run from fx-crm root: node patch-interview.js
const fs = require('fs');
const filePath = 'src/app/(dashboard)/requirements/[id]/page.tsx';
let code = fs.readFileSync(filePath, 'utf8');

// 1. Add Calendar and Video imports (if not present)
if (!code.includes('Calendar,')) {
  code = code.replace(
    "Mail, Phone, Send, Sparkles, Loader2, MessageSquare, Linkedin,",
    "Mail, Phone, Send, Sparkles, Loader2, MessageSquare, Linkedin, Calendar, Video,"
  );
}

// 2. Add interview_round to PipelineEntry interface
if (!code.includes('interview_round')) {
  code = code.replace(
    'owner_name: string;\n}',
    'owner_name: string;\n  interview_round: string;\n}'
  );
}

// 3. Add INTERVIEW_ROUNDS constant after DROP_REASONS
if (!code.includes('INTERVIEW_ROUNDS')) {
  code = code.replace(
    "const DROP_REASONS = ['Accepted other offer',",
    "const INTERVIEW_ROUNDS = ['L1', 'L2', 'L3', 'L4', 'HR'];\nconst INTERVIEW_MODES = ['Video Call', 'Phone', 'In-Person', 'Assignment'];\n\nconst DROP_REASONS = ['Accepted other offer',"
  );
}

// 4. Add interview state variables after cvSent state
if (!code.includes('showSchedule')) {
  code = code.replace(
    "const [cvSent, setCvSent] = useState(false);\n  const [copied, setCopied] = useState('');",
    `const [cvSent, setCvSent] = useState(false);

  // Interview scheduling state
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleCandidate, setScheduleCandidate] = useState<PipelineEntry | null>(null);
  const [interviewForm, setInterviewForm] = useState({ date: '', time: '', round: 'L1', mode: 'Video Call', meeting_link: '', interviewer_name: '', notes: '' });
  const [scheduling, setScheduling] = useState(false);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [copied, setCopied] = useState('');`
  );
}

// 5. Add fetchDetail to also set interviews
if (!code.includes('setInterviews(data.interviews')) {
  code = code.replace(
    "setSpocs(data.spocs || []);",
    "setSpocs(data.spocs || []);\n      setInterviews(data.interviews || []);"
  );
}

// 6. Add interview scheduling + email + WhatsApp functions before "if (loading)"
if (!code.includes('scheduleInterview')) {
  code = code.replace(
    "  if (loading) return",
    `  // Schedule Interview
  const openSchedule = (entry: PipelineEntry) => {
    setScheduleCandidate(entry);
    setInterviewForm({ date: '', time: '', round: entry.interview_round || 'L1', mode: 'Video Call', meeting_link: '', interviewer_name: '', notes: '' });
    setShowSchedule(true);
  };

  const scheduleInterview = async () => {
    if (!scheduleCandidate || !interviewForm.date) return;
    setScheduling(true);
    try {
      await fetch(\`\${API}/api/interviews\`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({
          candidate_id: scheduleCandidate.candidate_id,
          job_id: params.id,
          pipeline_id: scheduleCandidate.id,
          interview_date: interviewForm.date,
          interview_time: interviewForm.time || null,
          type: interviewForm.round,
          mode: interviewForm.mode,
          interviewer_name: interviewForm.interviewer_name,
          meeting_link: interviewForm.meeting_link,
          notes: interviewForm.notes,
        }),
      });
      // Update pipeline status to Interview with round
      await fetch(\`\${API}/api/requirements/\${params.id}/pipeline/\${scheduleCandidate.id}/status\`, {
        method: 'PATCH', headers: headers(),
        body: JSON.stringify({ status: 'Interview', interview_round: interviewForm.round }),
      });
      setShowSchedule(false);
      fetchDetail();
    } catch (err) { console.error(err); }
    finally { setScheduling(false); }
  };

  // Copy interview WhatsApp message
  const copyInterviewWhatsApp = (entry: PipelineEntry) => {
    const iv = interviews.find((i: any) => i.candidate_id === entry.candidate_id);
    const dateStr = iv ? new Date(iv.interview_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '[DATE]';
    const timeStr = iv?.interview_time ? iv.interview_time.substring(0, 5) : '[TIME]';
    const msg = \`Hi \${entry.candidate_name},\\n\\nYour interview has been scheduled:\\n\\n*Position:* \${requirement?.title || ''}\\n*Company:* \${requirement?.client_name || ''}\\n*Date:* \${dateStr}\\n*Time:* \${timeStr}\\n*Round:* \${iv?.type || entry.interview_round || 'L1'}\\n*Mode:* \${iv?.mode || 'Video Call'}\${iv?.meeting_link ? '\\n*Link:* ' + iv.meeting_link : ''}\\n\\nPlease confirm your availability.\\n\\nAll the best!\\nFX Consulting Team\`;
    navigator.clipboard.writeText(msg);
    setCopied('iv-wa-' + entry.id);
    setTimeout(() => setCopied(''), 2000);
  };

  // Send interview schedule email
  const sendInterviewEmail = async (entry: PipelineEntry) => {
    const iv = interviews.find((i: any) => i.candidate_id === entry.candidate_id);
    if (!entry.candidate_email) { alert('No email for this candidate'); return; }
    const dateStr = iv ? new Date(iv.interview_date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '[DATE]';
    const timeStr = iv?.interview_time ? iv.interview_time.substring(0, 5) : '[TIME]';
    const subject = \`Interview Schedule: \${requirement?.title} at \${requirement?.client_name}\`;
    const body = \`Dear \${entry.candidate_name},\\n\\nCongratulations! Your profile has been shortlisted for the \${requirement?.title} position at \${requirement?.client_name}.\\n\\nInterview Details:\\n━━━━━━━━━━━━━━━━━\\nDate: \${dateStr}\\nTime: \${timeStr}\\nRound: \${iv?.type || entry.interview_round || 'L1'}\\nMode: \${iv?.mode || 'Video Call'}\${iv?.meeting_link ? '\\nMeeting Link: ' + iv.meeting_link : ''}\${iv?.interviewer_name ? '\\nInterviewer: ' + iv.interviewer_name : ''}\\n━━━━━━━━━━━━━━━━━\\n\\nPlease confirm your availability by replying to this email.\\n\\nDocuments to keep ready:\\n- Updated Resume\\n- Government ID proof\\n- Salary slips (last 3 months)\\n\\nAll the best!\\n\\nRegards,\\nFX Consulting Team\`;
    try {
      const res = await fetch(\`\${API}/api/outreach/send-email\`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ to_email: entry.candidate_email, to_name: entry.candidate_name, subject, body, job_id: params.id }),
      });
      const data = await res.json();
      if (data.success) { setCopied('iv-email-' + entry.id); setTimeout(() => setCopied(''), 3000); }
      else alert(data.error || 'Failed to send');
    } catch (err) { console.error(err); }
  };

  if (loading) return`
  );
}

// 7. Add interview actions (Schedule, Email, WhatsApp) for Interview status candidates
// Find the Outreach button in the pipeline card and add interview buttons after it
if (!code.includes('openSchedule(entry)')) {
  code = code.replace(
    `<button onClick={(e) => { e.stopPropagation(); openOutreach(entry); }}
                        className="px-2 py-1 text-[10px] bg-violet-50 text-violet-600 hover:bg-violet-100 rounded font-medium transition-colors flex items-center gap-1">
                        <Send className="w-3 h-3" /> Outreach
                      </button>`,
    `<button onClick={(e) => { e.stopPropagation(); openOutreach(entry); }}
                        className="px-2 py-1 text-[10px] bg-violet-50 text-violet-600 hover:bg-violet-100 rounded font-medium transition-colors flex items-center gap-1">
                        <Send className="w-3 h-3" /> Outreach
                      </button>
                      {entry.status === 'Interview' && (
                        <>
                          <button onClick={(e) => { e.stopPropagation(); openSchedule(entry); }}
                            className="px-2 py-1 text-[10px] bg-amber-50 text-amber-700 hover:bg-amber-100 rounded font-medium transition-colors flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> Schedule
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); sendInterviewEmail(entry); }}
                            className="px-2 py-1 text-[10px] bg-blue-50 text-blue-600 hover:bg-blue-100 rounded font-medium transition-colors flex items-center gap-1">
                            {copied === 'iv-email-' + entry.id ? <><Check className="w-3 h-3" /> Sent</> : <><Mail className="w-3 h-3" /> Email</>}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); copyInterviewWhatsApp(entry); }}
                            className="px-2 py-1 text-[10px] bg-green-50 text-green-700 hover:bg-green-100 rounded font-medium transition-colors flex items-center gap-1">
                            {copied === 'iv-wa-' + entry.id ? <><Check className="w-3 h-3" /> Copied</> : <><MessageSquare className="w-3 h-3" /> WhatsApp</>}
                          </button>
                        </>
                      )}`
  );
}

// 8. Add interview round badge next to status in pipeline cards
if (!code.includes('interview_round &&')) {
  code = code.replace(
    `{entry.reject_reason && <span className="text-[10px] text-red-400">({entry.reject_reason})</span>}`,
    `{entry.status === 'Interview' && entry.interview_round && <span className="px-1 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600">{entry.interview_round}</span>}
                        {entry.reject_reason && <span className="text-[10px] text-red-400">({entry.reject_reason})</span>}`
  );
}

// 9. Show interview info for Interview candidates (date, time, mode)
if (!code.includes('interviews.find')) {
  // Add after the contact info row in pipeline cards
  code = code.replace(
    `<span className="text-gray-300">{entry.owner_name}</span>
                    </div>`,
    `<span className="text-gray-300">{entry.owner_name}</span>
                      {entry.status === 'Interview' && (() => { const iv = interviews.find((i: any) => i.candidate_id === entry.candidate_id); return iv ? <span className="text-amber-600 font-medium"><Calendar className="w-3 h-3 inline" /> {new Date(iv.interview_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}{iv.interview_time ? ' ' + iv.interview_time.substring(0,5) : ''} · {iv.type || 'L1'} · {iv.mode || ''}</span> : null; })()}
                    </div>`
  );
}

// 10. Add the Schedule Interview Modal before the AI Outreach modal
if (!code.includes('SCHEDULE INTERVIEW MODAL')) {
  code = code.replace(
    `{/* ===== AI OUTREACH MODAL ===== */}`,
    `{/* ===== SCHEDULE INTERVIEW MODAL ===== */}
      {showSchedule && scheduleCandidate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowSchedule(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2"><Calendar className="w-5 h-5 text-amber-500" /> Schedule Interview</h2>
                <p className="text-xs text-gray-400 mt-0.5">{scheduleCandidate.candidate_name} — {requirement.title}</p>
              </div>
              <button onClick={() => setShowSchedule(false)} className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
                  <input type="date" value={interviewForm.date} onChange={e => setInterviewForm({...interviewForm, date: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Time</label>
                  <input type="time" value={interviewForm.time} onChange={e => setInterviewForm({...interviewForm, time: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Round</label>
                  <select value={interviewForm.round} onChange={e => setInterviewForm({...interviewForm, round: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    {INTERVIEW_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mode</label>
                  <select value={interviewForm.mode} onChange={e => setInterviewForm({...interviewForm, mode: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                    {INTERVIEW_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Meeting Link</label>
                <input type="url" placeholder="https://meet.google.com/..." value={interviewForm.meeting_link} onChange={e => setInterviewForm({...interviewForm, meeting_link: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Interviewer Name</label>
                <input type="text" placeholder="Interviewer name" value={interviewForm.interviewer_name} onChange={e => setInterviewForm({...interviewForm, interviewer_name: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
                <textarea placeholder="Any special instructions..." value={interviewForm.notes} onChange={e => setInterviewForm({...interviewForm, notes: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" rows={2} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowSchedule(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={scheduleInterview} disabled={scheduling || !interviewForm.date} className="px-5 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white flex items-center gap-2">
                {scheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                {scheduling ? 'Scheduling...' : 'Schedule Interview'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== AI OUTREACH MODAL ===== */}`
  );
}

fs.writeFileSync(filePath, code);
console.log('✅ Interview scheduling patched successfully!');
console.log('Changes:');
console.log('  - Interview rounds (L1-L4, HR) badge on candidate cards');
console.log('  - Schedule button for Interview status candidates');
console.log('  - Email interview schedule to candidate');
console.log('  - WhatsApp copy for interview schedule');
console.log('  - Interview date/time/mode shown on candidate cards');
console.log('  - Schedule Interview modal with full form');
console.log('  - All interviews sync to main Interviews tab');
