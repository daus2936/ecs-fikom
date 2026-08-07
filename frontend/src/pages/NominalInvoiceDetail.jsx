import { useEffect, useState, useCallback, useMemo } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatIDR } from '../lib/format.js';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import {
  INVOICE_DETAIL_NUMERIC_FIELDS,
} from '../lib/invoice-detail-constants.js';
import { SUB_ENTITIES, CATEGORY3 } from '../lib/expense-constants.js';

// Halaman ringkasan nominal Invoice Detail per variabel/kolom, dengan filter multiple.
export default function NominalInvoiceDetail() {
  // ---- Filter multiple-select ----
  const [fSubEntities, setFSubEntities] = useState([]);
  const [fCategory3, setFCategory3]     = useState([]);
  const [fPoIds, setFPoIds]             = useState([]);
  const [fInvoiceIds, setFInvoiceIds]   = useState([]);
  const [fCategory1, setFCategory1]     = useState([]); // variabel/kolom mana yang ditampilkan
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Options PO & Invoice (di-load sekali)
  const [poOptions, setPoOptions] = useState([]);
  const [invOptions, setInvOptions] = useState([]);

  // Hasil dari server
  const [columns, setColumns] = useState([]);   // [{ key, label, total }]
  const [count, setCount] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Opsi dropdown (client only — Invoice Detail tidak punya non-client)
  const subEntityOptions = useMemo(
    () => Object.entries(SUB_ENTITIES)
      .filter(([, def]) => def.type === 'client')
      .map(([code, def]) => ({ value: code, label: def.label })),
    []
  );
  const category3Options = useMemo(
    () => Object.entries(CATEGORY3).map(([code, label]) => ({ value: code, label })),
    []
  );
  // Kategori 1 = daftar variabel nominal (10 kolom)
  const category1Options = useMemo(
    () => INVOICE_DETAIL_NUMERIC_FIELDS.map(([key, label]) => ({ value: key, label })),
    []
  );

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.sub_entities?.length) params.sub_entities = filters.sub_entities.join(',');
      if (filters.category3?.length)    params.category3    = filters.category3.join(',');
      if (filters.po_ids?.length)       params.po_ids       = filters.po_ids.join(',');
      if (filters.invoice_ids?.length)  params.invoice_ids  = filters.invoice_ids.join(',');
      if (filters.category1?.length)    params.category1    = filters.category1.join(',');
      if (filters.date_from)            params.date_from    = filters.date_from;
      if (filters.date_to)              params.date_to      = filters.date_to;
      const { data } = await api.get('/invoice-details/nominal-summary', { params });
      setColumns(data.columns || []);
      setCount(data.count || 0);
      setGrandTotal(data.grand_total || 0);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load opsi PO & Invoice sekali
  useEffect(() => {
    Promise.all([api.get('/purchase-orders'), api.get('/invoices')])
      .then(([poRes, invRes]) => {
        setPoOptions(poRes.data.purchase_orders.map((p) => ({ value: p.id, label: p.po_number })));
        setInvOptions(invRes.data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
      })
      .catch(() => { /* abaikan */ });
  }, []);

  // Debounce semua filter → 1 request
  useEffect(() => {
    const t = setTimeout(() => load({
      sub_entities: fSubEntities,
      category3:    fCategory3,
      po_ids:       fPoIds,
      invoice_ids:  fInvoiceIds,
      category1:    fCategory1,
      date_from:    dateFrom,
      date_to:      dateTo,
    }), 300);
    return () => clearTimeout(t);
  }, [fSubEntities, fCategory3, fPoIds, fInvoiceIds, fCategory1, dateFrom, dateTo, load]);

  const hasActiveFilter = Boolean(
    fSubEntities.length || fCategory3.length || fPoIds.length ||
    fInvoiceIds.length || fCategory1.length || dateFrom || dateTo
  );
  const dateRangeInvalid = dateFrom && dateTo && dateFrom > dateTo;
  const resetFilters = () => {
    setFSubEntities([]); setFCategory3([]); setFPoIds([]);
    setFInvoiceIds([]); setFCategory1([]); setDateFrom(''); setDateTo('');
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Nominal Invoice Detail</h1>
        <p className="text-slate-500 mt-1 text-sm">
          Lihat total nominal per variabel dari Invoice Detail. Default menampilkan semua variabel;
          gunakan filter untuk mempersempit perhitungan.
        </p>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Nama Client</label>
            <MultiSearchSelect
              options={subEntityOptions}
              selected={fSubEntities}
              onChange={setFSubEntities}
              placeholder="Pilih satu atau beberapa…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Kategori 3</label>
            <MultiSearchSelect
              options={category3Options}
              selected={fCategory3}
              onChange={setFCategory3}
              placeholder="Pilih satu atau beberapa…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">
              Kategori 1 <span className="text-slate-400 font-normal">(variabel)</span>
            </label>
            <MultiSearchSelect
              options={category1Options}
              selected={fCategory1}
              onChange={setFCategory1}
              placeholder="Semua variabel…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Nomor PO</label>
            <MultiSearchSelect
              options={poOptions}
              selected={fPoIds}
              onChange={setFPoIds}
              placeholder="Cari & pilih nomor PO…"
              emptyMessage="Tidak ada PO yang cocok."
            />
          </div>
          <div>
            <label className="label">Nomor Invoice</label>
            <MultiSearchSelect
              options={invOptions}
              selected={fInvoiceIds}
              onChange={setFInvoiceIds}
              placeholder="Cari & pilih nomor invoice…"
              emptyMessage="Tidak ada invoice yang cocok."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Tanggal dari</label>
              <input
                type="date"
                className="input"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tanggal sampai</label>
              <input
                type="date"
                className="input"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </div>
        {hasActiveFilter && (
          <div className="mt-3">
            <button type="button" onClick={resetFilters} className="btn-secondary">
              Reset Filter
            </button>
          </div>
        )}
        {dateRangeInvalid && (
          <p className="text-xs text-amber-700 mt-2">
            Tanggal "dari" lebih besar dari "sampai" — hasilnya akan kosong.
          </p>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* Info jumlah data yang dihitung */}
      <div className="mb-4 text-sm text-slate-500">
        Dihitung dari <span className="font-medium text-slate-700">{count}</span> baris Invoice Detail
        {(dateFrom || dateTo) && (
          <span> · periode {dateFrom || 'awal'} s/d {dateTo || 'akhir'}</span>
        )}
      </div>

      {/* Tabel nominal per variabel */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium w-12">#</th>
              <th className="text-left px-4 py-3 font-medium">Variabel (Kategori 1)</th>
              <th className="text-right px-4 py-3 font-medium">Nominal</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>
            )}
            {!loading && columns.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-12 text-center text-slate-400">Tidak ada data.</td></tr>
            )}
            {!loading && columns.map((c, idx) => (
              <tr key={c.key} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-400">{idx + 1}</td>
                <td className="px-4 py-3 text-slate-800">{c.label}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-900">{formatIDR(c.total)}</td>
              </tr>
            ))}
          </tbody>
          {!loading && columns.length > 0 && (
            <tfoot>
              <tr className="bg-emerald-50 border-t-2 border-emerald-200 font-semibold">
                <td className="px-4 py-3" colSpan={2}>
                  <span className="text-emerald-900">TOTAL</span>
                  <span className="text-emerald-600 font-normal text-xs ml-2">
                    ({columns.length} variabel)
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-emerald-900 text-base">
                  {formatIDR(grandTotal)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
