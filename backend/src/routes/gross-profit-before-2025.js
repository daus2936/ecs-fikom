import { query } from '../config/db.js';
import { CLIENT_SUB_ENTITY_CODES } from '../constants/expense.js';

// ============================================================
// Helper: validasi tanggal YYYY-MM-DD + kalender riil
// ============================================================
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

// ============================================================
// SQL fragments — biar tidak duplikasi di 2 endpoint.
// Klausa WHERE-nya disisipkan oleh masing-masing endpoint.
// ============================================================
const COVER_SELECT_HEAD = `
  SELECT
    ic.id, ic.submit_date, ic.sub_entity, ic.category3, ic.total,
    COALESCE(
      (SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
       FROM icb2025_invoices ici
       JOIN invoices i ON i.id = ici.invoice_id
       WHERE ici.icb_id = ic.id),
      '[]'::json
    ) AS invoices,
    COALESCE(
      (SELECT json_agg(json_build_object('id', po.id, 'po_number', po.po_number) ORDER BY po.po_number)
       FROM icb2025_purchase_orders icpo
       JOIN purchase_orders po ON po.id = icpo.purchase_order_id
       WHERE icpo.icb_id = ic.id),
      '[]'::json
    ) AS purchase_orders
  FROM invoice_cover_before_2025 ic
`;
const COVER_SELECT_TAIL = ` ORDER BY ic.submit_date DESC, ic.id DESC`;

// ============================================================
// Helper: dari set Invoice Cover yang sudah difilter,
// (1) cari Expense yg merujuk invoice yg dirujuk cover-cover itu,
// (2) hitung totals + ratio.
// Dipakai oleh 2 endpoint (period & invoice mode).
// ============================================================
async function calculateFromCovers(covers) {
  const invoiceIdSet = new Set();
  for (const c of covers) for (const inv of c.invoices) invoiceIdSet.add(inv.id);
  const invoiceIds = [...invoiceIdSet];

  let expenses = [];
  if (invoiceIds.length > 0) {
    const expRes = await query(
      `
      SELECT
        e.id, e.occurred_date, e.sub_entity, e.category1, e.amount, e.notes,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
           FROM eb2025_invoices ei
           JOIN invoices i ON i.id = ei.invoice_id
           WHERE ei.eb_id = e.id),
          '[]'::json
        ) AS invoices
      FROM expenses_before_2025 e
      WHERE EXISTS (
        SELECT 1 FROM eb2025_invoices ei
        WHERE ei.eb_id = e.id
          AND ei.invoice_id = ANY($1::int[])
      )
      ORDER BY e.occurred_date DESC, e.id DESC
      `,
      [invoiceIds]
    );
    expenses = expRes.rows;
  }

  // Step 4: cari invoice yang dirujuk Invoice Cover tapi BELUM ada di Payment.
  // "Ada di Payment" = ada minimal 1 row di payment_invoices yg refer ke invoice tsb.
  let unpaidInvoices = [];
  if (invoiceIds.length > 0) {
    const unpaidRes = await query(
      `
      SELECT i.id, i.invoice_number
      FROM invoices i
      WHERE i.id = ANY($1::int[])
        AND NOT EXISTS (
          SELECT 1 FROM payment_invoices pi
          WHERE pi.invoice_id = i.id
        )
      ORDER BY i.invoice_number
      `,
      [invoiceIds]
    );
    unpaidInvoices = unpaidRes.rows;
  }

  const invoiceCoverTotal = covers.reduce((s, c) => s + Number(c.total), 0);
  const expenseTotal      = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const grossProfit1      = invoiceCoverTotal - expenseTotal;
  const grossProfit1Pct   = invoiceCoverTotal > 0
    ? grossProfit1 / invoiceCoverTotal
    : null;

  return {
    totals: {
      invoice_cover_total:    invoiceCoverTotal,
      expense_total:          expenseTotal,
      gross_profit_1:         grossProfit1,
      gross_profit_1_percent: grossProfit1Pct,
    },
    invoice_covers: covers,
    expenses,
    unpaid_invoices: unpaidInvoices,
  };
}

// ============================================================
// Routes
// ============================================================
export default async function grossProfitBefore2025Routes(fastify) {
  const authOnly = { preHandler: [fastify.authenticate] };
  const canView = { preHandler: [fastify.authenticate, fastify.requirePermission('gross-profit-before-2025', 'view')] };

  // ============================================================
  // POST /gross-profit-1/calculate (by period)
  // Body: { clients: [...], date_from, date_to }
  // ============================================================
  fastify.post('/calculate', canView, async (request, reply) => {
    const body = request.body || {};

    const clients = body.clients;
    if (!Array.isArray(clients) || clients.length === 0) {
      return reply.code(400).send({ error: 'Pilih minimal 1 client.' });
    }
    for (const c of clients) {
      if (!CLIENT_SUB_ENTITY_CODES.includes(c)) {
        return reply.code(400).send({ error: `Client tidak valid: ${c}` });
      }
    }
    const uniqClients = [...new Set(clients)];

    const fromP = parseDateParam(body.date_from, 'date_from');
    if (!fromP || fromP.error) return reply.code(400).send({ error: fromP?.error || 'date_from wajib diisi.' });
    const toP = parseDateParam(body.date_to, 'date_to');
    if (!toP || toP.error) return reply.code(400).send({ error: toP?.error || 'date_to wajib diisi.' });
    if (fromP.value > toP.value) return reply.code(400).send({ error: 'Tanggal "dari" lebih besar dari "sampai".' });

    const coversRes = await query(
      COVER_SELECT_HEAD +
      ` WHERE ic.sub_entity = ANY($1::text[]) AND ic.submit_date >= $2 AND ic.submit_date <= $3 ` +
      COVER_SELECT_TAIL,
      [uniqClients, fromP.value, toP.value]
    );

    const result = await calculateFromCovers(coversRes.rows);
    return {
      filters: {
        mode: 'period',
        clients: uniqClients,
        date_from: fromP.value,
        date_to: toP.value,
      },
      ...result,
    };
  });

  // ============================================================
  // POST /gross-profit-1/calculate-by-invoice
  // Body: { invoice_ids: [number, number, ...] }
  // ============================================================
  fastify.post('/calculate-by-invoice', canView, async (request, reply) => {
    const body = request.body || {};

    const ids = body.invoice_ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'Pilih minimal 1 invoice.' });
    }
    for (const id of ids) {
      if (!Number.isInteger(id) || id <= 0) {
        return reply.code(400).send({ error: `Invoice ID tidak valid: ${id}` });
      }
    }
    const uniqIds = [...new Set(ids)];

    // Cek invoice ID benar ada di DB
    const { rows: existing } = await query(
      `SELECT id, invoice_number FROM invoices WHERE id = ANY($1::int[])`,
      [uniqIds]
    );
    if (existing.length !== uniqIds.length) {
      const foundIds = new Set(existing.map((r) => r.id));
      const missing = uniqIds.filter((id) => !foundIds.has(id));
      return reply.code(400).send({ error: `Invoice tidak ditemukan: ID ${missing.join(', ')}` });
    }
    const invoiceNumbers = existing
      .slice()
      .sort((a, b) => a.invoice_number.localeCompare(b.invoice_number))
      .map((r) => r.invoice_number);

    const coversRes = await query(
      COVER_SELECT_HEAD +
      ` WHERE EXISTS (
          SELECT 1 FROM icb2025_invoices ici
          WHERE ici.icb_id = ic.id
            AND ici.invoice_id = ANY($1::int[])
        ) ` +
      COVER_SELECT_TAIL,
      [uniqIds]
    );

    const result = await calculateFromCovers(coversRes.rows);
    return {
      filters: {
        mode: 'invoice',
        invoice_ids: uniqIds,
        invoice_numbers: invoiceNumbers,
      },
      ...result,
    };
  });
}
