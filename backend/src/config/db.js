import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

// ============================================================
// PENTING — Override DATE (OID 1082) parser.
//
// Default-nya pg-types@2.x parse DATE pakai `new Date(yyyy, mm, dd)`
// dalam LOCAL TIME server. Konsekuensinya, di server non-UTC
// (mis. UTC+7 Jakarta) JSON-nya jadi geser 1 hari saat di-serialize
// — display di frontend salah, dan filter range tanggal jadi tidak
// pernah match yang user lihat.
//
// Solusinya: kembalikan apa adanya sebagai string "YYYY-MM-DD".
// Frontend formatDateOnly() sudah handle format ini.
// ============================================================
pg.types.setTypeParser(1082, (value) => value);

// ============================================================
// Bangun config DB dengan prioritas:
//   1. DATABASE_URL (kalau di-set) — untuk Heroku/Railway/Render
//   2. DATABASE_HOST/PORT/NAME/USERNAME/PASSWORD (field terpisah)
// ============================================================
function buildPoolConfig() {
  const baseConfig = {
    max: 20,
    idleTimeoutMillis: 30_000,
  };

  // Opsi 1: pakai DATABASE_URL kalau ada
  if (process.env.DATABASE_URL) {
    return {
      ...baseConfig,
      connectionString: process.env.DATABASE_URL,
      ssl: parseSsl(process.env.DATABASE_SSL),
    };
  }

  // Opsi 2: field terpisah
  const host     = process.env.DATABASE_HOST;
  const port     = process.env.DATABASE_PORT;
  const database = process.env.DATABASE_NAME;
  const user     = process.env.DATABASE_USERNAME;
  const password = process.env.DATABASE_PASSWORD;

  const missing = [];
  if (!host)     missing.push('DATABASE_HOST');
  if (!port)     missing.push('DATABASE_PORT');
  if (!database) missing.push('DATABASE_NAME');
  if (!user)     missing.push('DATABASE_USERNAME');
  if (password === undefined) missing.push('DATABASE_PASSWORD');
  // Note: password boleh string kosong utk PG yg trust-auth, jadi cek undefined saja
  if (missing.length > 0) {
    throw new Error(
      `Konfigurasi database tidak lengkap. Field yang belum diset di .env: ${missing.join(', ')}.\n` +
      `Atau set DATABASE_URL sebagai alternatif.`
    );
  }

  return {
    ...baseConfig,
    host,
    port: Number(port),
    database,
    user,
    password,
    ssl: parseSsl(process.env.DATABASE_SSL),
  };
}

function parseSsl(value) {
  if (!value) return false;
  const v = String(value).toLowerCase();
  if (v === 'true' || v === '1' || v === 'require') {
    // rejectUnauthorized: false → terima self-signed cert (umum di managed DB)
    return { rejectUnauthorized: false };
  }
  return false;
}

export const pool = new Pool(buildPoolConfig());

pool.on('error', (err) => {
  console.error('Unexpected DB error:', err);
});

/** Helper query: terima text + params, return rows */
export async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}
