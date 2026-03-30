// FX CRM — Pipeline Workflow Migration
// Migrates from old 11-status system to new 10-status system
// Run: cd server && node migrate-workflow.js

require('dotenv').config();
const { pool, query } = require('./db');

async function migrate() {
  console.log('🔄 Pipeline Workflow Migration\n');

  // Step 1: Map old statuses to new statuses
  const STATUS_MAP = {
    'New': 'Sourced',
    'Screening': 'Screening',
    'Submitted to Client': 'Submitted to Client',
    'Client Review': 'Submitted to Client',  // merge into Submitted
    'Interview Stage': 'Interview',
    'HR Discussion': 'Interview',             // HR round is still an interview
    'Offer': 'Offered',
    'Joined': 'Joined',
    'Not Joined': 'Dropped',                  // candidate didn't join = dropped
    'Account Manager Rejected': 'Rejected',
    'Interview Reject': 'Rejected',
  };

  // Step 2: Count existing pipeline entries per status
  console.log('📊 Current pipeline status distribution:');
  const currentCounts = await query(
    `SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC`
  );
  currentCounts.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));
  console.log('');

  // Step 3: Drop the CHECK constraint on pipeline.status
  console.log('🔧 Removing old CHECK constraint...');
  try {
    // Find and drop the constraint
    const constraints = await query(`
      SELECT con.conname 
      FROM pg_constraint con 
      JOIN pg_class rel ON rel.oid = con.conrelid 
      WHERE rel.relname = 'pipeline' 
        AND con.contype = 'c' 
        AND pg_get_constraintdef(con.oid) LIKE '%status%'
    `);
    for (const c of constraints.rows) {
      await query(`ALTER TABLE pipeline DROP CONSTRAINT "${c.conname}"`);
      console.log(`  Dropped constraint: ${c.conname}`);
    }
  } catch (err) {
    console.log('  No CHECK constraint found (table may not have one)');
  }

  // Step 4: Add new columns for reject/drop reasons
  console.log('\n📝 Adding reject_reason and drop_reason columns...');
  try {
    await query(`ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(100)`);
    await query(`ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS drop_reason VARCHAR(100)`);
    console.log('  ✓ Columns added');
  } catch (err) {
    console.log('  Columns may already exist:', err.message);
  }

  // Step 5: Migrate existing data
  console.log('\n🔄 Migrating pipeline statuses...');
  for (const [oldStatus, newStatus] of Object.entries(STATUS_MAP)) {
    const result = await query(
      `UPDATE pipeline SET status = $1 WHERE status = $2`,
      [newStatus, oldStatus]
    );
    if (result.rowCount > 0) {
      console.log(`  ${oldStatus} → ${newStatus}: ${result.rowCount} rows`);

      // Set reject_reason for rejected entries
      if (oldStatus === 'Account Manager Rejected') {
        await query(
          `UPDATE pipeline SET reject_reason = 'Not a fit' WHERE status = 'Rejected' AND reject_reason IS NULL AND notes IS NULL`
        );
      }
      if (oldStatus === 'Interview Reject') {
        await query(
          `UPDATE pipeline SET reject_reason = 'Failed interview' WHERE status = 'Rejected' AND reject_reason IS NULL`
        );
      }
      if (oldStatus === 'Not Joined') {
        await query(
          `UPDATE pipeline SET drop_reason = 'Did not join' WHERE status = 'Dropped' AND drop_reason IS NULL`
        );
      }
    }
  }

  // Step 6: Also migrate candidate_status_history
  console.log('\n🔄 Migrating status history...');
  for (const [oldStatus, newStatus] of Object.entries(STATUS_MAP)) {
    await query(
      `UPDATE candidate_status_history SET old_status = $1 WHERE old_status = $2`,
      [newStatus, oldStatus]
    );
    await query(
      `UPDATE candidate_status_history SET new_status = $1 WHERE new_status = $2`,
      [newStatus, oldStatus]
    );
  }
  console.log('  ✓ History migrated');

  // Step 7: Add new CHECK constraint with new statuses
  console.log('\n🔧 Adding new CHECK constraint...');
  try {
    await query(`
      ALTER TABLE pipeline ADD CONSTRAINT pipeline_status_check 
      CHECK (status IN (
        'Sourced', 'Screening', 'Submitted to Client', 'Interview',
        'Offered', 'Joined', 'Rejected', 'On Hold', 'Dropped'
      ))
    `);
    console.log('  ✓ New constraint added');
  } catch (err) {
    console.log('  Constraint error:', err.message);
  }

  // Step 8: Update the default status for new pipeline entries
  console.log('\n🔧 Setting default status to Sourced...');
  try {
    await query(`ALTER TABLE pipeline ALTER COLUMN status SET DEFAULT 'Sourced'`);
    console.log('  ✓ Default updated');
  } catch (err) {
    console.log('  Default error:', err.message);
  }

  // Step 9: Update daily_sourcing_report view
  console.log('\n📊 Updating report views...');
  await query(`
    CREATE OR REPLACE VIEW daily_sourcing_report AS
    SELECT DATE(csh.created_at) as report_date, t.id as team_member_id, t.name as team_member,
      t.role, COUNT(DISTINCT csh.candidate_id) as candidates_submitted
    FROM candidate_status_history csh JOIN team t ON t.id = csh.changed_by
    WHERE csh.new_status = 'Submitted to Client'
    GROUP BY DATE(csh.created_at), t.id, t.name, t.role ORDER BY report_date DESC
  `);
  console.log('  ✓ Views updated');

  // Step 10: Verify migration
  console.log('\n📊 New pipeline status distribution:');
  const newCounts = await query(
    `SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC`
  );
  newCounts.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  console.log('\n========================================');
  console.log('✅ MIGRATION COMPLETE!');
  console.log('========================================');
  console.log('\nNew statuses: Sourced, Screening, Submitted to Client, Interview, Offered, Joined, Rejected, On Hold, Dropped');
  console.log('New columns: reject_reason, drop_reason');
  console.log('\n⚠️  Now deploy the updated backend and frontend files.');

  await pool.end();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
