require('dotenv').config();
const { pool, query } = require('./db');

async function migrate() {
  console.log('🔄 Pipeline Workflow Migration\n');

  const STATUS_MAP = {
    'New': 'Sourced',
    'Screening': 'Screening',
    'Submitted to Client': 'Submitted to Client',
    'Client Review': 'Submitted to Client',
    'Interview Stage': 'Interview',
    'HR Discussion': 'Interview',
    'Offer': 'Offered',
    'Joined': 'Joined',
    'Not Joined': 'Dropped',
    'Account Manager Rejected': 'Rejected',
    'Interview Reject': 'Rejected',
  };

  console.log('📊 Current status distribution:');
  const cur = await query('SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC');
  cur.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  // Drop old constraint
  console.log('\n🔧 Removing old CHECK constraint...');
  try {
    const constraints = await query(`
      SELECT con.conname FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid
      WHERE rel.relname = 'pipeline' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%status%'
    `);
    for (const c of constraints.rows) {
      await query(`ALTER TABLE pipeline DROP CONSTRAINT "${c.conname}"`);
      console.log(`  Dropped: ${c.conname}`);
    }
  } catch (err) { console.log('  No constraint found'); }

  // Add new columns
  console.log('\n📝 Adding reject_reason and drop_reason columns...');
  await query('ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS reject_reason VARCHAR(100)');
  await query('ALTER TABLE pipeline ADD COLUMN IF NOT EXISTS drop_reason VARCHAR(100)');
  console.log('  ✓ Done');

  // Migrate data
  console.log('\n🔄 Migrating statuses...');
  for (const [old, nw] of Object.entries(STATUS_MAP)) {
    const r = await query('UPDATE pipeline SET status = $1 WHERE status = $2', [nw, old]);
    if (r.rowCount > 0) {
      console.log(`  ${old} → ${nw}: ${r.rowCount} rows`);
      if (old === 'Account Manager Rejected') await query("UPDATE pipeline SET reject_reason = 'Not a fit' WHERE status = 'Rejected' AND reject_reason IS NULL AND notes IS NULL");
      if (old === 'Interview Reject') await query("UPDATE pipeline SET reject_reason = 'Failed interview' WHERE status = 'Rejected' AND reject_reason IS NULL");
      if (old === 'Not Joined') await query("UPDATE pipeline SET drop_reason = 'Did not join' WHERE status = 'Dropped' AND drop_reason IS NULL");
    }
  }

  // Migrate history
  console.log('\n🔄 Migrating history...');
  for (const [old, nw] of Object.entries(STATUS_MAP)) {
    await query('UPDATE candidate_status_history SET old_status = $1 WHERE old_status = $2', [nw, old]);
    await query('UPDATE candidate_status_history SET new_status = $1 WHERE new_status = $2', [nw, old]);
  }

  // New constraint
  console.log('\n🔧 Adding new constraint...');
  try {
    await query(`ALTER TABLE pipeline ADD CONSTRAINT pipeline_status_check CHECK (status IN (
      'Sourced','Screening','Submitted to Client','Interview','Offered','Joined','Rejected','On Hold','Dropped'
    ))`);
  } catch (err) { console.log('  Constraint:', err.message); }

  await query("ALTER TABLE pipeline ALTER COLUMN status SET DEFAULT 'Sourced'");

  // Update views
  await query(`CREATE OR REPLACE VIEW daily_sourcing_report AS
    SELECT DATE(csh.created_at) as report_date, t.id as team_member_id, t.name as team_member,
      t.role, COUNT(DISTINCT csh.candidate_id) as candidates_submitted
    FROM candidate_status_history csh JOIN team t ON t.id = csh.changed_by
    WHERE csh.new_status = 'Submitted to Client'
    GROUP BY DATE(csh.created_at), t.id, t.name, t.role ORDER BY report_date DESC`);

  console.log('\n📊 New distribution:');
  const nw = await query('SELECT status, COUNT(*) as count FROM pipeline GROUP BY status ORDER BY count DESC');
  nw.rows.forEach(r => console.log(`  ${r.status}: ${r.count}`));

  console.log('\n✅ MIGRATION COMPLETE!');
  await pool.end();
}

migrate().catch(err => { console.error('Failed:', err); process.exit(1); });
