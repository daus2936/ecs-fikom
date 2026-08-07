import { z } from 'zod';
import { query } from '../config/db.js';

const baseSchema = z.object({
  tanggal_bayar:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nilai_bayar:             z.union([z.number(), z.string()])
                            .transform((v) => (typeof v === 'string' ? Number(v) : v))
                            .refine((v) => Number.isFinite(v) && v > 0, 'Nilai bayar harus > 0'),
  modal_id:               z.number().int().positive(),
  rekening_masuk_id:       z.number().int().positive(),
  rekening_dari_id:        z.number().int().positive(),
});

const LIST_SELECT = `
  SELECT bh.id, bh.tanggal_bayar, bh.nilai_bayar,
         bh.created_at, bh.updated_at,
         h.id AS modal_id, h.kode_modal, h.untuk_bayar_apa, h.dari_siapa,
         rm.nomor_rekening AS rek_masuk_nomor, rm.nama_pemilik AS rek_masuk_pemilik, rm.nama_bank AS rek_masuk_bank, rm.id AS rek_masuk_id,
         rd.nomor_rekening AS rek_dari_nomor,  rd.nama_pemilik AS rek_dari_pemilik,  rd.nama_bank AS rek_dari_bank,  rd.id AS rek_dari_id,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name
  FROM bayar_modal bh
  LEFT JOIN modal    h  ON h.id  = bh.modal_id
  LEFT JOIN rekening rm ON rm.id = bh.rekening_masuk_id
  LEFT JOIN rekening rd ON rd.id = bh.rekening_dari_id
  LEFT JOIN users    c  ON c.id  = bh.created_by
  LEFT JOIN users    u  ON u.id  = bh.updated_by
`;

export default async function bmRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('bm', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('bm', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('bm', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('bm', 'delete')] };

  fastify.get('/', canViewPerm, async (request, reply) => {
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

    const kodeHutang  = parseArrayParam(request.query?.kode_modal);
    const rekMasukIds = parseIntArrayParam(request.query?.rek_masuk_ids);
    const rekDariIds  = parseIntArrayParam(request.query?.rek_dari_ids);

    const where = []; const params = [];
    if (kodeHutang.length)  { params.push(kodeHutang);  where.push(`h.kode_modal = ANY($${params.length}::text[])`); }
    if (rekMasukIds.length) { params.push(rekMasukIds); where.push(`bh.rekening_masuk_id = ANY($${params.length}::int[])`); }
    if (rekDariIds.length)  { params.push(rekDariIds);  where.push(`bh.rekening_dari_id = ANY($${params.length}::int[])`); }
    if (fromP?.value)  { params.push(fromP.value); where.push(`bh.tanggal_bayar >= $${params.length}`); }
    if (toP?.value)    { params.push(toP.value);   where.push(`bh.tanggal_bayar <= $${params.length}`); }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const sql = LIST_SELECT + whereClause
              + ' ORDER BY bh.tanggal_bayar DESC, bh.id DESC LIMIT 500';
    const { rows } = await query(sql, params);

    // Total nominal Nilai Bayar Hutang (tanpa LIMIT), ikut filter.
    // Join hutang karena filter kode_modal memakai alias h.
    const sumSql = `SELECT COALESCE(SUM(bh.nilai_bayar), 0) AS total_amount, COUNT(*) AS cnt
                    FROM bayar_modal bh LEFT JOIN modal h ON h.id = bh.modal_id${whereClause}`;
    const { rows: sumRows } = await query(sumSql, params);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { bayar_modal: rows, summary };
  });

  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rows } = await query(
      `INSERT INTO bayar_modal
        (tanggal_bayar, nilai_bayar,
         modal_id, rekening_masuk_id, rekening_dari_id,
         created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6)
       RETURNING id`,
      [d.tanggal_bayar, d.nilai_bayar,
       d.modal_id, d.rekening_masuk_id, d.rekening_dari_id, request.user.id]
    );
    reply.code(201).send({ id: rows[0].id });
  });

  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rowCount } = await query(
      `UPDATE bayar_modal SET
         tanggal_bayar=$1, nilai_bayar=$2,
         modal_id=$3, rekening_masuk_id=$4, rekening_dari_id=$5, updated_by=$6
       WHERE id=$7`,
      [d.tanggal_bayar, d.nilai_bayar,
       d.modal_id, d.rekening_masuk_id, d.rekening_dari_id, request.user.id, id]
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'Bayar Modal tidak ditemukan.' });
    return { id };
  });

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rowCount } = await query(`DELETE FROM bayar_modal WHERE id=$1`, [id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Bayar Modal tidak ditemukan.' });
    return { success: true };
  });
}
