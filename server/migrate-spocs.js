require('dotenv').config();
const { pool, query } = require('./db');

async function migrate() {
  console.log('Creating client_spocs table...');
  await query(`
    CREATE TABLE IF NOT EXISTS client_spocs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      email VARCHAR(200),
      phone VARCHAR(15),
      designation VARCHAR(150),
      is_primary BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Migrate existing SPOC data from clients table
  const clients = await query('SELECT id, spoc_name, spoc_email, spoc_phone, spoc_role FROM clients WHERE spoc_name IS NOT NULL AND spoc_name != \'\'');
  for (const c of clients.rows) {
    const exists = await query('SELECT id FROM client_spocs WHERE client_id = $1 AND name = $2', [c.id, c.spoc_name]);
    if (exists.rows.length === 0) {
      await query(
        'INSERT INTO client_spocs (client_id, name, email, phone, designation, is_primary) VALUES ($1,$2,$3,$4,$5,true)',
        [c.id, c.spoc_name, c.spoc_email, c.spoc_phone, c.spoc_role]
      );
      console.log('  Migrated SPOC:', c.spoc_name);
    }
  }

  console.log('Done!');
  await pool.end();
}
migrate().catch(e => { console.error(e); process.exit(1); });
