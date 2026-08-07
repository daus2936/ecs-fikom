import { query } from '../config/db.js';
import { CLIENT_SUB_ENTITY_CODES } from '../constants/expense.js';

// ============================================================
// Validasi tanggal YYYY-MM-DD + kalender riil
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
// SQL fragments — sama dgn GP1 (duplikasi sengaja, tiap modul
// punya kontrol penuh atas query-nya).
// ============================================================
const COVER_SELECT_HEAD = `
  SELECT
    ic.id, ic.submit_date, ic.sub_entity, ic.category3, ic.total,
    COALESCE(
      (SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
       FROM invoice_cover_invoices ici
       JOIN invoices i ON i.id = ici.invoice_id
       WHERE ici.invoice_cover_id = ic.id),
      '[]'::json
    ) AS invoices,
    COALESCE(
      (SELECT json_agg(json_build_object('id', po.id, 'po_number', po.po_number) ORDER BY po.po_number)
       FROM invoice_cover_purchase_orders icpo
       JOIN purchase_orders po ON po.id = icpo.purchase_order_id
       WHERE icpo.invoice_cover_id = ic.id),
      '[]'::json
    ) AS purchase_orders
  FROM invoice_covers ic
`;
const COVER_SELECT_TAIL = ` ORDER BY ic.submit_date DESC, ic.id DESC`;

// ============================================================
// Chain: Invoice Cover → Payment → Expense
// ============================================================
async function calculateGP2FromCovers(covers) {
  // I_cover = invoice IDs yang dirujuk Invoice Cover
  const coverInvoiceIdSet = new Set();
  for (const c of covers) for (const inv of c.invoices) coverInvoiceIdSet.add(inv.id);
  const coverInvoiceIds = [...coverInvoiceIdSet];

  // Step 2: cari Payment yang invoice-nya overlap dgn I_cover
  let payments = [];
  if (coverInvoiceIds.length > 0) {
    const payRes = await query(
      `
      SELECT
        p.id, p.payment_date, p.sub_entity, p.category3, p.amount,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
           FROM payment_invoices pi
           JOIN invoices i ON i.id = pi.invoice_id
           WHERE pi.payment_id = p.id),
          '[]'::json
        ) AS invoices
      FROM payments p
      WHERE EXISTS (
        SELECT 1 FROM payment_invoices pi
        WHERE pi.payment_id = p.id
          AND pi.invoice_id = ANY($1::int[])
      )
      ORDER BY p.payment_date DESC, p.id DESC
      `,
      [coverInvoiceIds]
    );
    payments = payRes.rows;
  }

  // I_payment = semua invoice yang dirujuk Payment di set ini.
  // PENTING: I_payment bisa LEBIH LUAS dari I_cover, karena 1 Payment
  // bisa merujuk invoice di luar Invoice Cover (P jadi terpilih karena
  // overlap di 1 invoice, tapi pivot-nya bawa invoice lain juga).
  const paymentInvoiceIdSet = new Set();
  for (const p of payments) for (const inv of p.invoices) paymentInvoiceIdSet.add(inv.id);
  const paymentInvoiceIds = [...paymentInvoiceIdSet];

  // Step 3: cari Expense yang invoice-nya overlap dgn I_payment
  let expenses = [];
  if (paymentInvoiceIds.length > 0) {
    const expRes = await query(
      `
      SELECT
        e.id, e.occurred_date, e.sub_entity, e.category1, e.amount, e.notes,
        COALESCE(
          (SELECT json_agg(json_build_object('id', i.id, 'invoice_number', i.invoice_number) ORDER BY i.invoice_number)
           FROM expense_invoices ei
           JOIN invoices i ON i.id = ei.invoice_id
           WHERE ei.expense_id = e.id),
          '[]'::json
        ) AS invoices
      FROM expenses e
      WHERE EXISTS (
        SELECT 1 FROM expense_invoices ei
        WHERE ei.expense_id = e.id
          AND ei.invoice_id = ANY($1::int[])
      )
      ORDER BY e.occurred_date DESC, e.id DESC
      `,
      [paymentInvoiceIds]
    );
    expenses = expRes.rows;
  }

  // Unpaid: invoice di I_cover yang BELUM ada baris Payment yang merujuk
  let unpaidInvoices = [];
  if (coverInvoiceIds.length > 0) {
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
      [coverInvoiceIds]
    );
    unpaidInvoices = unpaidRes.rows;
  }

  const paymentTotal = payments.reduce((s, p) => s + Number(p.amount), 0);
  const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const gp2          = paymentTotal - expenseTotal;
  const gp2Pct       = paymentTotal > 0 ? gp2 / paymentTotal : null;

  return {
    totals: {
      payment_total:          paymentTotal,
      expense_total:          expenseTotal,
      gross_profit_2:         gp2,
      gross_profit_2_percent: gp2Pct,
    },
    invoice_covers: covers,
    payments,
    expenses,
    unpaid_invoices: unpaidInvoices,
  };
}

// ============================================================
// Routes
// ============================================================
export default async function grossProfit2Routes(fastify) {
  const authOnly = { preHandler: [fastify.authenticate] };
  const canView = { preHandler: [fastify.authenticate, fastify.requirePermission('gross-profit-2', 'view')] };

  // ----- POST /gross-profit-2/calculate (period mode) -------
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

    const result = await calculateGP2FromCovers(coversRes.rows);
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

  // ----- POST /gross-profit-2/calculate-by-invoice ----------
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
          SELECT 1 FROM invoice_cover_invoices ici
          WHERE ici.invoice_cover_id = ic.id
            AND ici.invoice_id = ANY($1::int[])
        ) ` +
      COVER_SELECT_TAIL,
      [uniqIds]
    );

    const result = await calculateGP2FromCovers(coversRes.rows);
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
