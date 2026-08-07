import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatIDR } from '../lib/format.js';
import { getClientOptions, subEntityLabel, cat1Label, cat3Label } from '../lib/expense-constants.js';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import { exportSheetsToExcel } from '../lib/excel-export.js';

const CLIENT_OPTIONS = getClientOptions();

// Helper format %: "12,34%" untuk display Indonesia
function formatPercent(value) {
  if (value === null || value === undefined) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return (num * 100).toLocaleString('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + '%';
}

// =====================================================
// Halaman utama
// =====================================================
export default function GrossProfit1() {
  // ---- Mode: 'period' atau 'invoice' ----
  const [mode, setMode] = useState('period');

  // ---- Input state (period mode) ----
  const [selectedClients, setSelectedClients] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ---- Input state (invoice mode) ----
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState([]);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);

  // ---- Result state ----
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Lazy load invoice options saat user pertama kali switch ke mode invoice
  useEffect(() => {
    if (mode !== 'invoice') return;
    if (invoiceOptions.length > 0 || invoiceLoading) return;
    setInvoiceLoading(true);
    api.get('/invoices')
      .then(({ data }) => {
        setInvoiceOptions(data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
      })
      .catch((err) => setError('Gagal memuat daftar invoice: ' + getErrorMessage(err)))
      .finally(() => setInvoiceLoading(false));
  }, [mode, invoiceOptions.length, invoiceLoading]);

  const switchMode = (m) => {
    setMode(m);
    setResult(null);
    setError('');
  };

  const toggleClient = (code) => {
    setSelectedClients((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };
  const selectAllClients = () => setSelectedClients(CLIENT_OPTIONS.map((o) => o.code));
  const clearClients     = () => setSelectedClients([]);

  const canCalculate = mode === 'period'
    ? selectedClients.length > 0 && dateFrom && dateTo && dateFrom <= dateTo
    : selectedInvoiceIds.length > 0;

  const calculate = async (e) => {
    e?.preventDefault?.();
    setError('');
    if (!canCalculate) return;
    setLoading(true);
    try {
      const endpoint = mode === 'period'
        ? '/gross-profit-1/calculate'
        : '/gross-profit-1/calculate-by-invoice';
      const payload = mode === 'period'
        ? { clients: selectedClients, date_from: dateFrom, date_to: dateTo }
        : { invoice_ids: selectedInvoiceIds };
      const { data } = await api.post(endpoint, payload);
      setResult(data);
    } catch (err) {
      setError(getErrorMessage(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSelectedClients([]);
    setDateFrom('');
    setDateTo('');
    setSelectedInvoiceIds([]);
    setResult(null);
    setError('');
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Gross Profit 1</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Kalkulasi Gross Profit 1 = Total Invoice Cover − Total Expense (yang merujuk ke invoice di Invoice Cover tersebut).
        </p>
      </div>

      {/* ===== INPUT FORM ===== */}
      <form onSubmit={calculate} className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
        <div className="space-y-5">
          {/* Mode tabs */}
          <div className="inline-flex bg-slate-100 p-1 rounded-lg">
            <ModeTabButton active={mode === 'period'} onClick={() => switchMode('period')}>
              Berdasarkan Periode
            </ModeTabButton>
            <ModeTabButton active={mode === 'invoice'} onClick={() => switchMode('invoice')}>
              Berdasarkan Invoice
            </ModeTabButton>
          </div>

          {mode === 'period' && <>
          {/* Client picker */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="label mb-0">
                Client <span className="text-red-500">*</span>
                <span className="text-slate-400 font-normal ml-2 text-xs">
                  ({selectedClients.length} dari {CLIENT_OPTIONS.length} dipilih)
                </span>
              </label>
              <div className="flex gap-3 text-xs">
                <button type="button" onClick={selectAllClients} className="text-brand-700 hover:underline">Pilih semua</button>
                <button type="button" onClick={clearClients} className="text-slate-500 hover:underline">Kosongkan</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {CLIENT_OPTIONS.map((o) => {
                const checked = selectedClients.includes(o.code);
                return (
                  <label
                    key={o.code}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors text-sm
                      ${checked
                        ? 'border-brand-600 bg-brand-50 text-brand-900'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleClient(o.code)}
                      className="rounded"
                    />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Date range */}
          <div>
            <label className="label">
              Periode (Tanggal Submit Invoice Cover) <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="date"
                required
                className="input max-w-[180px]"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-slate-400 text-sm">sampai</span>
              <input
                type="date"
                required
                className="input max-w-[180px]"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            {dateFrom && dateTo && dateFrom > dateTo && (
              <p className="text-xs text-amber-700 mt-2">
                Tanggal "dari" lebih besar dari "sampai".
              </p>
            )}
          </div>
          </>}

          {mode === 'invoice' && (
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <label className="label mb-0">
                  Pilih Invoice <span className="text-red-500">*</span>
                  <span className="text-slate-400 font-normal ml-2 text-xs">
                    ({selectedInvoiceIds.length} dipilih{invoiceOptions.length > 0 ? ` dari ${invoiceOptions.length}` : ''})
                  </span>
                </label>
                {selectedInvoiceIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedInvoiceIds([])}
                    className="text-xs text-slate-500 hover:underline"
                  >Kosongkan</button>
                )}
              </div>
              <MultiSearchSelect
                options={invoiceOptions}
                selected={selectedInvoiceIds}
                onChange={setSelectedInvoiceIds}
                placeholder={invoiceLoading ? 'Memuat daftar invoice…' : 'Cari nomor invoice…'}
                emptyMessage="Tidak ada invoice yang cocok."
              />
              <p className="text-xs text-slate-400 mt-2">
                Kalkulasi akan ambil semua Invoice Cover yang merujuk ke invoice yang dipilih,
                lalu kurangi dengan Expense yang merujuk ke invoice di Invoice Cover tersebut.
              </p>
            </div>
          )}

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            {result && (
              <button type="button" onClick={reset} className="btn-secondary">Reset</button>
            )}
            <button type="submit" disabled={!canCalculate || loading} className="btn-primary">
              {loading ? 'Menghitung…' : 'Hitung Gross Profit 1'}
            </button>
          </div>
        </div>
      </form>

      {/* ===== RESULT ===== */}
      {result && <ResultView data={result} />}
    </div>
  );
}

// =====================================================
// Komponen: hasil kalkulasi
// =====================================================
function exportGP1(data, subtitle) {
  const { filters, totals, invoice_covers: covers, expenses } = data;
  const periode = filters.mode === 'invoice'
    ? `Per Invoice: ${(filters.invoice_numbers || []).join(', ')}`
    : `${filters.clients.map(subEntityLabel).join(', ')} · ${formatDateOnly(filters.date_from)} – ${formatDateOnly(filters.date_to)}`;

  // Sheet 1: Ringkasan (hasil hitung)
  const ringkasan = [
    { label: 'Periode / Filter', value: periode },
    { label: 'Total Invoice Cover', value: Number(totals.invoice_cover_total) },
    { label: 'Total Expense', value: Number(totals.expense_total) },
    { label: 'Gross Profit 1 (Invoice Cover − Expense)', value: Number(totals.gross_profit_1) },
    { label: '% Gross Profit 1 (GP1 / Total Invoice Cover)', value: totals.gross_profit_1_percent === null ? '—' : Number(totals.gross_profit_1_percent) },
    { label: 'Jumlah Invoice Cover', value: covers.length },
    { label: 'Jumlah Expense', value: expenses.length },
  ];

  exportSheetsToExcel('gross-profit-1', [
    {
      name: 'Ringkasan',
      columns: [
        { header: 'Keterangan', value: (r) => r.label },
        { header: 'Nilai', value: (r) => r.value },
      ],
      rows: ringkasan,
    },
    {
      name: 'Invoice Cover',
      columns: [
        { header: 'Tanggal', value: (c) => formatDateOnly(c.submit_date) },
        { header: 'Client', value: (c) => subEntityLabel(c.sub_entity) },
        { header: 'Kategori 3', value: (c) => (c.category3 ? cat3Label(c.category3) : '') },
        { header: 'TOTAL', value: (c) => Number(c.total) },
        { header: 'Invoice', value: (c) => (c.invoices || []).map((i) => i.invoice_number).join(', ') },
      ],
      rows: covers,
    },
    {
      name: 'Expense',
      columns: [
        { header: 'Tanggal', value: (e) => formatDateOnly(e.occurred_date) },
        { header: 'Kategori 1', value: (e) => cat1Label(e.category1) },
        { header: 'Nominal', value: (e) => Number(e.amount) },
        { header: 'Invoice', value: (e) => (e.invoices || []).map((i) => i.invoice_number).join(', ') },
      ],
      rows: expenses,
    },
  ]);
}

// =====================================================
function ResultView({ data }) {
  const { filters, totals, invoice_covers: covers, expenses } = data;

  // Header subtitle berdasarkan mode
  const subtitle = filters.mode === 'invoice'
    ? formatInvoiceSubtitle(filters.invoice_numbers)
    : (
      (filters.clients.length === 1
        ? subEntityLabel(filters.clients[0])
        : `${filters.clients.length} Client`)
      + ' · '
      + `${formatDateOnly(filters.date_from)} – ${formatDateOnly(filters.date_to)}`
    );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-sm uppercase tracking-wide text-slate-500 font-medium">
            Ringkasan {subtitle}
          </h2>
          <button type="button" onClick={() => exportGP1(data, subtitle)} className="btn-secondary">
            Export Excel
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard
            label="Total Invoice Cover"
            value={formatIDR(totals.invoice_cover_total)}
            sublabel={`${covers.length} cover`}
          />
          <SummaryCard
            label="Total Expense"
            value={formatIDR(totals.expense_total)}
            sublabel={`${expenses.length} expense`}
          />
          <SummaryCard
            label="Gross Profit 1"
            value={formatIDR(totals.gross_profit_1)}
            highlight={totals.gross_profit_1 >= 0 ? 'positive' : 'negative'}
            sublabel="Invoice Cover − Expense"
          />
          <SummaryCard
            label="% Gross Profit 1"
            value={formatPercent(totals.gross_profit_1_percent)}
            highlight={
              totals.gross_profit_1_percent === null
                ? null
                : totals.gross_profit_1_percent >= 0 ? 'positive' : 'negative'
            }
            sublabel="GP1 / Total Invoice Cover"
          />
        </div>
      </div>

      {/* Rumus card */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Detail Kalkulasi</h3>
        <div className="text-sm space-y-1 font-mono">
          <div className="flex items-baseline gap-2">
            <span className="text-slate-500 w-44">Total Invoice Cover</span>
            <span>=</span>
            <span className="font-medium">{formatIDR(totals.invoice_cover_total)}</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-slate-500 w-44">Total Expense</span>
            <span>=</span>
            <span className="font-medium">{formatIDR(totals.expense_total)}</span>
          </div>
          <div className="flex items-baseline gap-2 pt-1 border-t border-slate-300">
            <span className="text-slate-500 w-44">Gross Profit 1</span>
            <span>=</span>
            <span className="font-medium">
              {formatIDR(totals.invoice_cover_total)} − {formatIDR(totals.expense_total)} = <span className="text-slate-900 font-bold">{formatIDR(totals.gross_profit_1)}</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-slate-500 w-44">% Gross Profit 1</span>
            <span>=</span>
            <span className="font-medium">
              {totals.invoice_cover_total > 0
                ? <>{formatIDR(totals.gross_profit_1)} ÷ {formatIDR(totals.invoice_cover_total)} = <span className="text-slate-900 font-bold">{formatPercent(totals.gross_profit_1_percent)}</span></>
                : <span className="text-slate-500 italic">Tidak bisa dihitung (Total Invoice Cover = 0)</span>}
            </span>
          </div>
        </div>
      </div>

      {/* Unpaid invoices */}
      <UnpaidInvoicesSection covers={covers} unpaid={data.unpaid_invoices || []} />

      {/* Detail tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CoverList covers={covers} />
        <ExpenseList expenses={expenses} />
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sublabel, highlight }) {
  const colorClass =
    highlight === 'positive' ? 'text-emerald-700' :
    highlight === 'negative' ? 'text-red-700' :
    'text-slate-900';
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`mt-2 text-xl font-bold font-mono ${colorClass}`}>{value}</div>
      {sublabel && <div className="mt-1 text-xs text-slate-400">{sublabel}</div>}
    </div>
  );
}

function CoverList({ covers }) {
  const total = covers.reduce((s, c) => s + Number(c.total), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-medium text-slate-900">Invoice Cover yang Dihitung</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {covers.length} cover · Total {formatIDR(total)}
        </p>
      </div>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Tanggal</th>
              <th className="text-left px-3 py-2 font-medium">Client</th>
              <th className="text-right px-3 py-2 font-medium">TOTAL</th>
              <th className="text-left px-3 py-2 font-medium">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {covers.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Tidak ada Invoice Cover di periode ini.</td></tr>
            )}
            {covers.map((c) => (
              <tr key={c.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDateOnly(c.submit_date)}</td>
                <td className="px-3 py-2 text-slate-700">
                  <div>{subEntityLabel(c.sub_entity)}</div>
                  {c.category3 && <div className="text-xs text-slate-400">{cat3Label(c.category3)}</div>}
                </td>
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-slate-900">{formatIDR(c.total)}</td>
                <td className="px-3 py-2">
                  {c.invoices.length === 0
                    ? <span className="text-slate-300">—</span>
                    : (
                      <div className="flex flex-wrap gap-1">
                        {c.invoices.map((i) => (
                          <span key={i.id} className="badge bg-slate-100 text-slate-700 font-mono text-xs">{i.invoice_number}</span>
                        ))}
                      </div>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExpenseList({ expenses }) {
  const total = expenses.reduce((s, e) => s + Number(e.amount), 0);
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-medium text-slate-900">Expense yang Dihitung</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          {expenses.length} expense · Total {formatIDR(total)}
        </p>
      </div>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide sticky top-0">
            <tr>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Tanggal</th>
              <th className="text-left px-3 py-2 font-medium">Kategori</th>
              <th className="text-right px-3 py-2 font-medium">Nominal</th>
              <th className="text-left px-3 py-2 font-medium">Invoice</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {expenses.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-400">Tidak ada Expense yang merujuk ke invoice di Invoice Cover yang dipilih.</td></tr>
            )}
            {expenses.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="px-3 py-2 whitespace-nowrap text-slate-700">{formatDateOnly(e.occurred_date)}</td>
                <td className="px-3 py-2 text-slate-700">
                  <div>{cat1Label(e.category1)}</div>
                  <div className="text-xs text-slate-400">{subEntityLabel(e.sub_entity)}</div>
                </td>
                <td className="px-3 py-2 text-right font-mono whitespace-nowrap text-slate-900">{formatIDR(e.amount)}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {e.invoices.map((i) => (
                      <span key={i.id} className="badge bg-slate-100 text-slate-700 font-mono text-xs">{i.invoice_number}</span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============= Small components =============
function UnpaidInvoicesSection({ covers, unpaid }) {
  // Hitung total invoice unik yang ke-rujuk Invoice Cover di hasil ini.
  // Section ini di-hide kalau tidak ada Invoice Cover sama sekali — tidak ada konteks.
  const invoiceIdSet = new Set();
  for (const c of covers) for (const inv of c.invoices) invoiceIdSet.add(inv.id);
  const totalInScope = invoiceIdSet.size;
  if (totalInScope === 0) return null;

  const allPaid = unpaid.length === 0;

  return (
    <section className={`border rounded-xl p-4 ${
      allPaid ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'
    }`}>
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <h3 className="font-medium text-slate-900">
          {allPaid ? 'Status Payment Invoice' : 'Invoice Belum Ada di Payment'}
        </h3>
        <span className="text-xs text-slate-600">
          {unpaid.length} dari {totalInScope} invoice belum ada Payment
        </span>
      </div>
      {allPaid ? (
        <p className="text-sm text-emerald-800">
          ✓ Semua invoice yang dirujuk Invoice Cover sudah punya Payment yang merujuk balik.
        </p>
      ) : (
        <>
          <p className="text-xs text-slate-600 mb-2">
            Invoice berikut dirujuk oleh Invoice Cover di hasil ini, tapi belum ada baris Payment yang merujuk ke nomor invoice tersebut:
          </p>
          <div className="flex flex-wrap gap-1">
            {unpaid.map((inv) => (
              <span
                key={inv.id}
                className="px-2 py-0.5 rounded text-xs font-mono bg-white border border-amber-300 text-amber-900"
              >
                {inv.invoice_number}
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ModeTabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
        ${active
          ? 'bg-white text-slate-900 shadow-sm'
          : 'text-slate-600 hover:text-slate-900'}`}
    >
      {children}
    </button>
  );
}

function formatInvoiceSubtitle(numbers) {
  if (!numbers || numbers.length === 0) return '0 Invoice';
  const count = numbers.length;
  if (count <= 3) return `${count} Invoice · ${numbers.join(', ')}`;
  return `${count} Invoice · ${numbers.slice(0, 3).join(', ')} + ${count - 3} lainnya`;
}

