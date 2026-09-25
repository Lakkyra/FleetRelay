import fs from 'fs';
import path from 'path';
import { pool } from './index';

export async function runMigrations() {
  console.log('[PostGIS Migration] Applying spatial database schema...');
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    console.log('[PostGIS Migration] Schema applied successfully with GIST spatial indexes.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PostGIS Migration] Failed to apply schema:', err);
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
