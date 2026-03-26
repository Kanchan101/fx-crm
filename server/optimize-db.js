require('dotenv').config();
const { pool, query } = require('./db');

async function optimize() {
  console.log('Adding database indexes...\n');

  const indexes = [
    // Candidates — most queried table
    'CREATE INDEX IF NOT EXISTS idx_candidates_owner ON candidates(owner_id)',
    'CREATE INDEX IF NOT EXISTS idx_candidates_name ON candidates(LOWER(name))',
    'CREATE INDEX IF NOT EXISTS idx_candidates_email ON candidates(LOWER(email))',
    'CREATE INDEX IF NOT EXISTS idx_candidates_phone ON candidates(phone)',
    'CREATE INDEX IF NOT EXISTS idx_candidates_created ON candidates(created_at DESC)',

    // Pipeline — heavily joined
    'CREATE INDEX IF NOT EXISTS idx_pipeline_candidate ON pipeline(candidate_id)',
    'CREATE INDEX IF NOT EXISTS idx_pipeline_job ON pipeline(job_id)',
    'CREATE INDEX IF NOT EXISTS idx_pipeline_status ON pipeline(status)',
    'CREATE INDEX IF NOT EXISTS idx_pipeline_updated ON pipeline(updated_at DESC)',

    // Jobs
    'CREATE INDEX IF NOT EXISTS idx_jobs_client ON jobs(client_id)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_priority ON jobs(priority)',
    'CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC)',

    // Job assignments
    'CREATE INDEX IF NOT EXISTS idx_job_assignments_job ON job_assignments(job_id)',
    'CREATE INDEX IF NOT EXISTS idx_job_assignments_member ON job_assignments(team_member_id)',

    // Clients
    'CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)',
    'CREATE INDEX IF NOT EXISTS idx_clients_tier ON clients(tier)',
    'CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(LOWER(name))',

    // Status history — for reports
    'CREATE INDEX IF NOT EXISTS idx_status_history_candidate ON candidate_status_history(candidate_id)',
    'CREATE INDEX IF NOT EXISTS idx_status_history_job ON candidate_status_history(job_id)',
    'CREATE INDEX IF NOT EXISTS idx_status_history_date ON candidate_status_history(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_status_history_status ON candidate_status_history(new_status)',
    'CREATE INDEX IF NOT EXISTS idx_status_history_changed_by ON candidate_status_history(changed_by)',

    // Interviews
    'CREATE INDEX IF NOT EXISTS idx_interviews_date ON interviews(interview_date)',
    'CREATE INDEX IF NOT EXISTS idx_interviews_candidate ON interviews(candidate_id)',
    'CREATE INDEX IF NOT EXISTS idx_interviews_scheduled_by ON interviews(scheduled_by)',

    // Activity log
    'CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC)',
    'CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id)',

    // Client SPOCs
    'CREATE INDEX IF NOT EXISTS idx_client_spocs_client ON client_spocs(client_id)',

    // CV processing log
    'CREATE INDEX IF NOT EXISTS idx_cv_log_processed_by ON cv_processing_log(processed_by)',

    // Team
    'CREATE INDEX IF NOT EXISTS idx_team_email ON team(LOWER(email))',
    'CREATE INDEX IF NOT EXISTS idx_team_role ON team(role)',

    // Placements
    'CREATE INDEX IF NOT EXISTS idx_placements_candidate ON placements(candidate_id)',
    'CREATE INDEX IF NOT EXISTS idx_placements_job ON placements(job_id)',
    'CREATE INDEX IF NOT EXISTS idx_placements_client ON placements(client_id)',
  ];

  let success = 0;
  for (const sql of indexes) {
    try {
      await query(sql);
      const name = sql.match(/idx_\w+/)?.[0] || 'unknown';
      console.log('  ✓', name);
      success++;
    } catch (err) {
      console.log('  ✗', err.message.substring(0, 60));
    }
  }

  // Analyze tables for query planner
  console.log('\nAnalyzing tables...');
  const tables = ['candidates', 'pipeline', 'jobs', 'clients', 'job_assignments',
    'candidate_status_history', 'interviews', 'activity_log', 'team', 'client_spocs'];
  for (const t of tables) {
    try { await query(`ANALYZE ${t}`); } catch {}
  }

  console.log(`\n✅ ${success}/${indexes.length} indexes created`);
  console.log('✅ Tables analyzed for query optimization');
  await pool.end();
}

optimize().catch(e => { console.error(e); process.exit(1); });
