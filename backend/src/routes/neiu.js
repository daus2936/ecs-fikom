import { z } from 'zod';
import { query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

// NeiU: mirip hutang tapi tanpa periode_pinjam_hari, dari_siapa, rekening_dari.
// Status (open/close) di-derive dari total pembayaran di tabel neip.
const baseSchema = z.object({
  tanggal_menghutang:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nilai_hutang:        z.union([z.number(), z.string()])
                        .transform((v) => (typeof v === 'string' ? Number(v) : v))
                        .refine((v) => Number.isFinite(v) && v > 0, 'Nilai harus > 0'),
  rekening_tujuan_id:  z.number().int().positive(),
  untuk_bayar_apa:     z.string().min(1, 'Untuk bayar apa wajib diisi').max(500),
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
  SELECT n.id, n.kode_used, n.tanggal_menghutang, n.nilai_hutang,
         n.untuk_bayar_apa,
         n.created_at, n.updated_at,
         rt.id AS rek_tujuan_id, rt.nomor_rekening AS rek_tujuan_nomor, rt.nama_pemilik AS rek_tujuan_pemilik, rt.nama_bank AS rek_tujuan_bank,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name,
         -- Total yang sudah dibayar untuk NeiU ini (dari neip).
         COALESCE((SELECT SUM(np.nilai_bayar) FROM neip np WHERE np.neiu_id = n.id), 0) AS total_dibayar,
         -- Status: 'close' jika total bayar >= nilai, selain itu 'open'.
         CASE
           WHEN COALESCE((SELECT SUM(np.nilai_bayar) FROM neip np WHERE np.neiu_id = n.id), 0) >= n.nilai_hutang
           THEN 'close'
           ELSE 'open'
         END AS status
  FROM neiu n
  LEFT JOIN rekening rt ON rt.id = n.rekening_tujuan_id
  LEFT JOIN users c     ON c.id  = n.created_by
  LEFT JOIN users u     ON u.id  = n.updated_by
`;

export default async function neiuRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const canViewPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('neiu', 'view')] };
  const canCreate     = { preHandler: [fastify.authenticate, fastify.requirePermission('neiu', 'create')] };
  const canEditPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('neiu', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('neiu', 'delete')] };

  // ----- GET /neiu ------------------------------------------
  // Filter multi: kode_used[], rek_tujuan_ids[] + date range.
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
    function parseIntArrayParam(v) {
      return parseArrayParam(v).map(Number).filter((x) => Number.isInteger(x) && x > 0);
    }
    const kodeUsed     = parseArrayParam(request.query?.kode_used);
    const rekTujuanIds = parseIntArrayParam(request.query?.rek_tujuan_ids);

    const where = [];
    const params = [];
    if (kodeUsed.length)     { params.push(kodeUsed);     where.push(`n.kode_used = ANY($${params.length}::text[])`); }
    if (rekTujuanIds.length) { params.push(rekTujuanIds); where.push(`n.rekening_tujuan_id = ANY($${params.length}::int[])`); }
    if (fromP?.value) { params.push(fromP.value); where.push(`n.tanggal_menghutang >= $${params.length}`); }
    if (toP?.value)   { params.push(toP.value);   where.push(`n.tanggal_menghutang <= $${params.length}`); }

    const whereClause = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const sql = LIST_SELECT + whereClause
              + ' ORDER BY n.tanggal_menghutang DESC, n.id DESC' + (isExport ? '' : ' LIMIT 10000');
    const { rows } = await query(sql, params);

    const sumSql = `SELECT COALESCE(SUM(n.nilai_hutang), 0) AS total_amount, COUNT(*) AS cnt
                    FROM neiu n${whereClause}`;
    const { rows: sumRows } = await query(sumSql, params);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { neiu: rows, summary };
  });

  // ----- GET /neiu/kode-options -----------------------------
  fastify.get('/kode-options', canViewPerm, async () => {
    const { rows } = await query(`SELECT id, kode_used FROM neiu ORDER BY kode_used DESC`);
    return { options: rows };
  });

  // ----- GET /neiu/:id --------------------------------------
  fastify.get('/:id', authOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rows } = await query(LIST_SELECT + ' WHERE n.id = $1', [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'NeiU tidak ditemukan.' });
    return { neiu: rows[0] };
  });

  // ----- POST /neiu -----------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rows } = await query(
      `INSERT INTO neiu
        (tanggal_menghutang, nilai_hutang, rekening_tujuan_id, untuk_bayar_apa, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5)
       RETURNING id, kode_used`,
      [d.tanggal_menghutang, d.nilai_hutang, d.rekening_tujuan_id, d.untuk_bayar_apa, request.user.id]
    );
    reply.code(201).send({ id: rows[0].id, kode_used: rows[0].kode_used });
  });

  // ----- PUT /neiu/:id --------------------------------------
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const d = parsed.data;
    const { rowCount } = await query(
      `UPDATE neiu SET
         tanggal_menghutang=$1, nilai_hutang=$2, rekening_tujuan_id=$3, untuk_bayar_apa=$4,
         updated_by=$5
       WHERE id=$6`,
      [d.tanggal_menghutang, d.nilai_hutang, d.rekening_tujuan_id, d.untuk_bayar_apa, request.user.id, id]
    );
    if (rowCount === 0) return reply.code(404).send({ error: 'NeiU tidak ditemukan.' });
    return { id };
  });

  // ----- POST /bulk-delete (admin/superadmin only) ----------
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'neiu',
      label: 'NeiU',
      fkMessage: 'Sebagian NeiU sudah punya pembayaran (NeiP) - tidak ada yang dihapus.',
    })
  );

  // ----- DELETE /neiu/:id -----------------------------------
  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    try {
      const { rowCount } = await query(`DELETE FROM neiu WHERE id=$1`, [id]);
      if (rowCount === 0) return reply.code(404).send({ error: 'NeiU tidak ditemukan.' });
      return { success: true };
    } catch (e) {
      if (e.code === '23503') return reply.code(400).send({ error: 'NeiU sudah punya pembayaran (NeiP) — tidak bisa dihapus.' });
      throw e;
    }
  });
}
