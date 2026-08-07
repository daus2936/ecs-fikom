import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';
import {
  SUB_ENTITIES,
  CATEGORY1,
  CATEGORY3,
  isSubEntityValidFor,
  isCategory1ValidFor,
  isCategory3Applicable,
  deriveParentCompany,
} from '../constants/expense.js';

// ============================================================
// Generate expense_code unik: EXP-DDMMYY-NNNN
// Format: tanggal INPUT (hari ini, WIB) + counter 4 digit reset tiap hari.
//   Contoh: input tanggal 29 Mei 2026 → EXP-290526-0001, EXP-290526-0002, ...
//   Besok counter mulai lagi dari 0001.
//
// Strategi aman race-condition:
//   - Advisory lock per-hari supaya generate paralel antri rapi.
//   - UNIQUE constraint sebagai pengaman tambahan.
//
// Dipakai DI DALAM transaction (pakai client, bukan pool).
// ============================================================
function todayDDMMYYJakarta() {
  // Ambil komponen tanggal di zona Asia/Jakarta (WIB), bukan UTC server.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).formatToParts(new Date());
  const dd = parts.find((p) => p.type === 'day').value;
  const mm = parts.find((p) => p.type === 'month').value;
  const yy = parts.find((p) => p.type === 'year').value;
  return `${dd}${mm}${yy}`; // DDMMYY
}

async function generateExpenseCode(client) {
  const ddmmyy = todayDDMMYYJakarta();
  const prefix = `EXP-${ddmmyy}-`;

  // Advisory lock per-hari (key berbasis prefix tanggal).
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`expense_code:${ddmmyy}`]);

  // Cari counter tertinggi untuk prefix hari ini.
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(
       (regexp_replace(expense_code, '^EXP-\\d{6}-', ''))::int
     ), 0) AS max_n
     FROM expenses
     WHERE expense_code LIKE $1`,
    [`${prefix}%`]
  );
  const next = (rows[0]?.max_n || 0) + 1;
  if (next > 9999) {
    throw new Error(`Counter expense_code untuk tanggal ${ddmmyy} melebihi 9999. Hubungi admin.`);
  }
  return `${prefix}${String(next).padStart(4, '0')}`;
}

// ============================================================
// Schemas
// ============================================================
// Catatan: parent_company TIDAK lagi diterima dari client.
// Backend derive dari sub_entity supaya tidak bisa di-bypass.
const baseSchema = z.object({
  occurred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid (format YYYY-MM-DD)'),

  expense_type: z.enum(['client', 'non_client']),
  sub_entity:   z.string().refine((v) => v in SUB_ENTITIES, 'Pilihan client/non-client tidak valid'),

  category1: z.string().refine((v) => v in CATEGORY1, 'Kategori 1 tidak valid'),
  category3: z.string().refine((v) => v in CATEGORY3, 'Kategori 3 tidak valid').nullable().optional(),

  // Nominal: bisa kirim sebagai string ("1500000") atau number
  amount: z.union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, 'Nominal tidak valid'),

  notes: z.string().max(2000).optional().nullable().transform((v) => v ?? null),

  purchase_order_ids: z.array(z.number().int().positive()).default([]),
  invoice_ids: z.array(z.number().int().positive()).default([]),
});

/**
 * Validasi cross-field setelah parsing dasar.
 * Selain validasi, juga MENGISI data.parent_company hasil derive.
 * Return null kalau valid, string error kalau ada masalah.
 */
function validateConsistency(data) {
  // sub_entity harus cocok dgn expense_type
  if (!isSubEntityValidFor(data.sub_entity, data.expense_type)) {
    return 'Pilihan client/non-client tidak cocok dengan tipe.';
  }

  // Derive parent_company dari sub_entity (BIERSDORF→KBSI, lainnya sesuai mapping)
  data.parent_company = deriveParentCompany(data.sub_entity);
  if (!data.parent_company) {
    return 'Tidak dapat menentukan parent company.';
  }

  // category1 harus berlaku untuk expense_type yang dipilih
  if (!isCategory1ValidFor(data.category1, data.expense_type)) {
    const typeLabel = data.expense_type === 'non_client' ? 'Non-Client' : 'Client';
    const cat1Label = CATEGORY1[data.category1] || data.category1;
    return `Kategori "${cat1Label}" tidak berlaku untuk tipe ${typeLabel}.`;
  }

  // category3: hanya kalau sub_entity = BIERSDORF.
  // Khusus untuk Gaji + Biersdorf: wajib.
  // Lainnya di Biersdorf: opsional.
  if (data.category3 && !isCategory3Applicable(data.sub_entity)) {
    return 'Kategori 3 hanya berlaku untuk PT Biersdorf Indonesia.';
  }
  if (data.category1 === 'gaji'
      && isCategory3Applicable(data.sub_entity)
      && !data.category3) {
    return 'Kategori 3 (NMA/BMC/KPL/OTHERS) wajib diisi untuk Gaji di Biersdorf.';
  }

  // PO & Invoice references: hanya untuk client.
  // - client     : minimal 1 PO wajib (invoice opsional)
  // - non_client : PO & invoice harus kosong (di-clear paksa biar data konsisten)
  if (data.expense_type === 'client') {
    if (data.purchase_order_ids.length === 0) {
      return 'Minimal 1 nomor PO harus dipilih.';
    }
  } else {
    data.purchase_order_ids = [];
    data.invoice_ids = [];
  }

  return null;
}

// ============================================================
// Helpers untuk replace many-to-many (dipakai create & update)
// ============================================================
async function replacePivot(client, table, fkColumn, expenseId, ids) {
  await client.query(`DELETE FROM ${table} WHERE expense_id = $1`, [expenseId]);
  if (ids.length === 0) return;

  // Build VALUES ($1,$2),($1,$3),...
  const placeholders = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
  const params = [expenseId, ...ids];
  await client.query(
    `INSERT INTO ${table} (expense_id, ${fkColumn}) VALUES ${placeholders}`,
    params
  );
}

// Validasi: pastikan semua ID yang dikirim memang ada di DB
async function assertIdsExist(table, ids, label) {
  if (ids.length === 0) return;
  const { rows } = await query(
    `SELECT id FROM ${table} WHERE id = ANY($1::int[])`,
    [ids]
  );
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    const err = new Error(`${label} tidak ditemukan: ID ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

// ============================================================
// SELECT query — dipakai list & get-one. WHERE clause dinamis.
// ============================================================
// Filter:
//   - subEntities : array kode sub_entity (OR antar nilai)
//   - poIds       : array id PO (expense yang punya salah satu PO ini)
//   - invoiceIds  : array id invoice
//   - category1   : array kode kategori1
//   - category3   : array kode kategori3
//   - dateFrom/dateTo : range occurred_date
// Antar-filter = AND (mempersempit). Dalam satu filter = OR.
function buildWhere({ subEntities, poIds, invoiceIds, category1, category3, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  if (Array.isArray(subEntities) && subEntities.length > 0) {
    params.push(subEntities);
    where.push(`e.sub_entity = ANY($${params.length}::text[])`);
  }

  if (Array.isArray(category1) && category1.length > 0) {
    params.push(category1);
    where.push(`e.category1 = ANY($${params.length}::text[])`);
  }

  if (Array.isArray(category3) && category3.length > 0) {
    params.push(category3);
    where.push(`e.category3 = ANY($${params.length}::text[])`);
  }

  if (Array.isArray(poIds) && poIds.length > 0) {
    params.push(poIds);
    where.push(`EXISTS (
      SELECT 1 FROM expense_purchase_orders epo
      WHERE epo.expense_id = e.id AND epo.purchase_order_id = ANY($${params.length}::int[])
    )`);
  }

  if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
    params.push(invoiceIds);
    where.push(`EXISTS (
      SELECT 1 FROM expense_invoices ei
      WHERE ei.expense_id = e.id AND ei.invoice_id = ANY($${params.length}::int[])
    )`);
  }

  // Date range filter (inclusive). occurred_date = DATE.
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`e.occurred_date >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`e.occurred_date <= $${params.length}`);
  }

  return { where, params };
}

// Query SUM nominal — tanpa LIMIT, ikut filter yang sama.
function buildSumQuery(filters) {
  const { where, params } = buildWhere(filters);
  const sql = `
    SELECT COALESCE(SUM(e.amount), 0) AS total_amount, COUNT(*) AS cnt
    FROM expenses e
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;
  return { sql, params };
}

function buildListQuery(filters, noLimit = false, sort = null) {
  const { where, params } = buildWhere(filters);
  // Sorting: default tanggal. Kalau sort invoice → urut MIN(invoice_number) per baris.
  let orderBy = 'e.occurred_date DESC, e.created_at DESC';
  if (sort === 'invoice_asc' || sort === 'invoice_desc') {
    const dir = sort === 'invoice_desc' ? 'DESC' : 'ASC';
    orderBy = `(SELECT MIN(i.invoice_number) FROM expense_invoices ei
                JOIN invoices i ON i.id = ei.invoice_id
                WHERE ei.expense_id = e.id) ${dir} NULLS LAST, e.created_at DESC`;
  }
  const sql = `
    SELECT
      e.id, e.expense_code, e.occurred_date,
      e.expense_type, e.parent_company, e.sub_entity,
      e.category1, e.category3,
      e.amount, e.notes,
      e.created_at, e.updated_at,
      c.id        AS created_by_id,
      c.username  AS created_by_username,
      c.full_name AS created_by_name,
      u.id        AS updated_by_id,
      u.username  AS updated_by_username,
      u.full_name AS updated_by_name,
      COALESCE(
        (SELECT json_agg(json_build_object('id', po.id, 'po_number', po.po_number) ORDER BY po.po_number)
         FROM expense_purchase_orders epo
         JOIN purchase_orders po ON po.id = epo.purchase_order_id
         WHERE epo.expense_id = e.id),
        '[]'::json
      ) AS purchase_orders,
      COALESCE(
        (SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
         FROM expense_invoices ei
         JOIN invoices i ON i.id = ei.invoice_id
         WHERE ei.expense_id = e.id),
        '[]'::json
      ) AS invoices
    FROM expenses e
    LEFT JOIN users c ON c.id = e.created_by
    LEFT JOIN users u ON u.id = e.updated_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}
    ${noLimit ? '' : 'LIMIT 10000'}
  `;
  return { sql, params };
}

// ============================================================
// Routes
// ============================================================
export default async function expenseRoutes(fastify) {
  const authOnly = { preHandler: [fastify.authenticate] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('expenses', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('expenses', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('expenses', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('expenses', 'delete')] };

  // ----- GET /expenses --------------------------------------
  // Query params:
  //   q          - search bebas (PO/Invoice/nama client)
  //   date_from  - YYYY-MM-DD, occurred_date >= ini (inclusive)
  //   date_to    - YYYY-MM-DD, occurred_date <= ini (inclusive)
  fastify.get('/', canViewPerm, async (request, reply) => {
    // Validasi: format YYYY-MM-DD + tanggal kalender yang riil (mis. 2026-02-30 ditolak)
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

    const dateFrom = fromP?.value || '';
    const dateTo   = toP?.value   || '';

    // Parse filter multiple-select. Frontend kirim sebagai query array
    // (mis. ?sub_entities=BIERSDORF&sub_entities=WINGS) atau comma-separated.
    function parseArrayParam(v) {
      if (v === undefined || v === null || v === '') return [];
      const arr = Array.isArray(v) ? v : String(v).split(',');
      return arr.map((s) => String(s).trim()).filter(Boolean);
    }
    function parseIntArrayParam(v) {
      return parseArrayParam(v).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    }

    const subEntities = parseArrayParam(request.query?.sub_entities);
    const category1   = parseArrayParam(request.query?.category1);
    const category3   = parseArrayParam(request.query?.category3);
    const poIds       = parseIntArrayParam(request.query?.po_ids);
    const invoiceIds  = parseIntArrayParam(request.query?.invoice_ids);

    const filters = { subEntities, poIds, invoiceIds, category1, category3, dateFrom, dateTo };

    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    const sortParam = request.query?.sort === 'invoice'
      ? (request.query?.dir === 'desc' ? 'invoice_desc' : 'invoice_asc')
      : null;
    const { sql, params } = buildListQuery(filters, isExport, sortParam);
    const { rows } = await query(sql, params);

    // Hitung total nominal dari SELURUH data yang cocok filter (tanpa LIMIT).
    const { sql: sumSql, params: sumParams } = buildSumQuery(filters);
    const { rows: sumRows } = await query(sumSql, sumParams);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { expenses: rows, summary };
  });

  // ----- GET /expenses/:id ----------------------------------
  fastify.get('/:id', authOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }
    const { rows } = await query(`
      SELECT
        e.*,
        c.username AS created_by_username, c.full_name AS created_by_name,
        u.username AS updated_by_username, u.full_name AS updated_by_name,
        COALESCE((SELECT json_agg(json_build_object('id', po.id, 'po_number', po.po_number) ORDER BY po.po_number)
                  FROM expense_purchase_orders epo
                  JOIN purchase_orders po ON po.id = epo.purchase_order_id
                  WHERE epo.expense_id = e.id), '[]'::json) AS purchase_orders,
        COALESCE((SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
                  FROM expense_invoices ei
                  JOIN invoices i ON i.id = ei.invoice_id
                  WHERE ei.expense_id = e.id), '[]'::json) AS invoices
      FROM expenses e
      LEFT JOIN users c ON c.id = e.created_by
      LEFT JOIN users u ON u.id = e.updated_by
      WHERE e.id = $1`, [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Expense tidak ditemukan.' });
    return { expense: rows[0] };
  });

  // ----- POST /expenses -------------------------------------
  fastify.post('/', canCreate, async (request, reply) => {
    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }
    const data = parsed.data;
    const err = validateConsistency(data);
    if (err) return reply.code(400).send({ error: err });

    await assertIdsExist('purchase_orders', data.purchase_order_ids, 'PO');
    await assertIdsExist('invoices',        data.invoice_ids,        'Invoice');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const expenseCode = await generateExpenseCode(client);
      const { rows } = await client.query(
        `INSERT INTO expenses
           (expense_code, occurred_date, expense_type, parent_company, sub_entity,
            category1, category3, amount, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
         RETURNING id, expense_code`,
        [
          expenseCode,
          data.occurred_date, data.expense_type, data.parent_company, data.sub_entity,
          data.category1, data.category3 ?? null,
          data.amount, data.notes, request.user.id,
        ]
      );
      const newId = rows[0].id;
      await replacePivot(client, 'expense_purchase_orders', 'purchase_order_id', newId, data.purchase_order_ids);
      await replacePivot(client, 'expense_invoices',        'invoice_id',        newId, data.invoice_ids);
      await client.query('COMMIT');
      reply.code(201).send({ id: newId, expense_code: rows[0].expense_code });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // ----- PUT /expenses/:id ----------------------------------
  // Update penuh. Semua user yang login boleh edit.
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }
    const data = parsed.data;
    const err = validateConsistency(data);
    if (err) return reply.code(400).send({ error: err });

    await assertIdsExist('purchase_orders', data.purchase_order_ids, 'PO');
    await assertIdsExist('invoices',        data.invoice_ids,        'Invoice');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rowCount } = await client.query(
        `UPDATE expenses SET
           occurred_date  = $1,
           expense_type   = $2,
           parent_company = $3,
           sub_entity     = $4,
           category1      = $5,
           category3      = $6,
           amount         = $7,
           notes          = $8,
           updated_by     = $9
         WHERE id = $10`,
        [
          data.occurred_date, data.expense_type, data.parent_company, data.sub_entity,
          data.category1, data.category3 ?? null,
          data.amount, data.notes, request.user.id, id,
        ]
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Expense tidak ditemukan.' });
      }
      await replacePivot(client, 'expense_purchase_orders', 'purchase_order_id', id, data.purchase_order_ids);
      await replacePivot(client, 'expense_invoices',        'invoice_id',        id, data.invoice_ids);
      await client.query('COMMIT');
      return { id };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  // ----- DELETE /expenses/:id -------------------------------
  // Hanya admin & superadmin. Pivot tables (expense_purchase_orders,
  // expense_invoices) sudah ON DELETE CASCADE dari sisi expense,
  // jadi referensi otomatis ikut terhapus.
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'expenses',
      label: 'Expenses',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const { rowCount } = await query(`DELETE FROM expenses WHERE id = $1`, [id]);
    if (rowCount === 0) {
      return reply.code(404).send({ error: 'Expense tidak ditemukan.' });
    }
    return { success: true };
  });

  // ----- POST /expenses/import ------------------------------
  // Bulk import dari Excel. Body: { rows: [{...}] }.
  // Setiap row di-validate, di-lookup PO/Invoice numbers → id, lalu insert.
  // Transaksi all-or-nothing.
  fastify.post('/import', canCreate, async (request, reply) => {
    const body = request.body || {};
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      return reply.code(400).send({ error: 'Tidak ada data untuk di-import.' });
    }
    if (body.rows.length > 5000) {
      return reply.code(400).send({ error: 'Maksimal 5000 baris per import.' });
    }

    // Schema khusus import: PO & Invoice dikirim sebagai array NAMA (bukan id).
    const importSchema = z.object({
      occurred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid (format YYYY-MM-DD)'),
      expense_type:  z.enum(['client', 'non_client']),
      sub_entity:    z.string().refine((v) => v in SUB_ENTITIES, 'sub_entity tidak valid'),
      category1:     z.string().refine((v) => v in CATEGORY1, 'category1 tidak valid'),
      category3:     z.string().refine((v) => v in CATEGORY3, 'category3 tidak valid').nullable().optional(),
      amount: z.union([z.number(), z.string()])
        .transform((v) => (typeof v === 'string' ? Number(v) : v))
        .refine((v) => Number.isFinite(v) && v >= 0, 'amount tidak valid'),
      notes: z.string().max(2000).optional().nullable().transform((v) => v ?? null),
      po_numbers:      z.array(z.string()).default([]),
      invoice_numbers: z.array(z.string()).default([]),
    });

    // 1. Validate semua row dulu (fail-fast)
    const validated = [];
    for (let i = 0; i < body.rows.length; i++) {
      const parsed = importSchema.safeParse(body.rows[i]);
      if (!parsed.success) {
        return reply.code(400).send({
          error: `Baris ${i + 2}: ${parsed.error.errors[0].message}`,
        });
      }
      const data = parsed.data;
      const err = validateConsistency(data);
      if (err) {
        return reply.code(400).send({ error: `Baris ${i + 2}: ${err}` });
      }
      validated.push(data);
    }

    // 2. Lookup semua PO & Invoice numbers → id (sekali query, efisien)
    const allPoNumbers = [...new Set(validated.flatMap((r) => r.po_numbers))];
    const allInvNumbers = [...new Set(validated.flatMap((r) => r.invoice_numbers))];

    const poMap = new Map();
    if (allPoNumbers.length > 0) {
      const { rows } = await query(
        `SELECT id, po_number FROM purchase_orders WHERE po_number = ANY($1::text[])`,
        [allPoNumbers]
      );
      rows.forEach((r) => poMap.set(r.po_number, r.id));
    }
    const invMap = new Map();
    if (allInvNumbers.length > 0) {
      const { rows } = await query(
        `SELECT id, invoice_number FROM invoices WHERE invoice_number = ANY($1::text[])`,
        [allInvNumbers]
      );
      rows.forEach((r) => invMap.set(r.invoice_number, r.id));
    }

    // 3. Convert numbers → ids, fail kalau ada yang tidak ketemu
    for (let i = 0; i < validated.length; i++) {
      const r = validated[i];
      const poIds = [];
      for (const n of r.po_numbers) {
        const id = poMap.get(n);
        if (!id) return reply.code(400).send({ error: `Baris ${i + 2}: Nomor PO "${n}" tidak ditemukan di database.` });
        poIds.push(id);
      }
      const invIds = [];
      for (const n of r.invoice_numbers) {
        const id = invMap.get(n);
        if (!id) return reply.code(400).send({ error: `Baris ${i + 2}: Nomor Invoice "${n}" tidak ditemukan di database.` });
        invIds.push(id);
      }
      r._poIds = poIds;
      r._invIds = invIds;
    }

    // 4. Insert semua dalam 1 transaction (all-or-nothing)
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const ids = [];
      const codes = [];
      for (const r of validated) {
        const expenseCode = await generateExpenseCode(client);
        const { rows } = await client.query(
          `INSERT INTO expenses
             (expense_code, occurred_date, expense_type, parent_company, sub_entity,
              category1, category3, amount, notes, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
           RETURNING id, expense_code`,
          [
            expenseCode,
            r.occurred_date, r.expense_type, r.parent_company, r.sub_entity,
            r.category1, r.category3 ?? null,
            r.amount, r.notes, request.user.id,
          ]
        );
        const newId = rows[0].id;
        ids.push(newId);
        codes.push(rows[0].expense_code);
        if (r._poIds.length > 0) {
          await replacePivot(client, 'expense_purchase_orders', 'purchase_order_id', newId, r._poIds);
        }
        if (r._invIds.length > 0) {
          await replacePivot(client, 'expense_invoices', 'invoice_id', newId, r._invIds);
        }
      }
      await client.query('COMMIT');
      return reply.code(201).send({ imported: ids.length, ids, codes });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  });
}
