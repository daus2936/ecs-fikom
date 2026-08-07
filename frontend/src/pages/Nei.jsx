import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import {
  CATEGORY3,
  getClientOptions, subEntityLabel, cat3Label,
} from '../lib/expense-constants.js';
import { NEI_NUMERIC_FIELDS } from '../lib/nei-constants.js';
import { downloadTemplate, parseExcelFile } from '../lib/excel-nei.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';
import InvoiceSortButton from '../components/InvoiceSortButton.jsx';

const CLIENT_OPTIONS = getClientOptions();

// =====================================================
// Halaman utama
// =====================================================
export default function Nei() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'nei');
  const canEdit = pCanEdit(role, 'nei');
  const canDelete = pCanDelete(role, 'nei');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totals: {}, count: 0 });
  const [showTotal, setShowTotal] = useState(false);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const bulk = useBulkSelect(items);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ---- Filter multiple-select ----
  const [fSubEntities, setFSubEntities] = useState([]);
  const [fCategory3, setFCategory3]     = useState([]);
  const [fFakturPajak, setFFakturPajak] = useState([]); // Nomor Faktur Pajak
  const [fPoIds, setFPoIds]             = useState([]);
  const [fInvoiceIds, setFInvoiceIds]   = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDir, setSortDir] = useState(null); // urut Nomor Invoice: null|asc|desc
  // Options (di-load sekali)
  const [poOptions, setPoOptions] = useState([]);
  const [invOptions, setInvOptions] = useState([]);
  const [fakturOptions, setFakturOptions] = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [importMsg, setImportMsg] = useState(null);

  // Opsi dropdown filter
  const subEntityOptions = useMemo(
    () => CLIENT_OPTIONS.map((o) => ({ value: o.code, label: o.label })),
    []
  );
  const category3Options = useMemo(
    () => Object.entries(CATEGORY3).map(([code, label]) => ({ value: code, label })),
    []
  );

  const fileInputRef = useRef(null);

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.sub_entities?.length)       params.sub_entities       = filters.sub_entities.join(',');
      if (filters.category3?.length)          params.category3          = filters.category3.join(',');
      if (filters.nomor_faktur_pajak?.length) params.nomor_faktur_pajak = filters.nomor_faktur_pajak.join(',');
      if (filters.po_ids?.length)             params.po_ids             = filters.po_ids.join(',');
      if (filters.invoice_ids?.length)        params.invoice_ids        = filters.invoice_ids.join(',');
      if (filters.date_from)                  params.date_from          = filters.date_from;
      if (filters.date_to)                    params.date_to            = filters.date_to;
      if (filters.sort === 'asc' || filters.sort === 'desc') { params.sort = 'invoice'; params.dir = filters.sort; }
      const { data } = await api.get('/nei', { params });
      setItems(data.nei);
      setSummary(data.summary || { totals: {}, count: 0 });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load opsi PO, Invoice, Nomor Faktur Pajak sekali
  useEffect(() => {
    Promise.all([
      api.get('/purchase-orders'),
      api.get('/invoices'),
      api.get('/nei/faktur-pajak-options'),
    ])
      .then(([poRes, invRes, fpRes]) => {
        setPoOptions(poRes.data.purchase_orders.map((p) => ({ value: p.id, label: p.po_number })));
        setInvOptions(invRes.data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
        setFakturOptions((fpRes.data.faktur_pajak || []).map((f) => ({ value: f, label: f })));
      })
      .catch(() => { /* abaikan */ });
  }, []);

  const currentFilters = () => ({
    sub_entities:       fSubEntities,
    category3:          fCategory3,
    nomor_faktur_pajak: fFakturPajak,
    po_ids:             fPoIds,
    invoice_ids:        fInvoiceIds,
    date_from:          dateFrom,
    date_to:            dateTo,
    sort:               sortDir,
  });

  useEffect(() => {
    const t = setTimeout(() => load(currentFilters()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fSubEntities, fCategory3, fFakturPajak, fPoIds, fInvoiceIds, dateFrom, dateTo, sortDir, load]);

  const hasActiveFilter = Boolean(
    fSubEntities.length || fCategory3.length || fFakturPajak.length ||
    fPoIds.length || fInvoiceIds.length || dateFrom || dateTo
  );
  const resetFilters = () => {
    setFSubEntities([]); setFCategory3([]); setFFakturPajak([]);
    setFPoIds([]); setFInvoiceIds([]); setDateFrom(''); setDateTo('');
  };

  const handleDelete = async (it) => {
    const msg =
      `Yakin ingin menghapus Nei ini?\n\n` +
      `Tanggal: ${formatDateOnly(it.submit_date)}\n` +
      `Client : ${subEntityLabel(it.sub_entity)}\n` +
      `TOTAL  : ${formatIDR(it.total)}\n\n` +
      `Tindakan ini tidak bisa dibatalkan.`;
    if (!confirm(msg)) return;
    try {
      await api.delete(`/nei/${it.id}`);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImportMsg(null);
    try {
      const rows = await parseExcelFile(file);
      if (rows.length === 0) {
        setImportMsg({ type: 'error', text: 'File tidak berisi data.' });
        return;
      }
      const { data } = await api.post('/nei/import', { rows });
      setImportMsg({ type: 'success', text: `Berhasil import ${data.imported} baris.` });
      load(currentFilters());
    } catch (err) {
      const details = err.response?.data?.details;
      setImportMsg({
        type: 'error',
        text: getErrorMessage(err),
        details: Array.isArray(details) ? details : null,
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nei</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Cover invoice per client. Bisa input langsung atau import dari Excel.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="btn-secondary">↓ Template Excel</button>
          {canCreate && <button onClick={handleImportClick} className="btn-secondary">↑ Import Excel</button>}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
          />
          {isAdmin(role) && (
            <ExportButton
              endpoint="/nei"
              dataKey="nei"
              filename="nei"
              params={{
                sub_entities:       fSubEntities.length ? fSubEntities.join(',') : undefined,
                category3:          fCategory3.length ? fCategory3.join(',') : undefined,
                nomor_faktur_pajak: fFakturPajak.length ? fFakturPajak.join(',') : undefined,
                po_ids:             fPoIds.length ? fPoIds.join(',') : undefined,
                invoice_ids:        fInvoiceIds.length ? fInvoiceIds.join(',') : undefined,
                date_from:          dateFrom || undefined,
                date_to:            dateTo || undefined,
              }}
              columns={[
                { header: 'Tanggal', value: (r) => formatDateOnly(r.submit_date) },
                { header: 'Client', value: (r) => subEntityLabel(r.sub_entity) },
                { header: 'Kategori 3', value: (r) => (r.category3 ? cat3Label(r.category3) : '') },
                { header: 'Nomor Faktur Pajak', value: (r) => r.nomor_faktur_pajak || '' },
                { header: 'Nomor PO', value: (r) => (r.purchase_orders || []).map((p) => p.po_number).join(', ') },
                { header: 'Nomor Invoice', value: (r) => (r.invoices || []).map((i) => i.invoice_number).join(', ') },
                ...NEI_NUMERIC_FIELDS.map(([key, label]) => ({
                  header: label, value: (r) => Number(r[key] || 0),
                })),
                { header: 'Tanggal Input (WIB)', value: (r) => formatDateTime(r.created_at) },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Nei</button>}
        </div>
      </div>

      {/* Banner import */}
      {importMsg && (
        <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${
          importMsg.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="font-medium">{importMsg.text}</div>
              {importMsg.details && (
                <ul className="mt-2 list-disc list-inside text-xs space-y-0.5">
                  {importMsg.details.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              )}
            </div>
            <button onClick={() => setImportMsg(null)} className="text-current opacity-60 hover:opacity-100 text-lg leading-none">×</button>
          </div>
        </div>
      )}

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
            <label className="label">Nomor Faktur Pajak</label>
            <MultiSearchSelect
              options={fakturOptions}
              selected={fFakturPajak}
              onChange={setFFakturPajak}
              placeholder="Cari & pilih Nomor Faktur Pajak…"
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
              <input type="date" className="input" value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label className="label">Tanggal sampai</label>
              <input type="date" className="input" value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <InvoiceSortButton sortDir={sortDir} onChange={setSortDir} />
          {hasActiveFilter && (
            <button type="button" onClick={resetFilters} className="btn-secondary">Reset Filter</button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {/* summary-total-banner: total nominal PER variabel */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-emerald-800">
            <span className="font-medium">Total Nominal per Variabel</span>
            {(dateFrom || dateTo) && (
              <span className="text-emerald-600 ml-1">
                (periode {dateFrom || "awal"} s/d {dateTo || "akhir"})
              </span>
            )}
            <span className="text-emerald-600 ml-1">· {summary.count} data</span>
          </div>
          <button
            type="button"
            onClick={() => setShowTotal((v) => !v)}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
          >
            {showTotal ? 'Sembunyikan' : 'Lihat Total Nominal'}
          </button>
        </div>
        {showTotal && (
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {NEI_NUMERIC_FIELDS.map(([key, label]) => (
              <div key={key} className="bg-white border border-emerald-200 rounded-lg px-3 py-2">
                <div className="text-xs text-emerald-700">{label}</div>
                <div className="text-sm font-bold text-emerald-900 font-mono mt-0.5">
                  {formatIDR(summary.totals?.[key] || 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/nei"
          ids={bulk.selectedIds}
          label="Nei"
          onClear={bulk.clear}
          onDone={() => { bulk.clear(); load(currentFilters()); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {showSelect && (<th className="px-4 py-3 w-10"><input type="checkbox" checked={bulk.allSelected(pageIds)} onChange={() => bulk.toggleAll(pageIds)} /></th>)}
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Kategori</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Nomor Faktur Pajak</th>
                <th className="text-right px-4 py-3 font-medium">TOTAL</th>
                <th className="text-left px-4 py-3 font-medium">PO</th>
                <th className="text-left px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={showSelect ? 9 : 8} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 9 : 8} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data. Klik "Tambah Nei" atau import Excel.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 whitespace-nowrap text-slate-900">{formatDateOnly(it.submit_date)}</td>
                  <td className="px-4 py-3 text-slate-900">{subEntityLabel(it.sub_entity)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {it.category3
                      ? <span>{cat3Label(it.category3)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">
                    {it.nomor_faktur_pajak
                      ? it.nomor_faktur_pajak
                      : <span className="text-slate-300 font-sans">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-slate-900">{formatIDR(it.total)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {it.purchase_orders.map((po) => (
                        <span key={po.id} className="badge bg-slate-100 text-slate-700 font-mono">{po.po_number}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {it.invoices.length === 0
                      ? <span className="text-slate-300">—</span>
                      : (
                        <div className="flex flex-wrap gap-1">
                          {it.invoices.map((i) => (
                            <span key={i.id} className="badge bg-slate-100 text-slate-700 font-mono">{i.invoice_number}</span>
                          ))}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setViewing(it)} className="text-slate-600 hover:text-slate-800 font-medium">Detail</button>
                    {canEdit && (
                      <button onClick={() => setEditing(it)} className="text-brand-700 hover:text-brand-800 font-medium ml-3">Edit</button>
                    )}
                    {canDelete && (
                      <button onClick={() => handleDelete(it)} className="text-red-600 hover:text-red-700 font-medium ml-3">Hapus</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        {!loading && <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />}
        </div>
      </div>

      <NeiFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load(currentFilters());
        }}
      />
      <NeiViewModal
        item={viewing}
        onClose={() => setViewing(null)}
        onEdit={canEdit ? (it) => { setViewing(null); setEditing(it); } : undefined}
      />
    </div>
  );
}

// =====================================================
// Modal: Tambah/Edit Nei
// =====================================================
const EMPTY_FORM = {
  submit_date: todayISO(),
  sub_entity: '',
  category3: '',
  nomor_faktur_pajak: '',
  purchase_order_ids: [],
  invoice_ids: [],
  ...Object.fromEntries(NEI_NUMERIC_FIELDS.map(([k]) => [k, 0])),
};

function NeiFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';

  const [form, setForm] = useState(EMPTY_FORM);
  const [poOptions, setPoOptions] = useState([]);
  const [invOptions, setInvOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEdit) {
      const next = {
        submit_date: editing.submit_date?.slice(0, 10) || todayISO(),
        sub_entity:  editing.sub_entity,
        category3:   editing.category3 || '',
        nomor_faktur_pajak: editing.nomor_faktur_pajak || '',
        purchase_order_ids: editing.purchase_orders.map((p) => p.id),
        invoice_ids:        editing.invoices.map((i) => i.id),
      };
      for (const [k] of NEI_NUMERIC_FIELDS) next[k] = Number(editing[k]) || 0;
      setForm(next);
    } else {
      setForm(EMPTY_FORM);
    }

    setOptionsLoading(true);
    Promise.all([api.get('/purchase-orders'), api.get('/invoices')])
      .then(([poRes, invRes]) => {
        setPoOptions(poRes.data.purchase_orders.map((p) => ({ value: p.id, label: p.po_number })));
        setInvOptions(invRes.data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
      })
      .catch((err) => setError('Gagal memuat daftar PO/Invoice: ' + getErrorMessage(err)))
      .finally(() => setOptionsLoading(false));
  }, [open, isEdit, editing]);

  const showCategory3 = form.sub_entity === 'BIERSDORF';

  const setSubEntity = (code) => {
    setForm((f) => ({ ...f, sub_entity: code, category3: '' }));
  };

  const validate = () => {
    if (!form.submit_date) return 'Tanggal submit wajib diisi.';
    if (!form.sub_entity)  return 'Pilih Client.';
    if (!form.nomor_faktur_pajak?.trim()) return 'Nomor Faktur Pajak wajib diisi.';
    if (form.purchase_order_ids.length === 0) return 'Minimal 1 nomor PO harus dipilih.';
    if (form.sub_entity === 'BIERSDORF' && !form.category3) {
      return 'Kategori 3 (NMA/BMC/KPL) wajib diisi untuk PT Biersdorf Indonesia.';
    }
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const v = validate();
    if (v) { setError(v); return; }

    const payload = {
      submit_date: form.submit_date,
      sub_entity:  form.sub_entity,
      category3:   showCategory3 && form.category3 ? form.category3 : null,
      nomor_faktur_pajak: form.nomor_faktur_pajak.trim(),
      purchase_order_ids: form.purchase_order_ids,
      invoice_ids:        form.invoice_ids,
    };
    for (const [k] of NEI_NUMERIC_FIELDS) payload[k] = Number(form[k] || 0);

    setSubmitting(true);
    try {
      if (isEdit) await api.put(`/nei/${editing.id}`, payload);
      else        await api.post('/nei', payload);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}
      title={isEdit ? 'Edit Nei' : 'Tambah Nei'}
      maxWidth="max-w-3xl">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Client <span className="text-red-500">*</span></label>
            <select required className="input"
              value={form.sub_entity}
              onChange={(e) => setSubEntity(e.target.value)}>
              <option value="">— Pilih —</option>
              {CLIENT_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Tanggal Submit <span className="text-red-500">*</span></label>
            <input type="date" required className="input"
              value={form.submit_date}
              onChange={(e) => setForm((f) => ({ ...f, submit_date: e.target.value }))} />
          </div>
        </div>

        {showCategory3 && (
          <div>
            <label className="label">Kategori 3 <span className="text-red-500">*</span></label>
            <select required className="input"
              value={form.category3}
              onChange={(e) => setForm((f) => ({ ...f, category3: e.target.value }))}>
              <option value="">— Pilih —</option>
              {Object.entries(CATEGORY3).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="label">
            Nomor Faktur Pajak <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            maxLength={50}
            className="input font-mono"
            placeholder="Contoh: 010.000-26.12345678"
            value={form.nomor_faktur_pajak}
            onChange={(e) => setForm((f) => ({ ...f, nomor_faktur_pajak: e.target.value }))}
          />
        </div>

        <div>
          <label className="label">
            Merujuk ke PO Nomor <span className="text-red-500">*</span>
            <span className="text-slate-400 font-normal ml-1">(bisa pilih beberapa)</span>
          </label>
          <MultiSearchSelect
            options={poOptions}
            selected={form.purchase_order_ids}
            onChange={(ids) => setForm((f) => ({ ...f, purchase_order_ids: ids }))}
            placeholder={optionsLoading ? 'Memuat daftar PO…' : 'Cari nomor PO…'}
            emptyMessage="Tidak ada PO yang cocok."
          />
        </div>

        <div>
          <label className="label">
            Merujuk ke Invoice Nomor
            <span className="text-slate-400 font-normal ml-1">(opsional, bisa pilih beberapa)</span>
          </label>
          <MultiSearchSelect
            options={invOptions}
            selected={form.invoice_ids}
            onChange={(ids) => setForm((f) => ({ ...f, invoice_ids: ids }))}
            placeholder={optionsLoading ? 'Memuat daftar invoice…' : 'Cari nomor invoice…'}
            emptyMessage="Tidak ada invoice yang cocok."
          />
        </div>

        <div className="pt-2 border-t border-slate-100">
          <h3 className="text-sm font-medium text-slate-700 mb-3">Nominal (Rupiah)</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {NEI_NUMERIC_FIELDS.map(([key, label]) => (
              <NumericInput
                key={key}
                label={label}
                value={form[key]}
                onChange={(v) => setForm((f) => ({ ...f, [key]: v }))}
              />
            ))}
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Simpan')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// Modal: Detail (read-only)
// =====================================================
function NeiViewModal({ item, onClose, onEdit }) {
  if (!item) return null;

  return (
    <Modal open={!!item} onClose={onClose} title="Detail Nei" maxWidth="max-w-3xl">
      <div className="space-y-5">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Umum</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Tanggal Submit" value={formatDateOnly(item.submit_date)} />
            <Field label="Client" value={subEntityLabel(item.sub_entity)} />
            {item.category3 && <Field label="Kategori 3" value={cat3Label(item.category3)} />}
            <Field label="Nomor Faktur Pajak" value={
              item.nomor_faktur_pajak
                ? <span className="font-mono">{item.nomor_faktur_pajak}</span>
                : <span className="text-slate-300">—</span>
            } />
          </dl>
        </section>

        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Referensi</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">Nomor PO:</span>
              {item.purchase_orders.length === 0 ? (
                <span className="text-slate-300 ml-2">—</span>
              ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.purchase_orders.map((po) => (
                    <span key={po.id} className="badge bg-slate-100 text-slate-700 font-mono">{po.po_number}</span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <span className="text-slate-500">Nomor Invoice:</span>
              {item.invoices.length === 0 ? (
                <span className="text-slate-300 ml-2">—</span>
              ) : (
                <div className="flex flex-wrap gap-1 mt-1">
                  {item.invoices.map((i) => (
                    <span key={i.id} className="badge bg-slate-100 text-slate-700 font-mono">{i.invoice_number}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Nominal (Rupiah)</h3>
          <div className="bg-slate-50 rounded-lg border border-slate-200 divide-y divide-slate-200">
            {NEI_NUMERIC_FIELDS.map(([key, label]) => {
              const isTotal = key === 'total';
              return (
                <div key={key} className={`flex items-center justify-between px-4 py-2.5 text-sm ${isTotal ? 'bg-slate-100' : ''}`}>
                  <span className={isTotal ? 'font-medium text-slate-900' : 'text-slate-700'}>{label}</span>
                  <span className={`font-mono ${isTotal ? 'font-bold text-slate-900' : 'text-slate-900'}`}>
                    {formatIDR(item[key])}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Audit</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field
              label="Dibuat oleh"
              value={item.created_by_name
                ? `${item.created_by_name}${item.created_by_username ? ` (@${item.created_by_username})` : ''}`
                : '—'}
            />
            <Field label="Tanggal dibuat" value={formatDateTime(item.created_at) + ' WIB'} />
            {item.updated_at && item.updated_at !== item.created_at && (
              <>
                <Field
                  label="Terakhir diubah oleh"
                  value={item.updated_by_name
                    ? `${item.updated_by_name}${item.updated_by_username ? ` (@${item.updated_by_username})` : ''}`
                    : '—'}
                />
                <Field label="Terakhir diubah" value={formatDateTime(item.updated_at) + ' WIB'} />
              </>
            )}
          </dl>
        </section>

        <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">Tutup</button>
          {onEdit && <button type="button" onClick={() => onEdit(item)} className="btn-primary">Edit Data</button>}
        </div>
      </div>
    </Modal>
  );
}

// ============= Small components =============
function NumericInput({ label, value, onChange }) {
  return (
    <div>
      <label className="text-xs text-slate-600 mb-1 block">{label}</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">Rp</span>
        <input
          type="text"
          inputMode="numeric"
          className="input pl-8 font-mono text-sm"
          placeholder="0"
          value={formatNumberID(value)}
          onChange={(e) => onChange(parseAmount(e.target.value))}
        />
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </>
  );
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}
