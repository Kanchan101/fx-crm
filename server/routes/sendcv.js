const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { Resend } = require('resend');

const router = express.Router();

// POST /api/send-cv — Send candidate tracker + CVs to client SPOC
router.post('/', authenticate, authorize('Super Admin', 'Account Manager'), async (req, res) => {
  try {
    const { job_id, spoc_emails, cc_emails, candidate_ids, custom_message } = req.body;
    if (!job_id || !spoc_emails || spoc_emails.length === 0) {
      return res.status(400).json({ error: 'Job ID and at least one SPOC email required' });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured' });

    // Get job + client info
    const jobResult = await query(
      'SELECT j.*, c.name as client_name FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1',
      [job_id]
    );
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });
    const job = jobResult.rows[0];

    // Get candidates — either specific IDs or all "Submitted to Client"
    let candidateSql;
    let candidateParams;
    if (candidate_ids && candidate_ids.length > 0) {
      candidateSql = `
        SELECT ca.*, p.status, p.ai_match_percent,
          ca.current_ctc_fixed, ca.current_ctc_variable,
          ca.expected_ctc_fixed, ca.notice_period, ca.holding_offer, ca.holding_offer_details
        FROM candidates ca
        JOIN pipeline p ON p.candidate_id = ca.id AND p.job_id = $1
        WHERE ca.id = ANY($2)
        ORDER BY ca.name`;
      candidateParams = [job_id, candidate_ids];
    } else {
      candidateSql = `
        SELECT ca.*, p.status, p.ai_match_percent,
          ca.current_ctc_fixed, ca.current_ctc_variable,
          ca.expected_ctc_fixed, ca.notice_period, ca.holding_offer, ca.holding_offer_details
        FROM candidates ca
        JOIN pipeline p ON p.candidate_id = ca.id AND p.job_id = $1
        WHERE p.status = 'Submitted to Client'
        ORDER BY ca.name`;
      candidateParams = [job_id];
    }
    const candidates = await query(candidateSql, candidateParams);

    if (candidates.rows.length === 0) {
      return res.status(400).json({ error: 'No candidates found to send' });
    }

    // Build tracker HTML table
    const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
    let tableRows = '';
    candidates.rows.forEach((c, i) => {
      const ctcParts = [];
      if (c.current_ctc_fixed) ctcParts.push(c.current_ctc_fixed + ' LPA Fixed');
      if (c.current_ctc_variable) ctcParts.push(c.current_ctc_variable + ' LPA Var');
      const ctcStr = ctcParts.length > 0 ? ctcParts.join(' + ') : '-';
      const ectc = c.expected_ctc_fixed ? c.expected_ctc_fixed + ' LPA' : '-';
      const remark = c.holding_offer ? (c.holding_offer_details || 'Holding Offer') : 'No Offer';

      tableRows += `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${today}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${job.title}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151; font-weight: 600;">${c.name}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${c.phone || '-'}</td>
          <td style="padding: 8px 10px; font-size: 12px;"><a href="mailto:${c.email}" style="color: #4c6ef5;">${c.email || '-'}</a></td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${c.current_company || '-'}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${c.experience_years ? c.experience_years + ' Years' : '-'}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${ctcStr}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${ectc}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${c.notice_period || '-'}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${c.location || '-'}</td>
          <td style="padding: 8px 10px; font-size: 12px; color: #374151;">${remark}</td>
        </tr>`;
    });

    const headerStyle = 'padding: 10px; font-size: 11px; font-weight: 700; color: white; background: #d97706; text-transform: uppercase; white-space: nowrap;';

    const spocFirstName = spoc_emails[0].split('@')[0].split('.')[0];
    const greeting = spocFirstName.charAt(0).toUpperCase() + spocFirstName.slice(1);

    const emailHtml = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 1200px; margin: 0 auto;">
        <p style="font-size: 14px; color: #374151;">Hi ${greeting},</p>
        <p style="font-size: 14px; color: #374151;">${custom_message || `Please find attached CVs for <strong>${job.title}</strong> position.`}</p>
        <p style="font-size: 14px; color: #374151; margin-bottom: 16px;">Below details are for your reference :-</p>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; margin-bottom: 24px;">
          <thead>
            <tr>
              <th style="${headerStyle}">Date</th>
              <th style="${headerStyle}">Role</th>
              <th style="${headerStyle}">Name</th>
              <th style="${headerStyle}">Contact No</th>
              <th style="${headerStyle}">Mail ID</th>
              <th style="${headerStyle}">Current Org</th>
              <th style="${headerStyle}">Total Exp</th>
              <th style="${headerStyle}">Last CTC</th>
              <th style="${headerStyle}">ECTC</th>
              <th style="${headerStyle}">Notice Period</th>
              <th style="${headerStyle}">Location</th>
              <th style="${headerStyle}">Remark</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>

        <p style="font-size: 14px; color: #374151;">Please share your feedback.</p>
        <p style="font-size: 14px; color: #374151; margin-top: 16px;">
          <strong>Regards</strong><br/>
          ${req.user.name}
        </p>
      </div>
    `;

    const resend = new Resend(RESEND_API_KEY);
    const fromEmail = req.user.email || 'notifications@fxconsulting.in';

    const emailPayload = {
      from: `${req.user.name} <${fromEmail}>`,
      to: spoc_emails,
      subject: `CVs for Review || ${job.title}`,
      html: emailHtml,
    };

    if (cc_emails && cc_emails.length > 0) {
      emailPayload.cc = cc_emails;
    }

    const result = await resend.emails.send(emailPayload);

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    // Log
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'SEND_CV', 'requirement', job_id, JSON.stringify({
        to: spoc_emails, cc: cc_emails, candidates: candidates.rows.map(c => c.name), job_title: job.title
      })]
    );

    res.json({ success: true, sent_to: spoc_emails, candidates_count: candidates.rows.length });
  } catch (err) {
    console.error('Send CV error:', err);
    res.status(500).json({ error: err.message || 'Failed to send' });
  }
});

module.exports = router;
