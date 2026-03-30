// migrate-workflow.js — Run ONCE to migrate pipeline statuses
// Usage: cd server && node migrate-workflow.js

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function migrate() {
  console.log('🔄 Starting pipeline workflow migration...\n');

  // Step 1: Add reject_reason, drop_reason, hold_reason columns if not exist
  console.log('1. Adding reason columns...');
  const { error: colErr } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE requirement_candidates 
        ADD COLUMN IF NOT EXISTS reject_reason TEXT,
        ADD COLUMN IF NOT EXISTS drop_reason TEXT,
        ADD COLUMN IF NOT EXISTS hold_reason TEXT;
    `
  });
  if (colErr) {
    // Try raw SQL if RPC not available
    console.log('   RPC not available, trying direct approach...');
    const cols = ['reject_reason', 'drop_reason', 'hold_reason'];
    for (const col of cols) {
      await supabase.from('requirement_candidates').select(col).limit(1).catch(() => {});
    }
    console.log('   Columns may already exist, continuing...');
  } else {
    console.log('   ✅ Reason columns added');
  }

  // Step 2: Map old statuses to new statuses
  console.log('\n2. Mapping old statuses to new...');

  const mappings = [
    { old: 'New', new: 'AM Review Pending' },
    { old: 'Sourced', new: 'AM Review Pending' },  // In case previous migration ran partially
    { old: 'Screening', new: 'AM Review Select' },
    { old: 'Submitted to Client', new: 'Client Review Pending' },
    { old: 'Client Review', new: 'Client Review Pending' },
    { old: 'Interview Stage', new: 'Interview' },
    { old: 'HR Discussion', new: 'Interview' },
    { old: 'Offer', new: 'Offered' },
    // Joined stays as Joined
    { old: 'Not Joined', new: 'Dropped' },
    { old: 'Account Manager Rejected', new: 'Rejected' },
    { old: 'Interview Reject', new: 'Rejected' },
  ];

  for (const m of mappings) {
    const { data, error } = await supabase
      .from('requirement_candidates')
      .update({ status: m.new })
      .eq('status', m.old)
      .select('id');

    if (error) {
      console.log(`   ⚠️  Error mapping "${m.old}" → "${m.new}": ${error.message}`);
    } else {
      console.log(`   ✅ "${m.old}" → "${m.new}" (${data?.length || 0} records)`);
    }
  }

  // Step 3: Update the DB check constraint
  console.log('\n3. Updating database constraint...');
  const { error: constraintErr } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE requirement_candidates DROP CONSTRAINT IF EXISTS requirement_candidates_status_check;
      ALTER TABLE requirement_candidates ADD CONSTRAINT requirement_candidates_status_check 
        CHECK (status IN (
          'AM Review Pending',
          'AM Review Select', 
          'Client Review Pending',
          'Interview',
          'Offered',
          'Joined',
          'Rejected',
          'On Hold',
          'Dropped'
        ));
    `
  });
  if (constraintErr) {
    console.log('   ⚠️  Could not update constraint via RPC. Run this SQL manually in Supabase:');
    console.log(`
      ALTER TABLE requirement_candidates DROP CONSTRAINT IF EXISTS requirement_candidates_status_check;
      ALTER TABLE requirement_candidates ADD CONSTRAINT requirement_candidates_status_check 
        CHECK (status IN (
          'AM Review Pending','AM Review Select','Client Review Pending',
          'Interview','Offered','Joined','Rejected','On Hold','Dropped'
        ));
    `);
  } else {
    console.log('   ✅ Constraint updated');
  }

  // Step 4: Add interview_round column if not exists
  console.log('\n4. Adding interview_round column...');
  const { error: roundErr } = await supabase.rpc('exec_sql', {
    sql: `
      ALTER TABLE requirement_candidates 
        ADD COLUMN IF NOT EXISTS interview_round TEXT DEFAULT 'L1';
    `
  });
  if (roundErr) {
    console.log('   ⚠️  Could not add interview_round column via RPC. Add manually.');
  } else {
    console.log('   ✅ interview_round column added');
  }

  // Step 5: Verify
  console.log('\n5. Verifying migration...');
  const { data: counts } = await supabase
    .from('requirement_candidates')
    .select('status')
    .then(({ data }) => {
      const statusCounts = {};
      (data || []).forEach(r => {
        statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
      });
      return { data: statusCounts };
    });

  console.log('\n📊 Current status distribution:');
  Object.entries(counts || {}).forEach(([status, count]) => {
    console.log(`   ${status}: ${count}`);
  });

  console.log('\n✅ Migration complete!\n');
  console.log('⚠️  IMPORTANT: If constraint update failed, run the SQL manually in Supabase Dashboard → SQL Editor');
  console.log('Then restart your backend server.\n');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
