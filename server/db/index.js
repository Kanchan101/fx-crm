const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 30,                        // Up from 20 — handles 50 concurrent users
  idleTimeoutMillis: 60000,       // Keep connections alive longer
  connectionTimeoutMillis: 10000, // More time for initial connect
  statement_timeout: 30000,       // Kill queries over 30s
  query_timeout: 30000,
});

pool.on('error', (err) => {
  console.error('DB pool error:', err.message);
});

pool.on('connect', () => {
  // Set statement timeout per connection
});

const query = async (text, params) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (duration > 2000) {
    console.warn(`[SLOW ${duration}ms]`, text.substring(0, 100));
  }
  return res;
};

const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, transaction };
