const { Resend } = require('resend');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
// FROM_EMAIL is now dynamic — passed per function call

async function sendAssignmentEmail(teamMember, job, assignedBy, assignedByEmail) {
  if (!resend) {
    console.log('[Email] Resend not configured — skipping email to', teamMember.email);
    return;
  }
  try {
    await resend.emails.send({
      from: assignedByEmail ? `${assignedBy} <${assignedByEmail}>` : "FX CRM <notifications@fxconsulting.in>",
      to: teamMember.email,
      subject: `New Assignment: ${job.title} — ${job.client_name}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <div style="background: #1e3a5f; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 16px;">FX Consulting CRM</h2>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Hi ${teamMember.name.split(' ')[0]},</p>
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
              <strong>${assignedBy}</strong> has assigned you to a new requirement:
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
              <h3 style="margin: 0 0 8px; color: #111827; font-size: 16px;">${job.title}</h3>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Client: <strong>${job.client_name}</strong></p>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Location: ${job.location || 'Not specified'}</p>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Experience: ${job.exp_min}-${job.exp_max} years</p>
              <p style="margin: 0; color: #6b7280; font-size: 13px;">Priority: <strong>${job.priority}</strong></p>
            </div>
            <a href="https://crm.fxconsulting.in/requirements/${job.id}"
              style="display: inline-block; background: #4c6ef5; color: white; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 13px; font-weight: 500;">
              View Requirement →
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin: 20px 0 0;">This is an automated notification from FX CRM.</p>
          </div>
        </div>
      `,
    });
    console.log('[Email] Assignment notification sent to', teamMember.email);
  } catch (err) {
    console.error('[Email] Failed to send:', err.message);
  }
}

async function sendStatusChangeEmail(teamMember, candidate, job, oldStatus, newStatus, changedBy, changedByEmail) {
  if (!resend) return;
  try {
    await resend.emails.send({
      from: changedByEmail ? `${changedBy} <${changedByEmail}>` : "FX CRM <notifications@fxconsulting.in>",
      to: teamMember.email,
      subject: `Status Update: ${candidate.name} → ${newStatus}`,
      html: `
        <div style="font-family: 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 0;">
          <div style="background: #1e3a5f; padding: 20px 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 16px;">FX Consulting CRM</h2>
          </div>
          <div style="background: white; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">Hi ${teamMember.name.split(' ')[0]},</p>
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px;">
              <strong>${changedBy}</strong> updated a candidate status:
            </p>
            <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 0 0 16px;">
              <p style="margin: 0 0 4px; color: #111827; font-size: 14px;"><strong>${candidate.name}</strong></p>
              <p style="margin: 0 0 4px; color: #6b7280; font-size: 13px;">Position: ${job.title} (${job.client_name})</p>
              <p style="margin: 0; color: #6b7280; font-size: 13px;">
                Status: <span style="text-decoration: line-through;">${oldStatus}</span> → <strong style="color: #4c6ef5;">${newStatus}</strong>
              </p>
            </div>
          </div>
        </div>
      `,
    });
  } catch (err) {
    console.error('[Email] Status notification failed:', err.message);
  }
}

module.exports = { sendAssignmentEmail, sendStatusChangeEmail };
