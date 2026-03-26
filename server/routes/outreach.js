const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { Resend } = require('resend');

const { generateOutreach } = require('../lib/ai');
const router = express.Router();

// POST /api/outreach/generate — AI generates email, WhatsApp, LinkedIn messages
router.post('/generate', authenticate, async (req, res) => {
  try {
    const { job_id, candidate_name, candidate_email, custom_note } = req.body;
    if (!job_id) return res.status(400).json({ error: 'Job ID required' });

    const jobResult = await query(
      `SELECT j.*, c.name as client_name, c.location as client_location, c.industry as client_industry
       FROM jobs j JOIN clients c ON c.id = j.client_id WHERE j.id = $1`, [job_id]
    );
    if (jobResult.rows.length === 0) return res.status(404).json({ error: 'Job not found' });

    const job = jobResult.rows[0];
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'AI not configured' });

    const senderName = req.user.name;
    const candidateGreeting = candidate_name ? candidate_name.split(' ')[0] : 'there';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 3000,
        messages: [{
          role: 'user',
          content: `You are a recruitment consultant at FX Consulting. Generate 3 outreach messages for a job opportunity. Return ONLY a JSON object with these exact keys, no markdown, no explanation:

{
  "email_subject": "email subject line",
  "email_body": "full professional email body with greeting and sign-off",
  "whatsapp": "WhatsApp message, max 800 characters, casual professional tone, include key details, use line breaks for readability",
  "linkedin": "LinkedIn message, max 300 characters, professional networking tone, concise and compelling"
}

Job Details:
- Title: ${job.title}
- Company: ${job.client_name} (${job.client_industry || ''})
- Location: ${job.location || 'Not specified'}
- Experience Required: ${job.exp_min}-${job.exp_max} years
- 
- Skills: ${job.skills || 'Not specified'}
- Job Description: ${(job.description || 'Not provided').substring(0, 3000)}

Sender: ${senderName}, FX Consulting
Candidate Name: ${candidate_name || 'Candidate'}
${custom_note ? 'Additional Note: ' + custom_note : ''}

Rules:
- Email: Professional, warm, highlight key role details, include JD summary, sign off as ${senderName} from FX Consulting with contact details placeholder
- WhatsApp: Friendly professional, use emojis sparingly (1-2 max), include role title + company + location + experience + key skills, max 800 chars
- LinkedIn: Hook them in first line, mention role briefly, ask to connect, max 300 chars
- Do NOT use phrases like "I came across your profile" — be direct about the opportunity
- Include specific details from JD to make it personalized. NEVER include CTC/salary/compensation in any message — this is strictly confidential between recruiter and candidate`
        }]
      })
    });

    const aiResult = await response.json();
    const aiText = aiResult.content?.[0]?.text || '';
    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    let messages = { email_subject: '', email_body: '', whatsapp: '', linkedin: '' };
    if (jsonMatch) {
      messages = JSON.parse(jsonMatch[0]);
    }

    res.json({ messages, job_title: job.title, client_name: job.client_name });
  } catch (err) {
    console.error('Generate outreach error:', err);
    res.status(500).json({ error: 'Failed to generate messages' });
  }
});

// POST /api/outreach/send-email — Send outreach email to candidate
router.post('/send-email', authenticate, async (req, res) => {
  try {
    const { to_email, to_name, subject, body, job_id } = req.body;
    if (!to_email || !subject || !body) return res.status(400).json({ error: 'Email, subject, and body required' });

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) return res.status(500).json({ error: 'Email not configured' });

    const resend = new Resend(RESEND_API_KEY);
    const fromEmail = `${req.user.name} <${req.user.email}>`;

    const result = await resend.emails.send({
      from: fromEmail,
      to: to_email,
      subject: subject,
      html: body.replace(/\n/g, '<br/>'),
    });

    if (result.error) {
      return res.status(400).json({ error: result.error.message });
    }

    // Log the outreach
    await query(
      'INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'OUTREACH_EMAIL', 'candidate', null, JSON.stringify({ to: to_email, subject, job_id })]
    );

    res.json({ success: true, id: result.data?.id });
  } catch (err) {
    console.error('Send outreach email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

module.exports = router;
