import { z } from 'zod';
import { query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

const baseSchema = z.object({
  tanggal_bayar:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nilai_bayar:       z.union([z.number(), z.string()])
                      .transform((v) => (typeof v === 'string' ? Number(v) : v))
                      .refine((v) => Number.isFinite(v) && v > 0, 'Nilai bayar harus > 0'),
  bunga_hutang_id:   z.number().int().positive(),
  rekening_masuk_id: z.number().int().positive(),
  rekening_dari_id:  z.number().int().positive(),
});

// Sekarang merujuk ke bunga_hutang (bukan hutang langsung).
// Tampilkan juga kode hutang asal (lewat bunga_hutang → hutang) untuk konteks.
const LIST_SELECT = `
  SELECT bbh.id, bbh.tanggal_bayar, bbh.nilai_bayar,
         bbh.created_at, bbh.updated_at,
         bg.id AS bunga_hutang_id, bg.kode_bunga_hutang, bg.nilai_bunga_hutang,
         h.id AS hutang_id, h.kode_hutang, h.untuk_bayar_apa, h.dari_siapa,
         rm.nomor_rekening AS rek_masuk_nomor, rm.nama_pemilik AS rek_masuk_pemilik, rm.nama_bank AS rek_masuk_bank, rm.id AS rek_masuk_id,
         rd.nomor_rekening AS rek_dari_nomor,  rd.nama_pemilik AS rek_dari_pemilik,  rd.nama_bank AS rek_dari_bank,  rd.id AS rek_dari_id,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name
  FROM bayar_bunga_hutang bbh
  LEFT JOIN bunga_hutang bg ON bg.id = bbh.bunga_hutang_id
  LEFT JOIN hutang   h  ON h.id  = bg.hutang_id
  LEFT JOIN rekening rm ON rm.id = bbh.rekening_masuk_id
  LEFT JOIN rekening rd ON rd.id = bbh.rekening_dari_id
  LEFT JOIN users    c  ON c.id  = bbh.created_by
  LEFT JOIN users    u  ON u.id  = bbh.updated_by
`;

export default async function bayarBungaHutangRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const canViewPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('bayar-bunga-hutang', 'view')] };
  const canCreate     = { preHandler: [fastify.authenticate, fastify.requirePermission('bayar-bunga-hutang', 'create')] };
  const canEditPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('bayar-bunga-hutang', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('bayar-bunga-hutang', 'delete')] };

  fastify.get('/', canViewPerm, async (request, reply) => {
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    function parseDateParam(value, label) {
      if (value === undefined || value === null || value === '') return null;
      const str = String(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { error: `${label} tidak valid (format YYYY-MM-DD).` };
      const d = new Date(str + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str) {
        return { error: `${label} bukan tanggal yang valid.` };
      }
      return { value: str };
    }
    function parseArrayParam(v) {
      if (v === undefined || v === null || v === '') return [];
      const arr = Array.isArray(v) ? v : String(v).split(',');
      return arr.map((s) => String(s).trim()).filter(Boolean);
    }
    function parseIntArrayParam(v) {
      return parseArrayParam(v).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    }
    const fromP = parseDateParam(request.query?.date_from, 'date_from');
    if (fromP?.error) return reply.code(400).send({ error: fromP.error });
    const toP = parseDateParam(request.query?.date_to, 'date_to');
    if (toP?.error) return reply.code(400).send({ error: toP.error });

    const kodeHutang  = parseArrayParam(request.query?.kode_hutang);
    const kodeBunga   = parseArrayParam(request.query?.kode_bunga_hutang);
    const rekMasukIds = parseIntArrayParam(request.query?.rek_masuk_ids);
    const rekDariIds  = parseIntArrayParam(request.query?.rek_dari_ids);

    const where = []; const params = [];
    if (kodeHutang.length)  { params.push(kodeHutang);  where.push(`h.kode_hutang = ANY($${params.length}::text[])`); }
    if (kodeBunga.length)   { params.push(kodeBunga);   where.push(`bg.kode_bunga_hutang = ANY($${params.length}::text[])`); }
    if (rekMasukIds.length) { params.push(rekMasukIds); where.push(`bbh.rekening_masuk_id = ANY($${params.length}::int[])`); }
    if (rekDariIds.length)  { params.push(rekDariIds);  where.push(`bbh.rekening_dari_id = ANY($${params.length}::int[])`); }
    if (fromP?.value)  { params.push(fromP.value); where.push(`bbh.tanggal_bayar >= $${params.length}`); }
    if (toP?.value)    { params.push(toP.value);   where.push(`bbh.tanggal_bayar <= $${params.length}`); }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const sql = LIST_SELECT + whereClause
              + ' ORDER BY bbh.tanggal_bayar DESC, bbh.id DESC' + (isExport ? '' : ' LIMIT 10000');
    const { rows } = await query(sql, params);

    // Total nominal Nilai Bayar Bunga Hutang (tanpa LIMIT), ikut filter.
    // Join bunga_hutang & hutang karena filter pakai alias bg & h.
    const sumSql = `SELECT COALESCE(SUM(bbh.nilai_bayar), 0) AS total_amount, COUNT(*) AS cnt
                    FROM bayar_bunga_hutang bbh
                    LEFT JOIN bunga_hutang bg ON bg.id = bbh.bunga_hutang_id
                    LEFT JOIN hutang h ON h.id = bg.hutang_id${whereClause}`;
    const { rows: sumRows } = await query(sumSql, params);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { bayar_bunga_hutang: rows, summary };
  });

  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    // Pastikan bunga hutang ada.
    const { rows: bgRows } = await query(`SELECT id FROM bunga_hutang WHERE id = $1`, [d.bunga_hutang_id]);
    if (bgRows.length === 0) return reply.code(400).send({ error: 'Bunga Hutang yang dirujuk tidak ditemukan.' });

    const { rows } = await query(
      `INSERT INTO bayar_bunga_hutang
        (tanggal_bayar, nilai_bayar, bunga_hutang_id, rekening_masuk_id, rekening_dari_id, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      [d.tanggal_bayar, d.nilai_bayar, d.bunga_hutang_id, d.rekening_masuk_id, d.rekening_dari_id, request.user.id]
    );
    reply.code(201).send({ id: rows[0].id });
  });

  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rows: bgRows } = await query(`SELECT id FROM bunga_hutang WHERE id = $1`, [d.bunga_hutang_id]);
    if (bgRows.length === 0) return reply.code(400).send({ error: 'Bunga Hutang yang dirujuk tidak ditemukan.' });

    const { rowCount } = await query(
      `UPDATE bayar_bunga_hutang SET
         tanggal_bayar=$1, nilai_bayar=$2, bunga_hutang_id=$3,
         rekening_masuk_id=$4, rekening_dari_id=$5, updated_by=$6
       WHERE id=$7`,
      [d.tanggal_bayar, d.nilai_bayar, d.bunga_hutang_id,
       d.rekening_masuk_id, d.rekening_dari_id, request.user.id, id]
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'Bayar Bunga Hutang tidak ditemukan.' });
    return { id };
  });

  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'bayar_bunga_hutang',
      label: 'Bayar Bunga Hutang',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rowCount } = await query(`DELETE FROM bayar_bunga_hutang WHERE id=$1`, [id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Bayar Bunga Hutang tidak ditemukan.' });
    return { success: true };
  });
}
