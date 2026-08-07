import { z } from 'zod';
import { query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

// NeiP: pembayaran untuk NeiU. Mirip bayar_hutang tapi:
//  - merujuk neiu (Kode Used), bukan hutang.
//  - hanya Rekening Tujuan (tanpa rekening asal).
//  - tanpa periode_pelunasan_hari.
const baseSchema = z.object({
  tanggal_bayar:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nilai_bayar:        z.union([z.number(), z.string()])
                       .transform((v) => (typeof v === 'string' ? Number(v) : v))
                       .refine((v) => Number.isFinite(v) && v > 0, 'Nilai bayar harus > 0'),
  neiu_id:            z.number().int().positive(),
  rekening_tujuan_id: z.number().int().positive(),
});

const LIST_SELECT = `
  SELECT p.id, p.tanggal_bayar, p.nilai_bayar,
         p.created_at, p.updated_at,
         n.id AS neiu_id, n.kode_used, n.untuk_bayar_apa,
         rt.id AS rek_tujuan_id, rt.nomor_rekening AS rek_tujuan_nomor, rt.nama_pemilik AS rek_tujuan_pemilik, rt.nama_bank AS rek_tujuan_bank,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name
  FROM neip p
  LEFT JOIN neiu     n  ON n.id  = p.neiu_id
  LEFT JOIN rekening rt ON rt.id = p.rekening_tujuan_id
  LEFT JOIN users    c  ON c.id  = p.created_by
  LEFT JOIN users    u  ON u.id  = p.updated_by
`;

export default async function neipRoutes(fastify) {
  const authOnly      = { preHandler: [fastify.authenticate] };
  const canViewPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('neip', 'view')] };
  const canCreate     = { preHandler: [fastify.authenticate, fastify.requirePermission('neip', 'create')] };
  const canEditPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('neip', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('neip', 'delete')] };

  // ----- GET /neip ------------------------------------------
  // Filter multi: kode_used[], rek_tujuan_ids[] + date range.
  fastify.get('/', canViewPerm, async (request, reply) => {
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    function parseDateParam(value, label) {
      if (value === undefined || value === null || value === '') return null;
      const str = String(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return { error: `${label} tidak valid (format YYYY-MM-DD).` };
      const d = new Date(str + 'T00:00:00Z');
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== str) return { error: `${label} bukan tanggal yang valid.` };
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

    const kodeUsed     = parseArrayParam(request.query?.kode_used);
    const rekTujuanIds = parseIntArrayParam(request.query?.rek_tujuan_ids);

    const where = []; const params = [];
    if (kodeUsed.length)     { params.push(kodeUsed);     where.push(`n.kode_used = ANY($${params.length}::text[])`); }
    if (rekTujuanIds.length) { params.push(rekTujuanIds); where.push(`p.rekening_tujuan_id = ANY($${params.length}::int[])`); }
    if (fromP?.value)  { params.push(fromP.value); where.push(`p.tanggal_bayar >= $${params.length}`); }
    if (toP?.value)    { params.push(toP.value);   where.push(`p.tanggal_bayar <= $${params.length}`); }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const sql = LIST_SELECT + whereClause
              + ' ORDER BY p.tanggal_bayar DESC, p.id DESC' + (isExport ? '' : ' LIMIT 10000');
    const { rows } = await query(sql, params);

    const sumSql = `SELECT COALESCE(SUM(p.nilai_bayar), 0) AS total_amount, COUNT(*) AS cnt
                    FROM neip p LEFT JOIN neiu n ON n.id = p.neiu_id${whereClause}`;
    const { rows: sumRows } = await query(sumSql, params);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { neip: rows, summary };
  });

  // ----- GET /neip/:id --------------------------------------
  fastify.get('/:id', authOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rows } = await query(LIST_SELECT + ' WHERE p.id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'NeiP tidak ditemukan.' });
    return { neip: rows[0] };
  });

  // ----- POST /neip -----------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    try {
      const { rows } = await query(
        `INSERT INTO neip
          (tanggal_bayar, nilai_bayar, neiu_id, rekening_tujuan_id, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)
         RETURNING id`,
        [d.tanggal_bayar, d.nilai_bayar, d.neiu_id, d.rekening_tujuan_id, request.user.id]
      );
      reply.code(201).send({ id: rows[0].id });
    } catch (e) {
      if (e.code === '23503') return reply.code(400).send({ error: 'Kode Used atau Rekening Tujuan tidak valid.' });
      throw e;
    }
  });

  // ----- PUT /neip/:id --------------------------------------
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    try {
      const { rowCount } = await query(
        `UPDATE neip SET
           tanggal_bayar=$1, nilai_bayar=$2, neiu_id=$3, rekening_tujuan_id=$4, updated_by=$5
         WHERE id=$6`,
        [d.tanggal_bayar, d.nilai_bayar, d.neiu_id, d.rekening_tujuan_id, request.user.id, id]
      );
      if (rowCount === 0) return reply.code(404).send({ error: 'NeiP tidak ditemukan.' });
      return { id };
    } catch (e) {
      if (e.code === '23503') return reply.code(400).send({ error: 'Kode Used atau Rekening Tujuan tidak valid.' });
      throw e;
    }
  });

  // ----- POST /bulk-delete (admin/superadmin only) ----------
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'neip',
      label: 'NeiP',
    })
  );

  // ----- DELETE /neip/:id -----------------------------------
  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rowCount } = await query(`DELETE FROM neip WHERE id=$1`, [id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'NeiP tidak ditemukan.' });
    return { success: true };
  });
}
