// migrate-workflow-v2.js — Run ONCE from server/ directory
// Usage: cd server && node migrate-workflow-v2.js
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();
  console.log('🔄 Starting pipeline workflow migration...\n');

  try {
    await client.query('BEGIN');

    // Step 1: Add new columns
    console.log('1. Adding columns (hold_reason, interview_round)...');
    const cols = [
      'ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS hold_reason TEXT',
      'ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS interview_round TEXT',
    ];
    for (const sql of cols) {
      try { await client.query(sql); } catch(e) { console.log('   Column may exist:', e.message); }
    }
    console.log('   ✅ Columns ready');

    // Step 2: Map old statuses to new
    console.log('\n2. Mapping statuses...');
    const mappings = [
      ['New', 'AM Review Pending'],
      ['Sourced', 'AM Review Pending'],
      ['Screening', 'AM Review Select'],
      ['Submitted to Client', 'Client Review Pending'],
      ['Client Review', 'Client Review Pending'],
      ['Interview Stage', 'Interview'],
      ['HR Discussion', 'Interview'],
      ['Offer', 'Offered'],
      ['Not Joined', 'Dropped'],
      ['Account Manager Rejected', 'Rejected'],
      ['Interview Reject', 'Rejected'],
    ];

    for (const [oldS, newS] of mappings) {
      const result = await client.query('UPDATE pipeline SET status=$1 WHERE status=$2', [newS, oldS]);
      if (result.rowCount > 0) {
        console.log(`   ✅ "${oldS}" → "${newS}" (${result.rowCount} rows)`);
      }
    }

    // Also update candidate_status_history
    console.log('\n3. Updating status history...');
    for (const [oldS, newS] of mappings) {
      await client.query('UPDATE candidate_status_history SET new_status=$1 WHERE new_status=$2', [newS, oldS]);
      await client.query('UPDATE candidate_status_history SET old_status=$1 WHERE old_status=$2', [newS, oldS]);
    }
    console.log('   ✅ History updated');

    // Step 4: Update constraint
    console.log('\n4. Updating check constraint...');
    try {
      await client.query('ALTER TABLE pipeline DROP CONSTRAINT IF EXISTS pipeline_status_check');
      await client.query(`ALTER TABLE pipeline ADD CONSTRAINT pipeline_status_check CHECK (status IN (
        'AM Review Pending','AM Review Select','Client Review Pending','Interview',
        'Offered','Joined','Rejected','On Hold','Dropped'
      ))`);
      console.log('   ✅ Constraint updated');
    } catch(e) {
      console.log('   ⚠️  Constraint update skipped (may not exist or different name):', e.message);
    }

    await client.query('COMMIT');

    // Step 5: Verify
    console.log('\n5. Current status distribution:');
    const verify = await pool.query('SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC');
    verify.rows.forEach(r => console.log(`   ${r.status}: ${r.count}`));

    console.log('\n✅ MIGRATION COMPLETE!\n');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
