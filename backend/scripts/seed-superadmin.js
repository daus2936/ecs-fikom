import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool } from '../src/config/db.js';

async function seed() {
  const username = process.env.SUPERADMIN_USERNAME;
  const password = process.env.SUPERADMIN_PASSWORD;
  const fullName = process.env.SUPERADMIN_FULL_NAME;
  const email    = process.env.SUPERADMIN_EMAIL?.trim() || null;

  if (!username || !password || !fullName) {
    console.error('❌ SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD, dan SUPERADMIN_FULL_NAME wajib di .env');
    process.exit(1);
  }

  const existing = await pool.query("SELECT id, username FROM users WHERE role = 'superadmin'");
  if (existing.rows.length > 0) {
    console.log(`ℹ Superadmin sudah ada (username: ${existing.rows[0].username}). Tidak ada perubahan.`);
    await pool.end();
    return;
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const passwordHash = await bcrypt.hash(password, rounds);

  await pool.query(
    `INSERT INTO users (full_name, username, password_hash, email, role, is_active)
     VALUES ($1, $2, $3, $4, 'superadmin', TRUE)`,
    [fullName, username, passwordHash, email]
  );

  console.log(`✓ Superadmin '${username}' berhasil dibuat.`);
  console.log('⚠ Sekarang hapus / kosongkan SUPERADMIN_PASSWORD di .env.');
  await pool.end();
}

seed().catch((err) => {
  console.error('❌ Gagal seed superadmin:', err.message);
  process.exit(1);
});
