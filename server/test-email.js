require('dotenv').config();
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

console.log('API Key:', process.env.RESEND_API_KEY ? 'Set' : 'NOT SET');

resend.emails.send({
  from: 'FX CRM <kanchan.singh@fxconsulting.in>',
  to: 'kanchan.singh@fxconsulting.in',
  subject: 'Test from FX CRM',
  html: '<h2>Email is working</h2><p>This is a test from your CRM.</p>'
}).then(r => console.log('Sent:', JSON.stringify(r))).catch(e => console.log('Error:', JSON.stringify(e)));
