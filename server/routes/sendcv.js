const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { Resend } = require('resend');
const { downloadCV } = require('../lib/storage');

const router = express.Router();

router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { job_id, spoc_emails, cc_emails, candidate_ids, custom_message } = req.body;
    if (!job_id || !spoc_emails || spoc_emails.length === 0) {
      return res.status(400).json({ error: 'Job ID and at least one SPOC email required' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured' });

    const jobResult = await query('SELECT j.*, c.name as client_name FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1', [job_id]);
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobResult.rows[0];

    // Get candidates
    let candidateSql, candidateParams;
    if (candidate_ids && candidate_ids.length > 0) {
      candidateSql = `SELECT ca.*, p.status, p.ai_match_percent FROM candidates ca
        JOIN pipeline p ON p.candidate_id = ca.id AND p.job_id = $1
        WHERE ca.id = ANY($2) ORDER BY ca.name`;
      candidateParams = [job_id, candidate_ids];
    } else {
      candidateSql = `SELECT ca.*, p.status, p.ai_match_percent FROM candidates ca
        JOIN pipeline p ON p.candidate_id = ca.id AND p.job_id = $1
        WHERE p.status = 'Submitted to Client' ORDER BY ca.name`;
      candidateParams = [job_id];
    }
    const candidates = await query(candidateSql, candidateParams);
    if (candidates.rows.length === 0) return res.status(400).json({ error: 'No candidates found' });

    // Download CV files for attachment
    console.log(`[SendCV] Preparing ${candidates.rows.length} CVs for attachment...`);
    const attachments = [];
    for (const c of candidates.rows) {
      if (c.cv_url) {
        try {
          const cvFile = await downloadCV(c.cv_url);
          if (cvFile) {
            // Create a clean filename: Name_Role.ext
            const cleanName = c.name.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_');
            const ext = c.cv_url.split('.').pop() || 'pdf';
            const attachName = `${cleanName}_${job.title.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '_')}.${ext}`;

            attachments.push({
              filename: attachName,
              content: cvFile.buffer,
              content_type: cvFile.contentType,
            });
            console.log(`[SendCV]   ✓ ${c.name} — ${attachName}`);
          } else {
            console.log(`[SendCV]   ✗ ${c.name} — download failed`);
          }
        } catch (dlErr) {
          console.error(`[SendCV]   ✗ ${c.name} — error:`, dlErr.message);
        }
      } else {
        console.log(`[SendCV]   ✗ ${c.name} — no CV stored`);
      }
    }

    // Build tracker HTML table
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    const hs = 'padding: 10px; font-size: 11px; font-weight: 700; color: white; background: #d97706; text-transform: uppercase; white-space: nowrap; border: 1px solid #b45309;';

    let tableRows = '';
    candidates.rows.forEach(c => {
      const ctcParts = [];
      if (c.current_ctc_fixed) ctcParts.push(c.current_ctc_fixed + ' LPA Fixed');
      if (c.current_ctc_variable) ctcParts.push('+ ' + c.current_ctc_variable + ' LPA Var');
      const ctcStr = ctcParts.length > 0 ? ctcParts.join(' ') : '-';
      const ectc = c.expected_ctc_fixed ? c.expected_ctc_fixed + ' LPA' : '-';
      const remark = c.holding_offer ? (c.holding_offer_details || 'Holding Offer') : 'No Offer';
      const rs = 'padding: 8px 10px; font-size: 12px; color: #374151; border: 1px solid #e5e7eb;';

      tableRows += `<tr>
        <td style="${rs}">${today}</td>
        <td style="${rs}">${job.title}</td>
        <td style="${rs} font-weight: 600;">${c.name}</td>
        <td style="${rs}">${c.phone || '-'}</td>
        <td style="${rs}"><a href="mailto:${c.email}" style="color: #4c6ef5;">${c.email || '-'}</a></td>
        <td style="${rs}">${c.current_company || '-'}</td>
        <td style="${rs}">${c.experience_years ? c.experience_years + ' Years' : '-'}</td>
        <td style="${rs}">${ctcStr}</td>
        <td style="${rs}">${ectc}</td>
        <td style="${rs}">${c.notice_period || '-'}</td>
        <td style="${rs}">${c.location || '-'}</td>
        <td style="${rs}">${remark}</td>
      </tr>`;
    });

    const spocFirstName = spoc_emails[0].split('@')[0].split('.')[0];
    const greeting = spocFirstName.charAt(0).toUpperCase() + spocFirstName.slice(1);

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
        <p style="font-size: 14px; color: #374151;">Hi ${greeting},</p>
        <p style="font-size: 14px; color: #374151;">${custom_message || `Please find attached CVs for <strong>${job.title}</strong> position.`}</p>
        <p style="font-size: 14px; color: #374151; margin-bottom: 16px;">Below details are for your reference :-</p>
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin-bottom: 24px;">
          <thead><tr>
            <th style="${hs}">Date</th><th style="${hs}">Role</th><th style="${hs}">Name</th>
            <th style="${hs}">Contact No</th><th style="${hs}">Mail ID</th><th style="${hs}">Current Org</th>
            <th style="${hs}">Total Exp</th><th style="${hs}">Last CTC</th><th style="${hs}">ECTC</th>
            <th style="${hs}">Notice Period</th><th style="${hs}">Location</th><th style="${hs}">Remark</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        <p style="font-size: 14px; color: #374151;">Please share your feedback.</p>
        <p style="font-size: 14px; color: #374151; margin-top: 16px;"><strong>Regards</strong><br/>${req.user.name}<br/>FX Consulting</p>
      </div>`;

    const resend = new Resend(RESEND_API_KEY);
    const emailPayload = {
      from: `${req.user.name} <${req.user.email || 'notifications@fxconsulting.in'}>`,
      to: spoc_emails,
      subject: `CVs for Review || ${job.title}`,
      html: emailHtml,
    };

    if (cc_emails && cc_emails.length > 0) emailPayload.cc = cc_emails;

    // Add CV attachments
    if (attachments.length > 0) {
      emailPayload.attachments = attachments.map(a => ({
        filename: a.filename,
        content: a.content.toString('base64'),
        content_type: a.content_type,
      }));
      console.log(`[SendCV] Attaching ${attachments.length} CV files to email`);
    }

    const result = await resend.emails.send(emailPayload);

    if (result.error) {
      console.error('[SendCV] Resend error:', result.error);
      return res.status(400).json({ error: result.error.message });
    }

    console.log(`[SendCV] Email sent to ${spoc_emails.join(', ')} with ${attachments.length} attachments`);

    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'SEND_CV', 'requirement', job_id, JSON.stringify({
        to: spoc_emails, cc: cc_emails, candidates: candidates.rows.map(c => c.name),
        attachments: attachments.length, job_title: job.title
      })]
    );

    res.json({
      success: true,
      sent_to: spoc_emails,
      candidates_count: candidates.rows.length,
      attachments_count: attachments.length,
    });
  } catch (err) {
    console.error('Send CV error:', err);
    res.status(500).json({ error: err.message || 'Failed to send' });
  }
});

module.exports = router;
