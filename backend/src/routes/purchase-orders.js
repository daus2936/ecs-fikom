import { z } from 'zod';
import { query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

// ============================================================
// Schemas
// ============================================================
const createPoSchema = z.object({
  po_number: z
    .string()
    .trim()
    .min(1, 'Nomor PO wajib diisi')
    .max(100, 'Nomor PO maksimal 100 karakter'),
});
// Edit pakai schema yang sama (cuma 1 field).
const editPoSchema = createPoSchema;

// ============================================================
// Routes
// ============================================================
export default async function purchaseOrderRoutes(fastify) {
  const authOnly = { preHandler: [fastify.authenticate] };
  const canViewPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('purchase-orders', 'view')] };
  const canCreate     = { preHandler: [fastify.authenticate, fastify.requirePermission('purchase-orders', 'create')] };
  const canEditPerm   = { preHandler: [fastify.authenticate, fastify.requirePermission('purchase-orders', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('purchase-orders', 'delete')] };

  // ----- GET /purchase-orders -------------------------------
  // List semua PO. Default ke yang terbaru. Mendukung ?q=...
  fastify.get('/', canViewPerm, async (request) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.trim() : '';
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');

    let sql = `
      SELECT p.id, p.po_number, p.created_at, p.updated_at,
             c.id AS created_by_id,
             c.username AS created_by_username,
             c.full_name AS created_by_name
      FROM purchase_orders p
      LEFT JOIN users c ON c.id = p.created_by
    `;
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` WHERE p.po_number ILIKE $${params.length}`;
    }
    sql += ' ORDER BY p.created_at DESC' + (isExport ? '' : ' LIMIT 10000');

    const { rows } = await query(sql, params);
    return { purchase_orders: rows };
  });

  // ----- POST /purchase-orders ------------------------------
  // Buat PO baru. Nomor PO ditentukan user (bebas, asal unik).
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = createPoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    try {
      const { rows } = await query(
        `INSERT INTO purchase_orders (po_number, created_by)
         VALUES ($1, $2)
         RETURNING id, po_number, created_at, updated_at`,
        [parsed.data.po_number, request.user.id]
      );
      return reply.code(201).send({ purchase_order: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Nomor PO sudah digunakan.' });
      }
      throw err;
    }
  });

  // ----- PUT /purchase-orders/:id ---------------------------
  // Edit nomor PO. Role dengan permission edit boleh.
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }
    const parsed = editPoSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    try {
      const { rows } = await query(
        `UPDATE purchase_orders SET po_number = $1 WHERE id = $2
         RETURNING id, po_number, created_at, updated_at`,
        [parsed.data.po_number, id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Nomor PO tidak ditemukan.' });
      }
      return { purchase_order: rows[0] };
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Nomor PO sudah digunakan.' });
      }
      throw err;
    }
  });

  // ----- DELETE /purchase-orders/:id ------------------------
  // Hanya admin & superadmin. Gagal kalau PO masih dipakai
  // oleh expense (FK RESTRICT).
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'purchase_orders',
      label: 'Nomor PO',
      fkMessage: 'Sebagian Nomor PO masih dipakai (Expenses/Invoice Detail/Cover) - tidak ada yang dihapus.',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    try {
      const { rowCount } = await query(`DELETE FROM purchase_orders WHERE id = $1`, [id]);
      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Nomor PO tidak ditemukan.' });
      }
      return { success: true };
    } catch (err) {
      if (err.code === '23503') {
        return reply.code(409).send({
          error: 'Nomor PO ini masih dipakai oleh data expense. Hapus referensinya dulu sebelum menghapus PO.',
        });
      }
      throw err;
    }
  });
}
