import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';
import {
  SUB_ENTITIES,
  CATEGORY3,
  CLIENT_SUB_ENTITY_CODES,
} from '../constants/expense.js';

// ============================================================
// Schema
// ============================================================
const baseSchema = z.object({
  payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid (format YYYY-MM-DD)'),
  sub_entity:   z.string().refine((v) => CLIENT_SUB_ENTITY_CODES.includes(v), 'Client tidak valid'),
  category3:    z.string().refine((v) => v in CATEGORY3, 'Kategori 3 tidak valid').nullable().optional(),
  amount:       z.union([z.number(), z.string()])
                  .transform((v) => (typeof v === 'string' ? Number(v) : v))
                  .refine((v) => Number.isFinite(v) && v > 0, 'Nominal harus lebih dari 0'),
  invoice_ids:  z.array(z.number().int().positive()).default([]),
});

function validateConsistency(data) {
  // cat3 hanya untuk BIERSDORF, dan WAJIB kalau BIERSDORF
  if (data.sub_entity === 'BIERSDORF') {
    if (!data.category3) {
      return 'Kategori 3 (NMA/BMC/KPL/OTHERS) wajib diisi untuk PT Biersdorf Indonesia.';
    }
  } else if (data.category3) {
    return 'Kategori 3 hanya berlaku untuk PT Biersdorf Indonesia.';
  }
  return null;
}

// ============================================================
// Helpers DB
// ============================================================
async function replaceInvoicePivot(client, paymentId, invoiceIds) {
  await client.query(`DELETE FROM payment_invoices WHERE payment_id = $1`, [paymentId]);
  if (invoiceIds.length === 0) return;
  const placeholders = invoiceIds.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO payment_invoices (payment_id, invoice_id) VALUES ${placeholders}`,
    [paymentId, ...invoiceIds]
  );
}

async function assertInvoicesExist(ids) {
  if (ids.length === 0) return;
  const { rows } = await query(`SELECT id FROM invoices WHERE id = ANY($1::int[])`, [ids]);
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    const err = new Error(`Invoice tidak ditemukan: ID ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

// ============================================================
// List query
// ============================================================
function buildWhere({ search, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  if (search) {
    const q = search.toLowerCase();
    const matchingSubs = Object.entries(SUB_ENTITIES)
      .filter(([, def]) => def.type === 'client' && def.label.toLowerCase().includes(q))
      .map(([code]) => code);

    params.push(`%${search}%`);
    const idx = params.length;
    const conds = [
      `EXISTS (SELECT 1 FROM payment_invoices pi
               JOIN invoices i ON i.id = pi.invoice_id
               WHERE pi.payment_id = p.id AND i.invoice_number ILIKE $${idx})`,
    ];
    if (matchingSubs.length > 0) {
      params.push(matchingSubs);
      conds.push(`p.sub_entity = ANY($${params.length}::text[])`);
    }
    where.push(`(${conds.join(' OR ')})`);
  }

  if (dateFrom) { params.push(dateFrom); where.push(`p.payment_date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo);   where.push(`p.payment_date <= $${params.length}`); }

  return { where, params };
}

function buildSumQuery(filters) {
  const { where, params } = buildWhere(filters);
  const sql = `
    SELECT COALESCE(SUM(p.amount), 0) AS total_amount, COUNT(*) AS cnt
    FROM payments p
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;
  return { sql, params };
}

function buildListQuery(filters, noLimit = false, sort = null) {
  const { where, params } = buildWhere(filters);

  let orderBy = 'p.payment_date DESC, p.created_at DESC';
  if (sort === 'invoice_asc' || sort === 'invoice_desc') {
    const dir = sort === 'invoice_desc' ? 'DESC' : 'ASC';
    orderBy = `(SELECT MIN(i.invoice_number) FROM payment_invoices pi
                JOIN invoices i ON i.id = pi.invoice_id
                WHERE pi.payment_id = p.id) ${dir} NULLS LAST, p.created_at DESC`;
  }
  const sql = `
    SELECT p.id, p.payment_date, p.sub_entity, p.category3, p.amount,
           p.created_at, p.updated_at,
           c.id AS created_by_id, c.username AS created_by_username, c.full_name AS created_by_name,
           u.id AS updated_by_id, u.username AS updated_by_username, u.full_name AS updated_by_name,
           COALESCE((SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
                     FROM payment_invoices pi
                     JOIN invoices i ON i.id = pi.invoice_id
                     WHERE pi.payment_id = p.id), '[]'::json) AS invoices
    FROM payments p
    LEFT JOIN users c ON c.id = p.created_by
    LEFT JOIN users u ON u.id = p.updated_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}
    ${noLimit ? '' : 'LIMIT 10000'}
  `;
  return { sql, params };
}

// ============================================================
// Routes
// ============================================================
export default async function paymentRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('payments', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('payments', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('payments', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('payments', 'delete')] };

  // ----- GET /payments --------------------------------------
  fastify.get('/', canViewPerm, async (request, reply) => {
    const search = typeof request.query?.q === 'string' ? request.query.q.trim() : '';

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
    const fromP = parseDateParam(request.query?.date_from, 'date_from');
    if (fromP?.error) return reply.code(400).send({ error: fromP.error });
    const toP = parseDateParam(request.query?.date_to, 'date_to');
    if (toP?.error) return reply.code(400).send({ error: toP.error });

    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    const sortParam = request.query?.sort === 'invoice'
      ? (request.query?.dir === 'desc' ? 'invoice_desc' : 'invoice_asc')
      : null;
    const { sql, params } = buildListQuery({
      search,
      dateFrom: fromP?.value || '',
      dateTo:   toP?.value   || '',
    }, isExport, sortParam);
    const { rows } = await query(sql, params);

    const { sql: sumSql, params: sumParams } = buildSumQuery({
      search: typeof request.query?.q === 'string' ? request.query.q.trim() : '',
      dateFrom: fromP?.value || '',
      dateTo:   toP?.value   || '',
    });
    const { rows: sumRows } = await query(sumSql, sumParams);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { payments: rows, summary };
  });

  // ----- POST /payments -------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const data = parsed.data;
    const err = validateConsistency(data);
    if (err) return reply.code(400).send({ error: err });

    await assertInvoicesExist(data.invoice_ids);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO payments
           (payment_date, sub_entity, category3, amount, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$5)
         RETURNING id`,
        [data.payment_date, data.sub_entity, data.category3 ?? null, data.amount, request.user.id]
      );
      const id = rows[0].id;
      await replaceInvoicePivot(client, id, data.invoice_ids);
      await client.query('COMMIT');
      reply.code(201).send({ id });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally     { client.release(); }
  });

  // ----- PUT /payments/:id ----------------------------------
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });

    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const data = parsed.data;
    const cErr = validateConsistency(data);
    if (cErr) return reply.code(400).send({ error: cErr });

    await assertInvoicesExist(data.invoice_ids);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE payments SET
           payment_date = $1, sub_entity = $2, category3 = $3,
           amount = $4, updated_by = $5
         WHERE id = $6`,
        [data.payment_date, data.sub_entity, data.category3 ?? null,
         data.amount, request.user.id, id]
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Payment tidak ditemukan.' });
      }
      await replaceInvoicePivot(client, id, data.invoice_ids);
      await client.query('COMMIT');
      return { id };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally     { client.release(); }
  });

  // ----- DELETE /payments/:id -------------------------------
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'payments',
      label: 'Payment',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rowCount } = await query(`DELETE FROM payments WHERE id = $1`, [id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Payment tidak ditemukan.' });
    return { success: true };
  });
}
