import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';

// ============================================================
// Schemas
// ============================================================
const createInvoiceSchema = z.object({
  invoice_number: z
    .string()
    .trim()
    .min(1, 'Nomor invoice wajib diisi')
    .max(100, 'Nomor invoice maksimal 100 karakter'),
  description: z
    .string()
    .max(1000, 'Deskripsi maksimal 1000 karakter')
    .optional()
    .nullable()
    .transform((v) => (v && v.trim() !== '' ? v.trim() : null)),
});

// Schema khusus untuk import — sama dgn create, tapi description selalu nullable
const importInvoiceSchema = createInvoiceSchema;

// ============================================================
// Routes
// ============================================================
export default async function invoiceRoutes(fastify) {
  const authOnly = { preHandler: [fastify.authenticate] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoices', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('invoices', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoices', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoices', 'delete')] };

  // ----- GET /invoices --------------------------------------
  // ?export=1 → kembalikan SEMUA data (tanpa LIMIT) untuk export Excel.
  fastify.get('/', canViewPerm, async (request) => {
    const q = typeof request.query?.q === 'string' ? request.query.q.trim() : '';
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');

    let sql = `
      SELECT i.id, i.invoice_number, i.description,
             i.created_at, i.updated_at,
             c.id AS created_by_id,
             c.username AS created_by_username,
             c.full_name AS created_by_name
      FROM invoices i
      LEFT JOIN users c ON c.id = i.created_by
    `;
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      sql += ` WHERE i.invoice_number ILIKE $${params.length}`;
    }
    // Sorting: default created_at DESC. Kalau ?sort=invoice → urut invoice_number.
    const sortInvoice = request.query?.sort === 'invoice';
    const dir = request.query?.dir === 'desc' ? 'DESC' : 'ASC';
    const orderBy = sortInvoice
      ? `i.invoice_number ${dir}`
      : 'i.created_at DESC';
    sql += ` ORDER BY ${orderBy}` + (isExport ? '' : ' LIMIT 10000');

    const { rows } = await query(sql, params);
    return { invoices: rows };
  });

  // ----- POST /invoices -------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = createInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    try {
      const { rows } = await query(
        `INSERT INTO invoices (invoice_number, description, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, invoice_number, description, created_at, updated_at`,
        [parsed.data.invoice_number, parsed.data.description, request.user.id]
      );
      return reply.code(201).send({ invoice: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Nomor invoice sudah digunakan.' });
      }
      throw err;
    }
  });

  // ----- PUT /invoices/:id ----------------------------------
  // Edit nomor invoice + deskripsi. Guard: permission 'edit'.
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }
    const parsed = createInvoiceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    try {
      const { rows } = await query(
        `UPDATE invoices
            SET invoice_number = $1, description = $2, updated_at = NOW()
          WHERE id = $3
        RETURNING id, invoice_number, description, created_at, updated_at`,
        [parsed.data.invoice_number, parsed.data.description, id]
      );
      if (rows.length === 0) {
        return reply.code(404).send({ error: 'Nomor invoice tidak ditemukan.' });
      }
      return { invoice: rows[0] };
    } catch (err) {
      if (err.code === '23505') {
        return reply.code(409).send({ error: 'Nomor invoice sudah digunakan.' });
      }
      throw err;
    }
  });

  // ----- DELETE /invoices/:id -------------------------------
  // Hanya admin & superadmin. Akan gagal kalau invoice masih
  // direferensikan oleh expense (FK RESTRICT) — pesan jelas dikirim.
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'invoices',
      label: 'Nomor Invoice',
      fkMessage: 'Sebagian Nomor Invoice masih dipakai (Expenses/Invoice Detail/Cover/Payment) - tidak ada yang dihapus.',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    try {
      const { rowCount } = await query(`DELETE FROM invoices WHERE id = $1`, [id]);
      if (rowCount === 0) {
        return reply.code(404).send({ error: 'Nomor invoice tidak ditemukan.' });
      }
      return { success: true };
    } catch (err) {
      if (err.code === '23503') {
        return reply.code(409).send({
          error: 'Nomor invoice ini masih dipakai oleh data expense. Hapus referensinya dulu sebelum menghapus invoice.',
        });
      }
      throw err;
    }
  });

  // ----- POST /invoices/import ------------------------------
  // Bulk import dari Excel. Body: { rows: [{ invoice_number, description }, ...] }.
  // Transaksi all-or-nothing: kalau ada 1 baris yang error, rollback semuanya
  // supaya tidak ada partial import.
  fastify.post('/import', canCreate, async (request, reply) => {
    const body = request.body || {};
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return reply.code(400).send({ error: 'Tidak ada data untuk di-import.' });
    }
    if (body.rows.length > 5000) {
      return reply.code(400).send({ error: 'Maksimal 5000 baris per import.' });
    }

    // Validate semua row dulu, sebelum buka transaksi (fail-fast).
    const validated = [];
    for (let i = 0; i < body.rows.length; i++) {
      const parsed = importInvoiceSchema.safeParse(body.rows[i]);
      if (!parsed.success) {
        return reply.code(400).send({
          error: `Baris ${i + 2}: ${parsed.error.errors[0].message}`,
        });
      }
      validated.push(parsed.data);
    }

    // Cek duplikasi dalam batch (sebelum hit DB unique constraint)
    const seen = new Set();
    for (let i = 0; i < validated.length; i++) {
      const n = validated[i].invoice_number;
      if (seen.has(n)) {
        return reply.code(400).send({
          error: `Baris ${i + 2}: Nomor invoice "${n}" duplikat dalam file Excel.`,
        });
      }
      seen.add(n);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = [];
      for (let i = 0; i < validated.length; i++) {
        const row = validated[i];
        try {
          const { rows } = await client.query(
            `INSERT INTO invoices (invoice_number, description, created_by)
             VALUES ($1, $2, $3) RETURNING id`,
            [row.invoice_number, row.description, request.user.id]
          );
          ids.push(rows[0].id);
        } catch (err) {
          await client.query('ROLLBACK');
          if (err.code === '23505') {
            return reply.code(409).send({
              error: `Baris ${i + 2}: Nomor invoice "${row.invoice_number}" sudah ada di database.`,
            });
          }
          throw err;
        }
      }
      await client.query('COMMIT');
      return reply.code(201).send({ imported: ids.length, ids });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  });
}
