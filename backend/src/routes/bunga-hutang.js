import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

const baseSchema = z.object({
  tanggal:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nilai_bunga_hutang: z.union([z.number(), z.string()])
                        .transform((v) => (typeof v === 'string' ? Number(v) : v))
                        .refine((v) => Number.isFinite(v) && v > 0, 'Nilai bunga hutang harus > 0'),
  hutang_id:          z.number().int().positive(),
});

function parseDateParam(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { error: `${label} tidak valid (format YYYY-MM-DD).` };
  const d = new Date(str + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str) return { error: `${label} bukan tanggal yang valid.` };
  return { value: str };
}

// ------------------------------------------------------------
// Generate kode_bunga_hutang: BNG-DDMMYY-NNNN (per hari, basis tanggal input WIB).
// Sama pola dengan expense_code. Aman race-condition (advisory lock + UNIQUE).
// ------------------------------------------------------------
function todayDDMMYYJakarta() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta', day: '2-digit', month: '2-digit', year: '2-digit',
  }).formatToParts(new Date());
  const dd = parts.find((p) => p.type === 'day').value;
  const mm = parts.find((p) => p.type === 'month').value;
  const yy = parts.find((p) => p.type === 'year').value;
  return `${dd}${mm}${yy}`;
}

async function generateBungaCode(client) {
  const ddmmyy = todayDDMMYYJakarta();
  const prefix = `BNG-${ddmmyy}-`;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`bunga_hutang_code:${ddmmyy}`]);
  const { rows } = await client.query(
    `SELECT COALESCE(MAX((regexp_replace(kode_bunga_hutang, '^BNG-\\d{6}-', ''))::int), 0) AS max_n
     FROM bunga_hutang WHERE kode_bunga_hutang LIKE $1`,
    [`${prefix}%`]
  );
  const next = (rows[0]?.max_n || 0) + 1;
  if (next > 9999) throw new Error(`Counter kode bunga hutang untuk tanggal ${ddmmyy} melebihi 9999.`);
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// Status bunga hutang LUNAS jika SUM(bayar_bunga_hutang) >= nilai_bunga_hutang.
const LIST_SELECT = `
  SELECT bg.id, bg.kode_bunga_hutang, bg.tanggal, bg.nilai_bunga_hutang,
         bg.created_at, bg.updated_at,
         h.id AS hutang_id, h.kode_hutang, h.untuk_bayar_apa, h.dari_siapa,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name,
         COALESCE((SELECT SUM(bbh.nilai_bayar) FROM bayar_bunga_hutang bbh WHERE bbh.bunga_hutang_id = bg.id), 0) AS total_dibayar,
         CASE
           WHEN COALESCE((SELECT SUM(bbh.nilai_bayar) FROM bayar_bunga_hutang bbh WHERE bbh.bunga_hutang_id = bg.id), 0) >= bg.nilai_bunga_hutang
           THEN 'lunas'
           ELSE 'belom_lunas'
         END AS status
  FROM bunga_hutang bg
  LEFT JOIN hutang h ON h.id = bg.hutang_id
  LEFT JOIN users  c ON c.id = bg.created_by
  LEFT JOIN users  u ON u.id = bg.updated_by
`;

export default async function bungaHutangRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const canViewPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('bunga-hutang', 'view')] };
  const canCreate     = { preHandler: [fastify.authenticate, fastify.requirePermission('bunga-hutang', 'create')] };
  const canEditPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('bunga-hutang', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('bunga-hutang', 'delete')] };

  // ----- GET /bunga-hutang ----------------------------------
  // Filter multi: kode_hutang[], kode_bunga_hutang[] + date range.
  fastify.get('/', canViewPerm, async (request, reply) => {
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    const fromP = parseDateParam(request.query?.date_from, 'date_from');
    if (fromP?.error) return reply.code(400).send({ error: fromP.error });
    const toP = parseDateParam(request.query?.date_to, 'date_to');
    if (toP?.error) return reply.code(400).send({ error: toP.error });

    function parseArrayParam(v) {
      if (v === undefined || v === null || v === '') return [];
      const arr = Array.isArray(v) ? v : String(v).split(',');
      return arr.map((s) => String(s).trim()).filter(Boolean);
    }
    const kodeHutang = parseArrayParam(request.query?.kode_hutang);
    const kodeBunga  = parseArrayParam(request.query?.kode_bunga_hutang);

    const where = []; const params = [];
    if (kodeHutang.length) { params.push(kodeHutang); where.push(`h.kode_hutang = ANY($${params.length}::text[])`); }
    if (kodeBunga.length)  { params.push(kodeBunga);  where.push(`bg.kode_bunga_hutang = ANY($${params.length}::text[])`); }
    if (fromP?.value) { params.push(fromP.value); where.push(`bg.tanggal >= $${params.length}`); }
    if (toP?.value)   { params.push(toP.value);   where.push(`bg.tanggal <= $${params.length}`); }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const sql = LIST_SELECT + whereClause + ' ORDER BY bg.tanggal DESC, bg.id DESC' + (isExport ? '' : ' LIMIT 10000');
    const { rows } = await query(sql, params);

    // Total nominal bunga hutang (tanpa LIMIT), ikut filter.
    const sumSql = `SELECT COALESCE(SUM(bg.nilai_bunga_hutang), 0) AS total_amount, COUNT(*) AS cnt
                    FROM bunga_hutang bg LEFT JOIN hutang h ON h.id = bg.hutang_id${whereClause}`;
    const { rows: sumRows } = await query(sumSql, params);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { bunga_hutang: rows, summary };
  });

  // ----- GET /bunga-hutang/kode-options ---------------------
  // Daftar kode bunga hutang (untuk opsi filter multi-select).
  fastify.get('/kode-options', canViewPerm, async () => {
    const { rows } = await query(
      `SELECT id, kode_bunga_hutang FROM bunga_hutang ORDER BY kode_bunga_hutang DESC`
    );
    return { options: rows };
  });

  // ----- GET /bunga-hutang/:id ------------------------------
  fastify.get('/:id', authOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rows } = await query(LIST_SELECT + ' WHERE bg.id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Bunga Hutang tidak ditemukan.' });
    return { bunga_hutang: rows[0] };
  });

  // ----- POST /bunga-hutang ---------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Pastikan hutang ada.
      const { rows: hRows } = await client.query(`SELECT id FROM hutang WHERE id = $1`, [d.hutang_id]);
      if (hRows.length === 0) {
        await client.query('ROLLBACK');
        return reply.code(400).send({ error: 'Hutang yang dirujuk tidak ditemukan.' });
      }
      const kode = await generateBungaCode(client);
      const { rows } = await client.query(
        `INSERT INTO bunga_hutang
          (kode_bunga_hutang, tanggal, nilai_bunga_hutang, hutang_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)
         RETURNING id, kode_bunga_hutang`,
        [kode, d.tanggal, d.nilai_bunga_hutang, d.hutang_id, request.user.id]
      );
      await client.query('COMMIT');
      reply.code(201).send({ id: rows[0].id, kode_bunga_hutang: rows[0].kode_bunga_hutang });
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw e;
    } finally {
      client.release();
    }
  });

  // ----- PUT /bunga-hutang/:id ------------------------------
  // Kode tidak berubah (permanen). Hanya tanggal, nilai, hutang_id.
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;

    const { rows: hRows } = await query(`SELECT id FROM hutang WHERE id = $1`, [d.hutang_id]);
    if (hRows.length === 0) return reply.code(400).send({ error: 'Hutang yang dirujuk tidak ditemukan.' });

    const { rowCount } = await query(
      `UPDATE bunga_hutang SET tanggal=$1, nilai_bunga_hutang=$2, hutang_id=$3, updated_by=$4 WHERE id=$5`,
      [d.tanggal, d.nilai_bunga_hutang, d.hutang_id, request.user.id, id]
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'Bunga Hutang tidak ditemukan.' });
    return { id };
  });

  // ----- DELETE /bunga-hutang/:id ---------------------------
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'bunga_hutang',
      label: 'Bunga Hutang',
      fkMessage: 'Sebagian Bunga Hutang sudah punya Bayar Bunga - tidak ada yang dihapus.',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    try {
      const { rowCount } = await query(`DELETE FROM bunga_hutang WHERE id=$1`, [id]);
      if (rowCount === 0) return reply.code(404).send({ error: 'Bunga Hutang tidak ditemukan.' });
      return { success: true };
    } catch (e) {
      if (e.code === '23503') {
        return reply.code(400).send({ error: 'Bunga Hutang sudah punya data Bayar Bunga Hutang — tidak bisa dihapus.' });
      }
      throw e;
    }
  });
}
