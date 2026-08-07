import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, '../migrations');

async function run() {
  // Tabel untuk track migration yg sudah dijalankan
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = await pool.query('SELECT name FROM _migrations');
  const appliedSet = new Set(applied.rows.map((r) => r.name));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`✓ ${file} (sudah)`);
      continue;
    }
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`→ ${file} applied`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`✗ ${file} GAGAL:`, err.message);
      process.exit(1);
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log('Migrasi selesai.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
