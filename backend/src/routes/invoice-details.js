import { z } from 'zod';
import { pool, query } from '../config/db.js';
import { makeBulkDeleteHandler } from '../lib/bulk-delete.js';
import {
  SUB_ENTITIES,
  CATEGORY3,
  CATEGORY4,
  CLIENT_SUB_ENTITY_CODES,
  deriveParentCompany,
} from '../constants/expense.js';

// ============================================================
// Daftar field nominal — dipakai schema, INSERT/UPDATE, import.
// Urutan harus stabil supaya template excel sinkron.
// ============================================================
export const NUMERIC_FIELDS = [
  ['bpjs_kesehatan_perusahaan',     'BPJS Kesehatan Dari Perusahaan'],
  ['bpjs_jht_perusahaan',           'BPJS Ketenagakerjaan (JHT) Dari Perusahaan'],
  ['bpjs_jkk_perusahaan',           'BPJS Ketenagakerjaan (JKK) Dari Perusahaan'],
  ['bpjs_jkm_perusahaan',           'BPJS Ketenagakerjaan (JKM) Dari Perusahaan'],
  ['jaminan_pensiun_perusahaan',    'Jaminan Pensiun Dari Perusahaan'],
  ['gross_3',                       'Gross 3'],
  ['pph_21_sebulan',                'PPh 21 (Sebulan)'],
  ['bpjs_ketenagakerjaan_karyawan', 'BPJS Ketenagakerjaan Dari Karyawan'],
  ['bpjs_kesehatan_karyawan',       'BPJS Kesehatan Dari Karyawan'],
  ['dana_pensiun_karyawan',         'Dana Pensiun Dari Karyawan'],
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
  category4:   z.string().refine((v) => v in CATEGORY4, 'Kategori 4 tidak valid').nullable().optional(),
  purchase_order_ids: z.array(z.number().int().positive()).min(1, 'Minimal 1 nomor PO harus dipilih'),
  invoice_ids:        z.array(z.number().int().positive()).default([]),
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

  // cat4 hanya kalau cat3 = NMA, dan WAJIB kalau cat3 = NMA
  if (data.category3 === 'NMA') {
    if (!data.category4) {
      return 'Kategori 4 (NMA/TL) wajib diisi kalau Kategori 3 = NMA.';
    }
  } else if (data.category4) {
    return 'Kategori 4 (NMA/TL) hanya berlaku kalau Kategori 3 = NMA.';
  }

  return null;
}

// ============================================================
// Helpers DB
// ============================================================
async function replacePivot(client, table, fkColumn, parentId, ids) {
  await client.query(`DELETE FROM ${table} WHERE invoice_detail_id = $1`, [parentId]);
  if (ids.length === 0) return;
  const placeholders = ids.map((_, i) => `($1, $${i + 2})`).join(', ');
  await client.query(
    `INSERT INTO ${table} (invoice_detail_id, ${fkColumn}) VALUES ${placeholders}`,
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

/** Resolve PO numbers → IDs. Throw error kalau ada yg tidak ada. */
async function resolvePoNumbers(numbers) {
  if (numbers.length === 0) return [];
  const { rows } = await query(
    `SELECT id, po_number FROM purchase_orders WHERE po_number = ANY($1::text[])`,
    [numbers]
  );
  if (rows.length !== numbers.length) {
    const found = new Set(rows.map((r) => r.po_number));
    const missing = numbers.filter((n) => !found.has(n));
    throw new Error(`Nomor PO tidak ditemukan: ${missing.join(', ')}`);
  }
  return rows.map((r) => r.id);
}

async function resolveInvoiceNumbers(numbers) {
  if (numbers.length === 0) return [];
  const { rows } = await query(
    `SELECT id, invoice_number FROM invoices WHERE invoice_number = ANY($1::text[])`,
    [numbers]
  );
  if (rows.length !== numbers.length) {
    const found = new Set(rows.map((r) => r.invoice_number));
    const missing = numbers.filter((n) => !found.has(n));
    throw new Error(`Nomor Invoice tidak ditemukan: ${missing.join(', ')}`);
  }
  return rows.map((r) => r.id);
}

// ============================================================
// List query
// ============================================================
// SUM semua kolom numeric (total nilai detail), tanpa LIMIT, ikut filter.
function buildSumQuery(filters) {
  const { where, params } = buildWhereMulti(filters);
  const sumExpr = NUMERIC_KEYS.map((k) => `COALESCE(SUM(d.${k}),0)`).join(' + ');
  const sql = `
    SELECT (${sumExpr}) AS total_amount, COUNT(*) AS cnt
    FROM invoice_details d
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;
  return { sql, params };
}

// ------------------------------------------------------------
// Filter MULTI-SELECT untuk halaman "Nominal Invoice Detail".
//   - subEntities : array kode client
//   - category3   : array kode kategori3
//   - poIds       : array id PO
//   - invoiceIds  : array id invoice
//   - dateFrom/dateTo : range submit_date
// Antar-filter = AND, dalam satu filter = OR (ANY).
// ------------------------------------------------------------
function buildWhereMulti({ subEntities, category3, poIds, invoiceIds, dateFrom, dateTo }) {
  const where = [];
  const params = [];

  if (Array.isArray(subEntities) && subEntities.length > 0) {
    params.push(subEntities);
    where.push(`d.sub_entity = ANY($${params.length}::text[])`);
  }
  if (Array.isArray(category3) && category3.length > 0) {
    params.push(category3);
    where.push(`d.category3 = ANY($${params.length}::text[])`);
  }
  if (Array.isArray(poIds) && poIds.length > 0) {
    params.push(poIds);
    where.push(`EXISTS (SELECT 1 FROM invoice_detail_purchase_orders idpo
                WHERE idpo.invoice_detail_id = d.id AND idpo.purchase_order_id = ANY($${params.length}::int[]))`);
  }
  if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
    params.push(invoiceIds);
    where.push(`EXISTS (SELECT 1 FROM invoice_detail_invoices idi
                WHERE idi.invoice_detail_id = d.id AND idi.invoice_id = ANY($${params.length}::int[]))`);
  }
  if (dateFrom) { params.push(dateFrom); where.push(`d.submit_date >= $${params.length}`); }
  if (dateTo)   { params.push(dateTo);   where.push(`d.submit_date <= $${params.length}`); }

  return { where, params };
}

// Query SUM PER KOLOM (bukan dijumlah jadi satu). Mengembalikan satu baris
// dengan satu kolom per variabel nominal + count. Tanpa LIMIT.
function buildPerColumnSumQuery(filters) {
  const { where, params } = buildWhereMulti(filters);
  const cols = NUMERIC_KEYS.map((k) => `COALESCE(SUM(d.${k}),0) AS ${k}`).join(', ');
  const sql = `
    SELECT ${cols}, COUNT(*) AS cnt
    FROM invoice_details d
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `;
  return { sql, params };
}


function buildListQuery(filters, noLimit = false, sort = null) {
  const { where, params } = buildWhereMulti(filters);
  const numericCols = NUMERIC_KEYS.map((k) => `d.${k}`).join(', ');
  let orderBy = 'd.submit_date DESC, d.created_at DESC';
  if (sort === 'invoice_asc' || sort === 'invoice_desc') {
    const dir = sort === 'invoice_desc' ? 'DESC' : 'ASC';
    orderBy = `(SELECT MIN(i.invoice_number) FROM invoice_detail_invoices idi
                JOIN invoices i ON i.id = idi.invoice_id
                WHERE idi.invoice_detail_id = d.id) ${dir} NULLS LAST, d.created_at DESC`;
  }
  const sql = `
    SELECT d.id, d.submit_date, d.sub_entity, d.category3, d.category4,
           ${numericCols},
           d.created_at, d.updated_at,
           c.id AS created_by_id, c.username AS created_by_username, c.full_name AS created_by_name,
           u.id AS updated_by_id, u.username AS updated_by_username, u.full_name AS updated_by_name,
           COALESCE((SELECT json_agg(json_build_object('id', po.id, 'po_number', po.po_number) ORDER BY po.po_number)
                     FROM invoice_detail_purchase_orders idpo
                     JOIN purchase_orders po ON po.id = idpo.purchase_order_id
                     WHERE idpo.invoice_detail_id = d.id), '[]'::json) AS purchase_orders,
           COALESCE((SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
                     FROM invoice_detail_invoices idi
                     JOIN invoices i ON i.id = idi.invoice_id
                     WHERE idi.invoice_detail_id = d.id), '[]'::json) AS invoices
    FROM invoice_details d
    LEFT JOIN users c ON c.id = d.created_by
    LEFT JOIN users u ON u.id = d.updated_by
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}
    ${noLimit ? '' : 'LIMIT 10000'}
  `;
  return { sql, params };
}

// ============================================================
// INSERT one row inside an existing tx (dipakai create & import)
// ============================================================
async function insertOne(client, data, userId) {
  const numericValues = NUMERIC_KEYS.map((k) => data[k]);
  const colList = NUMERIC_KEYS.join(', ');
  // 6 fixed cols (submit_date, sub_entity, cat3, cat4, created_by, updated_by)
  // diikuti 8 numeric cols. updated_by = created_by saat insert.
  const placeholders = ['$1', '$2', '$3', '$4', '$5', '$5',
    ...NUMERIC_KEYS.map((_, i) => `$${i + 6}`)].join(', ');

  const { rows } = await client.query(
    `INSERT INTO invoice_details
       (submit_date, sub_entity, category3, category4, created_by, updated_by, ${colList})
     VALUES (${placeholders})
     RETURNING id`,
    [data.submit_date, data.sub_entity, data.category3 ?? null, data.category4 ?? null, userId,
     ...numericValues]
  );
  const id = rows[0].id;
  await replacePivot(client, 'invoice_detail_purchase_orders', 'purchase_order_id', id, data.purchase_order_ids);
  await replacePivot(client, 'invoice_detail_invoices',        'invoice_id',        id, data.invoice_ids);
  return id;
}

// ============================================================
// Routes
// ============================================================
export default async function invoiceDetailRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-details', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-details', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-details', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('invoice-details', 'delete')] };

  // ----- GET /invoice-details -------------------------------
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
      poIds:       parseIntArrayParam(request.query?.po_ids),
      invoiceIds:  parseIntArrayParam(request.query?.invoice_ids),
      dateFrom:    fromP?.value || '',
      dateTo:      toP?.value   || '',
    };

    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    const sortParam = request.query?.sort === 'invoice'
      ? (request.query?.dir === 'desc' ? 'invoice_desc' : 'invoice_asc')
      : null;
    const { sql, params } = buildListQuery(filters, isExport, sortParam);
    const { rows } = await query(sql, params);

    const { sql: sumSql, params: sumParams } = buildSumQuery(filters);
    const { rows: sumRows } = await query(sumSql, sumParams);
    const summary = {
      total_amount: Number(sumRows[0]?.total_amount || 0),
      count:        Number(sumRows[0]?.cnt || 0),
    };

    return { invoice_details: rows, summary };
  });

  // ----- GET /invoice-details/nominal-summary ---------------
  // Untuk halaman "Nominal Invoice Detail": SUM per variabel/kolom nominal,
  // dengan filter multiple (PO, Invoice, Client, Kategori 3).
  // Mengembalikan: { columns: [{ key, label, total }], count }
  fastify.get('/nominal-summary', canViewPerm, async (request, reply) => {
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
      poIds:       parseIntArrayParam(request.query?.po_ids),
      invoiceIds:  parseIntArrayParam(request.query?.invoice_ids),
      dateFrom:    fromP?.value || '',
      dateTo:      toP?.value   || '',
    };

    // category1 = pilihan variabel/kolom mana yang ingin ditampilkan.
    // Kalau kosong → tampilkan semua kolom.
    const selectedCols = parseArrayParam(request.query?.category1)
      .filter((k) => NUMERIC_KEYS.includes(k));

    const { sql, params } = buildPerColumnSumQuery(filters);
    const { rows } = await query(sql, params);
    const row = rows[0] || {};

    const allColumns = NUMERIC_FIELDS.map(([key, label]) => ({
      key,
      label,
      total: Number(row[key] || 0),
    }));

    const columns = selectedCols.length > 0
      ? allColumns.filter((c) => selectedCols.includes(c.key))
      : allColumns;

    // grand_total = jumlah dari kolom yang ditampilkan
    const grandTotal = columns.reduce((sum, c) => sum + c.total, 0);

    return {
      columns,
      count: Number(row.cnt || 0),
      grand_total: grandTotal,
    };
  });


  // ----- POST /invoice-details ------------------------------
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

  // ----- PUT /invoice-details/:id ---------------------------
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
        'submit_date = $1', 'sub_entity = $2', 'category3 = $3', 'category4 = $4',
        ...NUMERIC_KEYS.map((k, i) => `${k} = $${i + 5}`),
        `updated_by = $${5 + NUMERIC_KEYS.length}`,
      ].join(', ');
      const params = [
        data.submit_date, data.sub_entity, data.category3 ?? null, data.category4 ?? null,
        ...NUMERIC_KEYS.map((k) => data[k]),
        request.user.id,
        id,
      ];
      const idIdx = params.length;
      const { rowCount } = await client.query(
        `UPDATE invoice_details SET ${setCols} WHERE id = $${idIdx}`,
        params
      );
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return reply.code(404).send({ error: 'Invoice Detail tidak ditemukan.' });
      }
      await replacePivot(client, 'invoice_detail_purchase_orders', 'purchase_order_id', id, data.purchase_order_ids);
      await replacePivot(client, 'invoice_detail_invoices',        'invoice_id',        id, data.invoice_ids);
      await client.query('COMMIT');
      return { id };
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally     { client.release(); }
  });

  // ----- DELETE /invoice-details/:id ------------------------
  // ----- POST /bulk-delete (hapus banyak) - admin/superadmin only -----
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    makeBulkDeleteHandler({
      table: 'invoice_details',
      label: 'Invoice Detail',
    })
  );

  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rowCount } = await query(`DELETE FROM invoice_details WHERE id = $1`, [id]);
    if (rowCount === 0) return reply.code(404).send({ error: 'Invoice Detail tidak ditemukan.' });
    return { success: true };
  });

  // ============================================================
  // POST /invoice-details/import
  // ============================================================
  // Body: { rows: [{ submit_date, sub_entity, category3, category4,
  //                  po_numbers: ["..."], invoice_numbers: [...],
  //                  ...8 nominal fields }] }
  //
  // All-or-nothing transaction. Setiap row divalidasi; kalau ada error,
  // semua di-rollback, response berisi nomor row + pesan.
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
    const prepared = []; // { ...data, purchase_order_ids, invoice_ids }

    // Pra-resolve semua PO & Invoice numbers ke ID dalam 1-2 query (efisien)
    const allPoNums = [...new Set(body.rows.flatMap((r) => r.po_numbers || []))].filter(Boolean);
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

    // Validasi per row
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
        category4:   row.category4 || null,
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
        details: errors.slice(0, 50), // batasi biar response gak kepanjangan
      });
    }

    // All valid — eksekusi dalam 1 transaction
    const client = await pool.connect();
    const ids = [];
    try {
      await client.query('BEGIN');
      for (const data of prepared) {
        ids.push(await insertOne(client, data, request.user.id));
      }
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
