require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  try {
    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS remarks TEXT');
    await pool.query('ALTER TABLE candidates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()');
    console.log('✅ remarks + updated_at columns added to candidates');
  } catch(e) { console.log('Columns may exist:', e.message); }
  finally { pool.end(); }
})();
