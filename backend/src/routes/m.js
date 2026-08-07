import { z } from 'zod';
import { query } from '../config/db.js';

const baseSchema = z.object({
  tanggal_modal:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nilai_modal:        z.union([z.number(), z.string()])
                        .transform((v) => (typeof v === 'string' ? Number(v) : v))
                        .refine((v) => Number.isFinite(v) && v > 0, 'Nilai modal harus > 0'),
  rekening_masuk_id:   z.number().int().positive(),
  untuk_bayar_apa:     z.string().min(1, 'Untuk bayar apa wajib diisi').max(500),
  dari_siapa:          z.string().min(1, 'Dari siapa wajib diisi').max(200),
  rekening_dari_id:    z.number().int().positive(),
});

function parseDateParam(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { error: `${label} tidak valid (format YYYY-MM-DD).` };
  const d = new Date(str + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str) return { error: `${label} bukan tanggal yang valid.` };
  return { value: str };
}

const LIST_SELECT = `
  SELECT h.id, h.kode_modal, h.tanggal_modal, h.nilai_modal,
         h.untuk_bayar_apa, h.dari_siapa,
         h.created_at, h.updated_at,
         rm.id AS rek_masuk_id, rm.nomor_rekening AS rek_masuk_nomor, rm.nama_pemilik AS rek_masuk_pemilik, rm.nama_bank AS rek_masuk_bank,
         rd.id AS rek_dari_id,  rd.nomor_rekening AS rek_dari_nomor,  rd.nama_pemilik AS rek_dari_pemilik,  rd.nama_bank AS rek_dari_bank,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name,
         -- Total yang sudah dibayar untuk modal ini (dari bayar_modal).
         COALESCE((SELECT SUM(bm.nilai_bayar) FROM bayar_modal bm WHERE bm.modal_id = h.id), 0) AS total_dibayar,
         -- Status modal LUNAS jika total bayar_modal >= nilai_modal.
         CASE
           WHEN COALESCE((SELECT SUM(bm.nilai_bayar) FROM bayar_modal bm WHERE bm.modal_id = h.id), 0) >= h.nilai_modal
           THEN 'lunas'
           ELSE 'belom_lunas'
         END AS status
  FROM modal h
  LEFT JOIN rekening rm ON rm.id = h.rekening_masuk_id
  LEFT JOIN rekening rd ON rd.id = h.rekening_dari_id
  LEFT JOIN users c     ON c.id  = h.created_by
  LEFT JOIN users u     ON u.id  = h.updated_by
`;

export default async function mRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('m', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('m', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('m', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('m', 'delete')] };

  // ----- GET /hutang ----------------------------------------
  // Filter multi: kode_modal[], rek_masuk_ids[], rek_dari_ids[] + date range.
  fastify.get('/', canViewPerm, async (request, reply) => {
    const fromP = parseDateParam(request.query?.date_from, 'date_from');
    if (fromP?.error) return reply.code(400).send({ error: fromP.error });
    const toP = parseDateParam(request.query?.date_to, 'date_to');
    if (toP?.error) return reply.code(400).send({ error: toP.error });

    function parseArrayParam(v) {
      if (v === undefined || v === null || v === '') return [];
      const arr = Array.isArray(v) ? v : String(v).split(',');
      return arr.map((s) => String(s).trim()).filter(Boolean);
    }
    function parseIntArrayParam(v) {
      return parseArrayParam(v).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    }
    const kodeHutang = parseArrayParam(request.query?.kode_modal);
    const rekMasukIds = parseIntArrayParam(request.query?.rek_masuk_ids);
    const rekDariIds  = parseIntArrayParam(request.query?.rek_dari_ids);

    const where = [];
    const params = [];
    if (kodeHutang.length)  { params.push(kodeHutang);  where.push(`h.kode_modal = ANY($${params.length}::text[])`); }
    if (rekMasukIds.length) { params.push(rekMasukIds); where.push(`h.rekening_masuk_id = ANY($${params.length}::int[])`); }
    if (rekDariIds.length)  { params.push(rekDariIds);  where.push(`h.rekening_dari_id = ANY($${params.length}::int[])`); }
    if (fromP?.value) { params.push(fromP.value); where.push(`h.tanggal_modal >= $${params.length}`); }
    if (toP?.value)   { params.push(toP.value);   where.push(`h.tanggal_modal <= $${params.length}`); }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const sql = LIST_SELECT + whereClause
              + ' ORDER BY h.tanggal_modal DESC, h.id DESC LIMIT 500';
    const { rows } = await query(sql, params);

    const sumSql = `SELECT COALESCE(SUM(h.nilai_modal), 0) AS total_amount, COUNT(*) AS cnt
                    FROM modal h${whereClause}`;
    const { rows: sumRows } = await query(sumSql, params);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { modal: rows, summary };
  });

  // ----- GET /hutang/kode-options ---------------------------
  // Daftar semua kode hutang (untuk opsi filter multi-select).
  fastify.get('/kode-options', canViewPerm, async () => {
    const { rows } = await query(
      `SELECT id, kode_modal FROM modal ORDER BY kode_modal DESC`
    );
    return { options: rows };
  });

  // ----- GET /hutang/:id ------------------------------------
  fastify.get('/:id', authOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rows } = await query(LIST_SELECT + ' WHERE h.id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Modal tidak ditemukan.' });
    return { modal: rows[0] };
  });

  // ----- POST /hutang ---------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rows } = await query(
      `INSERT INTO modal
        (tanggal_modal, nilai_modal,
         rekening_masuk_id, untuk_bayar_apa, dari_siapa, rekening_dari_id,
         created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
       RETURNING id, kode_modal`,
      [d.tanggal_modal, d.nilai_modal,
       d.rekening_masuk_id, d.untuk_bayar_apa, d.dari_siapa, d.rekening_dari_id,
       request.user.id]
    );
    reply.code(201).send({ id: rows[0].id, kode_modal: rows[0].kode_modal });
  });

  // ----- PUT /hutang/:id ------------------------------------
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rowCount } = await query(
      `UPDATE modal SET
         tanggal_modal=$1, nilai_modal=$2,
         rekening_masuk_id=$3, untuk_bayar_apa=$4, dari_siapa=$5, rekening_dari_id=$6,
         updated_by=$7
       WHERE id=$8`,
      [d.tanggal_modal, d.nilai_modal,
       d.rekening_masuk_id, d.untuk_bayar_apa, d.dari_siapa, d.rekening_dari_id,
       request.user.id, id]
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'Modal tidak ditemukan.' });
    return { id };
  });

  // ----- DELETE /m/:id ---------------------------------
  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    try {
      const { rowCount } = await query(`DELETE FROM modal WHERE id=$1`, [id]);
      if (rowCount === 0) return reply.code(404).send({ error: 'Modal tidak ditemukan.' });
      return { success: true };
    } catch (e) {
      if (e.code === '23503') return reply.code(400).send({ error: 'Modal sudah punya data Bayar Modal — tidak bisa dihapus.' });
      throw e;
    }
  });
}
