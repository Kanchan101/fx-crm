require('dotenv').config();
const { pool, query } = require('./db');
const { uploadCV, downloadCV } = require('./lib/storage');
const fs = require('fs');

async function test() {
  // Step 1: Check env vars
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? 'SET' : 'MISSING');

  // Step 2: Check if any candidate has cv_url
  const candidates = await query('SELECT name, cv_url FROM candidates ORDER BY created_at DESC LIMIT 5');
  candidates.rows.forEach(c => console.log('DB:', c.name, '->', c.cv_url || 'NULL'));

  // Step 3: Test upload
  const testBuffer = Buffer.from('test pdf content');
  const path = await uploadCV(testBuffer, 'test.pdf', 'TestUser');
  console.log('Upload test:', path ? 'SUCCESS -> ' + path : 'FAILED');

  // Step 4: Test download
  if (path) {
    const dl = await downloadCV(path);
    console.log('Download test:', dl ? 'SUCCESS' : 'FAILED');
  }

  await pool.end();
}
test().catch(e => { console.error('Error:', e.message); process.exit(1); });
