require('dotenv').config();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

resend.emails.send({
  from: 'FX CRM <onboarding@resend.dev>',
  to: 'kanchankuwarbi@gmail.com',
  subject: 'FX CRM Email Test',
  html: '<h2>Email working</h2><p>Your CRM can send emails.</p>'
}).then(r => console.log('Result:', JSON.stringify(r))).catch(e => console.log('Error:', JSON.stringify(e)));
