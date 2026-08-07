import { z } from 'zod';
import { query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

const baseSchema = z.object({
  nomor_rekening: z.string().min(1, 'Nomor rekening wajib diisi').max(50),
  nama_pemilik:   z.string().min(1, 'Nama pemilik wajib diisi').max(200),
  nama_bank:      z.string().min(1, 'Nama bank wajib diisi').max(100),
});

export default async function rekeningRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('rekening', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('rekening', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('rekening', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('rekening', 'delete')] };

  // ----- GET /rekening --------------------------------------
  fastify.get('/', canViewPerm, async (request) => {
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    const search = typeof request.query?.q === 'string' ? request.query.q.trim() : '';
    let sql = `
      SELECT r.id, r.nomor_rekening, r.nama_pemilik, r.nama_bank,
             r.created_at, r.updated_at,
             c.username AS created_by_username, c.full_name AS created_by_name,
             u.username AS updated_by_username, u.full_name AS updated_by_name
      FROM rekening r
      LEFT JOIN users c ON c.id = r.created_by
      LEFT JOIN users u ON u.id = r.updated_by
    `;
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      sql += ` WHERE r.nomor_rekening ILIKE $1 OR r.nama_pemilik ILIKE $1 OR r.nama_bank ILIKE $1`;
    }
    sql += ` ORDER BY r.nama_bank, r.nomor_rekening` + (isExport ? '' : ' LIMIT 10000');
    const { rows } = await query(sql, params);
    return { rekening: rows };
  });

  // ----- POST /rekening -------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const data = parsed.data;
    try {
      const { rows } = await query(
        `INSERT INTO rekening (nomor_rekening, nama_pemilik, nama_bank, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$4) RETURNING id`,
        [data.nomor_rekening, data.nama_pemilik, data.nama_bank, request.user.id]
      );
      reply.code(201).send({ id: rows[0].id });
    } catch (e) {
      if (e.code === '23505') return reply.code(400).send({ error: 'Nomor rekening sudah terdaftar.' });
      throw e;
    }
  });

  // ----- PUT /rekening/:id ----------------------------------
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const data = parsed.data;
    try {
      const { rowCount } = await query(
        `UPDATE rekening SET nomor_rekening=$1, nama_pemilik=$2, nama_bank=$3, updated_by=$4 WHERE id=$5`,
        [data.nomor_rekening, data.nama_pemilik, data.nama_bank, request.user.id, id]
      );
      if (rowCount === 0) return reply.code(404).send({ error: 'Rekening tidak ditemukan.' });
      return { id };
    } catch (e) {
      if (e.code === '23505') return reply.code(400).send({ error: 'Nomor rekening sudah terdaftar.' });
      throw e;
    }
  });

  // ----- DELETE /rekening/:id -------------------------------
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'rekening',
      label: 'Rekening',
      fkMessage: 'Sebagian Rekening masih dipakai data lain - tidak ada yang dihapus.',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    try {
      const { rowCount } = await query(`DELETE FROM rekening WHERE id=$1`, [id]);
      if (rowCount === 0) return reply.code(404).send({ error: 'Rekening tidak ditemukan.' });
      return { success: true };
    } catch (e) {
      if (e.code === '23503') return reply.code(400).send({ error: 'Rekening dipakai oleh data hutang/bayar — tidak bisa dihapus.' });
      throw e;
    }
  });
}
