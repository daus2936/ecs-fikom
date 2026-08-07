import { z } from 'zod';
import { pool, query } from '../config/db.js';
import {
  SUB_ENTITIES,
  CATEGORY3,
  CLIENT_SUB_ENTITY_CODES,
} from '../constants/expense.js';

// ============================================================
// 7 field nominal — urutan stabil supaya match template Excel.
// ============================================================
export const NUMERIC_FIELDS = [
  ['total_biaya',     'Total Biaya'],
  ['fee',             'Fee'],
  ['sub_total_1',     'SUB TOTAL 1'],
  ['ppn',             'PPN'],
  ['sub_total_2',     'SUB TOTAL 2'],
  ['pph_23_2_persen', 'PPH 23 2%'],
  ['total',           'TOTAL'],
];
const NUMERIC_KEYS = NUMERIC_FIELDS.map(([k]) => k);

// ============================================================
// Schema
// ============================================================
const numericField = z.union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((v) => Number.isFinite(v) && v >= 0, 'Nilai harus angka >= 0');

const baseShape = {
  submit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid (format YYYY-MM-DD)'),
  sub_entity:  z.string().refine((v) => CLIENT_SUB_ENTITY_CODES.includes(v), 'Client tidak valid'),
  category3:   z.string().refine((v) => v in CATEGORY3, 'Kategori 3 tidak valid').nullable().optional(),
  nomor_faktur_pajak:  z.string().trim().min(1, 'Nomor Faktur Pajak wajib diisi').max(50, 'Nomor Faktur Pajak maks 50 karakter'),
  purchase_order_ids:  z.array(z.number().int().positive()).min(1, 'Minimal 1 nomor PO harus dipilih'),
  invoice_ids:         z.array(z.number().int().positive()).default([]),
};
for (const k of NUMERIC_KEYS) baseShape[k] = numericField;
const baseSchema = z.object(baseShape);

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
async function replacePivot(client, table, fkColumn, parentId, ids) {
  await client.query(`DELETE FROM ${table} WHERE icb_id = $1`, [parentId]);
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO ${table} (icb_id, ${fkColumn}) VALUES ${placeholders}`,
    [parentId, ...ids]
  );
}

async function assertIdsExist(table, ids, label) {
  if (ids.length === 0) return;
  const { rows } = await query(`SELECT id FROM ${table} WHERE id = ANY($1::int[])`, [ids]);
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((r) => r.id));
    const missing = ids.filter((id) => !found.has(id));
    const err = new Error(`${label} tidak ditemukan: ID ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
}

// ============================================================
// List query
// ============================================================
// ------------------------------------------------------------
// Filter MULTI-SELECT:
//   - subEntities      : array kode client
//   - category3        : array kode kategori3
//   - nomorFaktur      : array Nomor Faktur Pajak (exact match)
//   - poIds            : array id PO
//   - invoiceIds       : array id invoice
//   - dateFrom/dateTo  : range submit_date
// Antar-filter = AND, dalam satu filter = OR (ANY).
// ------------------------------------------------------------
function buildWhereMulti({ subEntities, category3, nomorFaktur, poIds, invoiceIds, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  if (Array.isArray(subEntities) && subEntities.length > 0) {
    params.push(subEntities);
    where.push(`c.sub_entity = ANY($${params.length}::text[])`);
  }
  if (Array.isArray(category3) && category3.length > 0) {
    params.push(category3);
    where.push(`c.category3 = ANY($${params.length}::text[])`);
  }
  if (Array.isArray(nomorFaktur) && nomorFaktur.length > 0) {
    params.push(nomorFaktur);
    where.push(`c.nomor_faktur_pajak = ANY($${params.length}::text[])`);
  }
  if (Array.isArray(poIds) && poIds.length > 0) {
    params.push(poIds);
    where.push(`EXISTS (SELECT 1 FROM icb2025_purchase_orders icpo
                WHERE icpo.icb_id = c.id AND icpo.purchase_order_id = ANY($${params.length}::int[]))`);
  }
  if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
    params.push(invoiceIds);
    where.push(`EXISTS (SELECT 1 FROM icb2025_invoices ici
                WHERE ici.icb_id = c.id AND ici.invoice_id = ANY($${params.length}::int[]))`);
  }
  if (dateFrom) { params.push(dateFrom); where.push(`c.submit_date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo);   where.push(`c.submit_date <= $${params.length}`); }

  return { where, params };
}

// SUM semua kolom numeric (total nilai cover), tanpa LIMIT, ikut filter.
function buildSumQuery(filters) {
  const { where, params } = buildWhereMulti(filters);
  const sumExpr = NUMERIC_KEYS.map((k) => `COALESCE(SUM(c.${k}),0)`).join(' + ');
  const sql = `
    SELECT (${sumExpr}) AS total_amount, COUNT(*) AS cnt
    FROM invoice_cover_before_2025 c
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;
  return { sql, params };
}

function buildListQuery(filters) {
  const { where, params } = buildWhereMulti(filters);
  const numericCols = NUMERIC_KEYS.map((k) => `c.${k}`).join(', ');
  const sql = `
    SELECT c.id, c.submit_date, c.sub_entity, c.category3, c.nomor_faktur_pajak,
           ${numericCols},
           c.created_at, c.updated_at,
           u.id AS created_by_id, u.username AS created_by_username, u.full_name AS created_by_name,
           e.id AS updated_by_id, e.username AS updated_by_username, e.full_name AS updated_by_name,
           COALESCE((SELECT json_agg(json_build_object('id', po.id, 'po_number', po.po_number) ORDER BY po.po_number)
                     FROM icb2025_purchase_orders icpo
                     JOIN purchase_orders po ON po.id = icpo.purchase_order_id
                     WHERE icpo.icb_id = c.id), '[]'::json) AS purchase_orders,
           COALESCE((SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
                     FROM icb2025_invoices ici
                     JOIN invoices i ON i.id = ici.invoice_id
                     WHERE ici.icb_id = c.id), '[]'::json) AS invoices
    FROM invoice_cover_before_2025 c
    LEFT JOIN users u ON u.id = c.created_by
    LEFT JOIN users e ON e.id = c.updated_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY c.submit_date DESC, c.created_at DESC
    LIMIT 500
  `;
  return { sql, params };
}

// ============================================================
// INSERT one row inside a tx
// ============================================================
async function insertOne(client, data, userId) {
  const numericValues = NUMERIC_KEYS.map((k) => data[k]);
  const colList = NUMERIC_KEYS.join(', ');
  // 6 fixed cols (submit_date, sub_entity, cat3, nomor_faktur_pajak, created_by, updated_by) + 7 numeric.
  // updated_by = created_by saat insert ($5 dipakai 2x).
  const placeholders = ['$1', '$2', '$3', '$4', '$5', '$5',
    ...NUMERIC_KEYS.map((_, i) => `$${i + 6}`)].join(', ');

  const { rows } = await client.query(
    `INSERT INTO invoice_cover_before_2025
       (submit_date, sub_entity, category3, nomor_faktur_pajak, created_by, updated_by, ${colList})
     VALUES (${placeholders})
     RETURNING id`,
    [data.submit_date, data.sub_entity, data.category3 ?? null, data.nomor_faktur_pajak, userId, ...numericValues]
  );
  const id = rows[0].id;
  await replacePivot(client, 'icb2025_purchase_orders', 'purchase_order_id', id, data.purchase_order_ids);
  await replacePivot(client, 'icb2025_invoices',        'invoice_id',        id, data.invoice_ids);
  return id;
}

// ============================================================
// Routes
// ============================================================
export default async function invoiceCoverBefore2025Routes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-cover-before-2025', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-cover-before-2025', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-cover-before-2025', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-cover-before-2025', 'delete')] };

  // ----- GET /invoice-covers --------------------------------
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

    const filters = {
      subEntities: parseArrayParam(request.query?.sub_entities),
      category3:   parseArrayParam(request.query?.category3),
      nomorFaktur: parseArrayParam(request.query?.nomor_faktur_pajak),
      poIds:       parseIntArrayParam(request.query?.po_ids),
      invoiceIds:  parseIntArrayParam(request.query?.invoice_ids),
      dateFrom:    fromP?.value || '',
      dateTo:      toP?.value   || '',
    };

    const { sql, params } = buildListQuery(filters);
    const { rows } = await query(sql, params);

    const { sql: sumSql, params: sumParams } = buildSumQuery(filters);
    const { rows: sumRows } = await query(sumSql, sumParams);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { invoice_cover_before_2025: rows, summary };
  });

  // ----- GET /invoice-covers/faktur-pajak-options -----------
  // Daftar Nomor Faktur Pajak unik (untuk opsi filter multi-select).
  fastify.get('/faktur-pajak-options', canViewPerm, async () => {
    const { rows } = await query(
      `SELECT DISTINCT nomor_faktur_pajak
       FROM invoice_cover_before_2025
       WHERE nomor_faktur_pajak IS NOT NULL AND nomor_faktur_pajak <> ''
       ORDER BY nomor_faktur_pajak`
    );
    return { faktur_pajak: rows.map((r) => r.nomor_faktur_pajak) };
  });

  // ----- POST /invoice-covers -------------------------------
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
      const id = await insertOne(client, data, request.user.id);
      await client.query('COMMIT');
      reply.code(201).send({ id });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally     { client.release(); }
  });

  // ----- PUT /invoice-covers/:id ----------------------------
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });

    const parsed = baseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.errors[0].message });
    const data = parsed.data;
    const cErr = validateConsistency(data);
    if (cErr) return reply.code(400).send({ error: cErr });

    await assertIdsExist('purchase_orders', data.purchase_order_ids, 'PO');
    await assertIdsExist('invoices',        data.invoice_ids,        'Invoice');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const setCols = [
        'submit_date = $1', 'sub_entity = $2', 'category3 = $3', 'nomor_faktur_pajak = $4',
        ...NUMERIC_KEYS.map((k, i) => `${k} = $${i + 5}`),
        `updated_by = $${5 + NUMERIC_KEYS.length}`,
      ].join(', ');
      const params = [
        data.submit_date, data.sub_entity, data.category3 ?? null, data.nomor_faktur_pajak,
        ...NUMERIC_KEYS.map((k) => data[k]),
        request.user.id,
        id,
      ];
      const idIdx = params.length;
      const { rowCount } = await client.query(
        `UPDATE invoice_cover_before_2025 SET ${setCols} WHERE id = $${idIdx}`,
        params
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Invoice Cover tidak ditemukan.' });
      }
      await replacePivot(client, 'icb2025_purchase_orders', 'purchase_order_id', id, data.purchase_order_ids);
      await replacePivot(client, 'icb2025_invoices',        'invoice_id',        id, data.invoice_ids);
      await client.query('COMMIT');
      return { id };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally     { client.release(); }
  });

  // ----- DELETE /invoice-covers/:id -------------------------
  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rowCount } = await query(`DELETE FROM invoice_cover_before_2025 WHERE id = $1`, [id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Invoice Cover tidak ditemukan.' });
    return { success: true };
  });

  // ============================================================
  // POST /invoice-covers/import
  // ============================================================
  fastify.post('/import', canCreate, async (request, reply) => {
    const body = request.body;
    if (!body || !Array.isArray(body.rows)) {
      return reply.code(400).send({ error: 'Payload tidak valid: field "rows" harus array.' });
    }
    if (body.rows.length === 0) {
      return reply.code(400).send({ error: 'Tidak ada data untuk di-import.' });
    }
    if (body.rows.length > 5000) {
      return reply.code(400).send({ error: 'Maksimal 5000 baris per import.' });
    }

    const errors = [];
    const prepared = [];

    // Pra-resolve PO & Invoice numbers → IDs (efisien dalam 2 query)
    const allPoNums  = [...new Set(body.rows.flatMap((r) => r.po_numbers      || []))].filter(Boolean);
    const allInvNums = [...new Set(body.rows.flatMap((r) => r.invoice_numbers || []))].filter(Boolean);
    let poMap = new Map(), invMap = new Map();
    if (allPoNums.length > 0) {
      const { rows } = await query(
        `SELECT id, po_number FROM purchase_orders WHERE po_number = ANY($1::text[])`,
        [allPoNums]
      );
      poMap = new Map(rows.map((r) => [r.po_number, r.id]));
    }
    if (allInvNums.length > 0) {
      const { rows } = await query(
        `SELECT id, invoice_number FROM invoices WHERE invoice_number = ANY($1::text[])`,
        [allInvNums]
      );
      invMap = new Map(rows.map((r) => [r.invoice_number, r.id]));
    }

    body.rows.forEach((row, idx) => {
      const rowNum = idx + 1;
      const poNumbers  = (row.po_numbers      || []).map(String).map((s) => s.trim()).filter(Boolean);
      const invNumbers = (row.invoice_numbers || []).map(String).map((s) => s.trim()).filter(Boolean);

      const poIds = [];
      for (const n of poNumbers) {
        const id = poMap.get(n);
        if (!id) { errors.push(`Baris ${rowNum}: Nomor PO "${n}" tidak ditemukan.`); return; }
        poIds.push(id);
      }
      const invIds = [];
      for (const n of invNumbers) {
        const id = invMap.get(n);
        if (!id) { errors.push(`Baris ${rowNum}: Nomor Invoice "${n}" tidak ditemukan.`); return; }
        invIds.push(id);
      }

      const candidate = {
        submit_date: row.submit_date,
        sub_entity:  row.sub_entity,
        category3:   row.category3 || null,
        nomor_faktur_pajak: row.nomor_faktur_pajak || '',
        purchase_order_ids: poIds,
        invoice_ids:        invIds,
      };
      for (const k of NUMERIC_KEYS) candidate[k] = row[k];

      const parsed = baseSchema.safeParse(candidate);
      if (!parsed.success) {
        errors.push(`Baris ${rowNum}: ${parsed.error.errors[0].message}`);
        return;
      }
      const cErr = validateConsistency(parsed.data);
      if (cErr) {
        errors.push(`Baris ${rowNum}: ${cErr}`);
        return;
      }
      prepared.push(parsed.data);
    });

    if (errors.length > 0) {
      return reply.code(400).send({
        error: `Import ditolak karena ada ${errors.length} kesalahan.`,
        details: errors.slice(0, 50),
      });
    }

    const client = await pool.connect();
    const ids = [];
    try {
      await client.query('BEGIN');
      for (const data of prepared) ids.push(await insertOne(client, data, request.user.id));
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return reply.code(201).send({ imported: ids.length, ids });
  });
}
