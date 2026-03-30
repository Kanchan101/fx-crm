require('dotenv').config();
const { pool, query } = require('./db');

async function clear() {
  console.log('Clearing test data...\n');

  // Order matters — delete child tables first
  await query('DELETE FROM activity_log');
  console.log('  Cleared activity_log');

  await query('DELETE FROM cv_processing_log');
  console.log('  Cleared cv_processing_log');

  await query('DELETE FROM candidate_status_history');
  console.log('  Cleared candidate_status_history');

  await query('DELETE FROM interviews');
  console.log('  Cleared interviews');

  await query('DELETE FROM placements');
  console.log('  Cleared placements');

  await query('DELETE FROM pipeline');
  console.log('  Cleared pipeline');

  await query('DELETE FROM candidates');
  console.log('  Cleared candidates');

  // Keep clients, jobs, team, job_assignments, client_spocs
  // These are your real data

  console.log('\nKept:');
  const team = await query('SELECT COUNT(*) FROM team');
  const clients = await query('SELECT COUNT(*) FROM clients');
  const jobs = await query('SELECT COUNT(*) FROM jobs');
  const spocs = await query('SELECT COUNT(*) FROM client_spocs');
  console.log('  Team:', team.rows[0].count, 'members');
  console.log('  Clients:', clients.rows[0].count);
  console.log('  Positions:', jobs.rows[0].count);
  console.log('  SPOCs:', spocs.rows[0].count);

  console.log('\nCleared:');
  console.log('  All test candidates');
  console.log('  All pipeline entries');
  console.log('  All interviews');
  console.log('  All status history');
  console.log('  All activity logs');

  console.log('\nReady for production!');
  await pool.end();
}

clear().catch(e => { console.error(e); process.exit(1); });
