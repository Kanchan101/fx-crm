// Daily interview-reminder emails.
// At 9:20 AM IST every day, each recruiter who has candidate interviews
// scheduled for that day gets one email listing them, with a nudge to
// follow up and update the follow-up status in the CRM.

const { Resend } = require('resend');
const { query } = require('../db');

const CRM_URL = process.env.FRONTEND_URL || 'https://crm.fxconsulting.in';
const FROM = 'FX Consulting CRM <notifications@fxconsulting.in>';

// Today's date in IST as YYYY-MM-DD (interview_date is a DATE column)
function istToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const esc = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendDailyInterviewReminders() {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) { console.warn('[Reminders] RESEND_API_KEY not set — skipping'); return { sent: 0, recruiters: 0, interviews: 0, skipped: 'no_api_key' }; }

  const today = istToday();

  const { rows } = await query(
    `SELECT i.interview_time, i.mode, i.type, i.interviewer_name, i.meeting_link,
            i.followup_status,
            ca.name AS candidate_name, ca.phone AS candidate_phone, ca.email AS candidate_email,
            j.title AS job_title, cl.name AS client_name,
            COALESCE(own.id, sch.id)     AS recruiter_id,
            COALESCE(own.name, sch.name) AS recruiter_name,
            COALESCE(own.email, sch.email) AS recruiter_email
     FROM interviews i
     JOIN candidates ca ON ca.id = i.candidate_id
     JOIN jobs j        ON j.id  = i.job_id
     JOIN clients cl    ON cl.id = j.client_id
     LEFT JOIN team own ON own.id = ca.owner_id
     LEFT JOIN team sch ON sch.id = i.scheduled_by
     WHERE i.interview_date = $1
       AND COALESCE(i.outcome, '') <> 'Cancelled'
     ORDER BY recruiter_id, i.interview_time ASC`,
    [today]
  );

  if (rows.length === 0) { console.log(`[Reminders] No interviews for ${today}`); return { sent: 0, recruiters: 0, interviews: 0 }; }

  // Group by recruiter
  const byRecruiter = new Map();
  for (const r of rows) {
    if (!r.recruiter_email) continue;
    if (!byRecruiter.has(r.recruiter_email)) byRecruiter.set(r.recruiter_email, { name: r.recruiter_name, items: [] });
    byRecruiter.get(r.recruiter_email).items.push(r);
  }

  const resend = new Resend(RESEND_API_KEY);
  const prettyDate = new Date(today + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  let sent = 0;

  for (const [email, data] of byRecruiter) {
    const hs = 'padding:8px 10px;font-size:11px;font-weight:700;color:#fff;background:#4c6ef5;text-align:left;';
    const cs = 'padding:8px 10px;font-size:13px;color:#374151;border:1px solid #e5e7eb;';
    const rowsHtml = data.items.map((it) => `
      <tr>
        <td style="${cs}">${it.interview_time ? String(it.interview_time).substring(0, 5) : '—'}</td>
        <td style="${cs}font-weight:600;">${esc(it.candidate_name)}</td>
        <td style="${cs}">${esc(it.job_title)} · ${esc(it.client_name)}</td>
        <td style="${cs}">${esc(it.mode || '—')}</td>
        <td style="${cs}">${esc(it.candidate_phone || '—')}</td>
      </tr>`).join('');

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:720px;margin:0 auto;color:#374151;">
        <p style="font-size:15px;">Good morning ${esc(data.name || '')},</p>
        <p style="font-size:14px;">You have <strong>${data.items.length} interview${data.items.length !== 1 ? 's' : ''}</strong> scheduled for <strong>${prettyDate}</strong>. Please follow up with each candidate to confirm attendance, then update the follow-up status in the CRM.</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin:16px 0;">
          <thead><tr>
            <th style="${hs}">Time</th><th style="${hs}">Candidate</th><th style="${hs}">Role / Client</th><th style="${hs}">Mode</th><th style="${hs}">Phone</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <a href="${CRM_URL}/interviews" style="display:inline-block;background:#4c6ef5;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;">Open Interviews & Update Follow-up →</a>
        <p style="font-size:12px;color:#9ca3af;margin-top:20px;">Mark each as Confirmed, No Show, or Not Responding and add a remark. This is an automated reminder from FX Consulting CRM.</p>
      </div>`;

    try {
      await resend.emails.send({
        from: FROM,
        to: [email],
        subject: `Interview follow-ups for today — ${data.items.length} candidate${data.items.length !== 1 ? 's' : ''}`,
        html,
      });
      sent++;
      console.log(`[Reminders]   ✓ ${email} (${data.items.length})`);
    } catch (e) {
      console.error(`[Reminders]   ✗ ${email}:`, e.message);
    }
  }

  // ── Candidate reminders ──
  const byCandidate = new Map();
  for (const r of rows) {
    if (!r.candidate_email) continue;
    if (!byCandidate.has(r.candidate_email)) byCandidate.set(r.candidate_email, { name: r.candidate_name, items: [] });
    byCandidate.get(r.candidate_email).items.push(r);
  }

  let candSent = 0;
  for (const [email, data] of byCandidate) {
    const cs = 'padding:8px 10px;font-size:13px;color:#374151;border:1px solid #e5e7eb;';
    const label = 'padding:8px 10px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb;font-weight:600;background:#f9fafb;width:140px;';
    const blocks = data.items.map((it) => `
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;margin:12px 0;">
        <tr><td style="${label}">Position</td><td style="${cs}">${esc(it.job_title)}</td></tr>
        <tr><td style="${label}">Company</td><td style="${cs}">${esc(it.client_name)}</td></tr>
        <tr><td style="${label}">Time</td><td style="${cs}">${it.interview_time ? String(it.interview_time).substring(0, 5) : 'To be confirmed'}</td></tr>
        <tr><td style="${label}">Mode</td><td style="${cs}">${esc(it.mode || '—')}</td></tr>
        ${it.interviewer_name ? `<tr><td style="${label}">Interviewer</td><td style="${cs}">${esc(it.interviewer_name)}</td></tr>` : ''}
        ${it.meeting_link ? `<tr><td style="${label}">Meeting link</td><td style="${cs}"><a href="${esc(it.meeting_link)}" style="color:#4c6ef5;">${esc(it.meeting_link)}</a></td></tr>` : ''}
      </table>`).join('');

    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;color:#374151;">
        <p style="font-size:15px;">Dear ${esc(data.name || 'Candidate')},</p>
        <p style="font-size:14px;">This is a friendly reminder about your interview${data.items.length !== 1 ? 's' : ''} scheduled for <strong>${prettyDate}</strong>:</p>
        ${blocks}
        <p style="font-size:14px;">Please be available and join on time. If you are unable to attend or need to reschedule, kindly inform your FX Consulting recruiter at the earliest.</p>
        <p style="font-size:14px;margin-top:16px;">Best regards,<br/><strong>FX Consulting</strong></p>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px;">This is an automated reminder. Please do not reply to this email; contact your recruiter for any changes.</p>
      </div>`;

    try {
      await resend.emails.send({
        from: FROM,
        to: [email],
        subject: `Interview Reminder — ${data.items[0].job_title} | FX Consulting`,
        html,
      });
      candSent++;
      console.log(`[Reminders]   ✓ candidate ${email}`);
    } catch (e) {
      console.error(`[Reminders]   ✗ candidate ${email}:`, e.message);
    }
  }

  console.log(`[Reminders] ${today}: ${sent}/${byRecruiter.size} recruiter(s), ${candSent}/${byCandidate.size} candidate(s), ${rows.length} interview(s)`);
  return { sent, recruiters: byRecruiter.size, candidatesSent: candSent, candidates: byCandidate.size, interviews: rows.length, date: today };
}

function startReminderScheduler() {
  const cron = require('node-cron'); // lazy-loaded so a missing dep can't crash server boot
  // 9:20 AM every day, India time
  cron.schedule('20 9 * * *', () => {
    console.log('[Reminders] Daily 9:20 AM IST trigger');
    sendDailyInterviewReminders().catch((e) => console.error('[Reminders] run failed:', e.message));
  }, { timezone: 'Asia/Kolkata' });
  console.log('[Reminders] Scheduler armed — 9:20 AM IST daily');
}

module.exports = { sendDailyInterviewReminders, startReminderScheduler };
