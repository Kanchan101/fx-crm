require('dotenv').config();
const { pool, query } = require('./db');
async function fix() {
  try {
    await query('ALTER TABLE pipeline DROP CONSTRAINT IF EXISTS pipeline_status_check');
    await query(`ALTER TABLE pipeline ADD CONSTRAINT pipeline_status_check CHECK (status IN (
      'New','Screening','Submitted to Client','Client Review',
      'Interview Stage','HR Discussion','Offer','Joined',
      'Not Joined','Account Manager Rejected','Interview Reject'
    ))`);
    console.log('✅ Interview Reject status added to DB');
  } catch (err) { console.error('DB fix error:', err.message); }
  await pool.end();
}
fix();
