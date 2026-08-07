import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import {
  SUB_ENTITIES,
  getSubEntitiesByType,
  subEntityLabel, cat1Label,
} from '../lib/expense-constants.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import { downloadDBBefore2025Template, parseDBBefore2025Excel } from '../lib/excel-db-before-2025.js';

// =====================================================
// Halaman utama
// =====================================================
export default function DBBefore2025() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'expenses');
  const canEdit = pCanEdit(role, 'expenses');
  const canDelete = pCanDelete(role, 'expenses');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total_amount: 0, count: 0 });
  const [showTotal, setShowTotal] = useState(false);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ---- Filter multiple-select ----
  const [fSubEntities, setFSubEntities] = useState([]); // array kode sub_entity
  const [fCategory1, setFCategory1]     = useState([]); // array kode kategori1 (hanya DB)
  const [fPoIds, setFPoIds]             = useState([]); // array id PO
  const [fInvoiceIds, setFInvoiceIds]   = useState([]); // array id invoice
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Options untuk filter PO & Invoice (di-load sekali saat mount)
  const [filterPoOptions, setFilterPoOptions] = useState([]);
  const [filterInvOptions, setFilterInvOptions] = useState([]);
  const [editing, setEditing] = useState(null); // null=tutup, 'new'=buat baru, object=edit
  const [viewing, setViewing] = useState(null); // detail modal

  // Opsi dropdown filter (dari constants — gabungan semua, lintas tipe)
  const subEntityOptions = useMemo(
    () => Object.entries(SUB_ENTITIES).map(([code, def]) => ({ value: code, label: def.label })),
    []
  );
  const category1Options = useMemo(
    () => [{ value: 'DB', label: 'DB' }],
    []
  );

  // ---- Import Excel state ----
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.sub_entities?.length) params.sub_entities = filters.sub_entities.join(',');
      if (filters.category1?.length)    params.category1    = filters.category1.join(',');
      if (filters.po_ids?.length)       params.po_ids       = filters.po_ids.join(',');
      if (filters.invoice_ids?.length)  params.invoice_ids  = filters.invoice_ids.join(',');
      if (filters.date_from)            params.date_from    = filters.date_from;
      if (filters.date_to)              params.date_to      = filters.date_to;
      const { data } = await api.get('/db-before-2025', { params });
      setItems(data.db_before_2025);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  // Load opsi PO & Invoice untuk filter (sekali saja saat mount)
  useEffect(() => {
    Promise.all([api.get('/purchase-orders'), api.get('/invoices')])
      .then(([poRes, invRes]) => {
        setFilterPoOptions(poRes.data.purchase_orders.map((p) => ({ value: p.id, label: p.po_number })));
        setFilterInvOptions(invRes.data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
      })
      .catch(() => { /* abaikan — filter PO/Invoice tetap bisa kosong */ });
  }, []);

  // Debounce semua filter → 1 request per perubahan
  useEffect(() => {
    const t = setTimeout(() => load({
      sub_entities: fSubEntities,
      category1:    fCategory1,
      po_ids:       fPoIds,
      invoice_ids:  fInvoiceIds,
      date_from:    dateFrom,
      date_to:      dateTo,
    }), 300);
    return () => clearTimeout(t);
  }, [fSubEntities, fCategory1, fPoIds, fInvoiceIds, dateFrom, dateTo, load]);

  const hasActiveFilter = Boolean(
    fSubEntities.length || fCategory1.length ||
    fPoIds.length || fInvoiceIds.length || dateFrom || dateTo
  );
  const dateRangeInvalid = dateFrom && dateTo && dateFrom > dateTo;
  const resetFilters = () => {
    setFSubEntities([]);
    setFCategory1([]);
    setFPoIds([]);
    setFInvoiceIds([]);
    setDateFrom('');
    setDateTo('');
  };

  const handleDelete = async (it) => {
    const msg =
      `Yakin ingin menghapus expense ini?\n\n` +
      `Tanggal : ${formatDateOnly(it.occurred_date)}\n` +
      `Pihak   : ${subEntityLabel(it.sub_entity)}\n` +
      `Kategori: ${cat1Label(it.category1)}\n` +
      `Nominal : ${formatIDR(it.amount)}\n\n` +
      `Tindakan ini tidak bisa dibatalkan.`;
    if (!confirm(msg)) return;
    try {
      await api.delete(`/db-before-2025/${it.id}`);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const { rows } = await parseDBBefore2025Excel(file);
      if (rows.length === 0) {
        alert('File Excel tidak punya data atau header tidak cocok. Pastikan kolom "occurred_date" terisi.');
        return;
      }
      if (!confirm(`Ditemukan ${rows.length} baris. Lanjut import?`)) return;

      const { data } = await api.post('/db-before-2025/import', { rows });
      setImportResult({ ok: true, count: data.imported, codes: data.codes });
      // refresh list pakai filter yang sedang aktif
      load({
        sub_entities: fSubEntities,
        category1:    fCategory1,
        po_ids:       fPoIds,
        invoice_ids:  fInvoiceIds,
        date_from:    dateFrom || undefined,
        date_to:      dateTo || undefined,
      });
    } catch (err) {
      alert('Gagal import:\n\n' + getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">DB Before 2025</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Daftar DB sebelum 2025. Hanya admin/superadmin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadDBBefore2025Template}
            className="btn-secondary"
            title="Download template Excel untuk import"
          >
            Template
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn-secondary"
            >
              {importing ? 'Mengimport…' : 'Import Excel'}
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportFile}
          />
          {canCreate && (
            <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Expense</button>
          )}
        </div>
      </div>

      {importResult && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
          <span>✓ Berhasil import {importResult.count} expense{importResult.codes?.length > 0 ? ` (kode: ${importResult.codes.slice(0, 3).join(', ')}${importResult.codes.length > 3 ? '…' : ''})` : ''}.</span>
          <button onClick={() => setImportResult(null)} className="text-emerald-700 hover:text-emerald-900 text-xs">✕</button>
        </div>
      )}

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Client / Non-Client</label>
            <MultiSearchSelect
              options={subEntityOptions}
              selected={fSubEntities}
              onChange={setFSubEntities}
              placeholder="Pilih satu atau beberapa…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Kategori 1</label>
            <MultiSearchSelect
              options={category1Options}
              selected={fCategory1}
              onChange={setFCategory1}
              placeholder="Pilih satu atau beberapa…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Nomor PO</label>
            <MultiSearchSelect
              options={filterPoOptions}
              selected={fPoIds}
              onChange={setFPoIds}
              placeholder="Cari & pilih nomor PO…"
              emptyMessage="Tidak ada PO yang cocok."
            />
          </div>
          <div>
            <label className="label">Nomor Invoice</label>
            <MultiSearchSelect
              options={filterInvOptions}
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

      {/* summary-total-banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-emerald-800">
          <span className="font-medium">Total Nominal DB Before 2025</span>
          {(dateFrom || dateTo) && (
            <span className="text-emerald-600 ml-1">
              (periode {dateFrom || "awal"} s/d {dateTo || "akhir"})
            </span>
          )}
          <span className="text-emerald-600 ml-1">· {summary.count} data</span>
        </div>
        {showTotal ? (
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-emerald-900 font-mono">{formatIDR(summary.total_amount)}</span>
            <button
              type="button"
              onClick={() => setShowTotal(false)}
              className="text-xs text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
            >
              Sembunyikan
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowTotal(true)}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap"
          >
            Lihat Total Nominal
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium">Client / Non-Client</th>
                <th className="text-left px-4 py-3 font-medium">Kategori</th>
                <th className="text-right px-4 py-3 font-medium">Nominal</th>
                <th className="text-left px-4 py-3 font-medium">PO</th>
                <th className="text-left px-4 py-3 font-medium">Invoice</th>
                <th className="text-left px-4 py-3 font-medium">Keterangan</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada expense yang cocok dengan filter.' : 'Belum ada data. Klik "Tambah Expense" untuk membuat.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-700 font-medium">
                    {it.expense_code || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                    {formatDateOnly(it.occurred_date)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{subEntityLabel(it.sub_entity)}</div>
                    <div className="text-xs text-slate-400">
                      {it.expense_type === 'client' ? 'Client' : 'Non-Client'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{cat1Label(it.category1)}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-slate-900">
                    {formatIDR(it.amount)}
                  </td>
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
                  <td className="px-4 py-3 text-slate-600 max-w-xs">
                    {it.notes
                      ? <span className="line-clamp-2">{it.notes}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      onClick={() => setViewing(it)}
                      className="text-slate-600 hover:text-slate-800 font-medium"
                    >Detail</button>
                    {canEdit && (
                      <button
                        onClick={() => setEditing(it)}
                        className="text-brand-700 hover:text-brand-800 font-medium ml-3"
                      >Edit</button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(it)}
                        className="text-red-600 hover:text-red-700 font-medium ml-3"
                      >Hapus</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        {!loading && <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />}
        </div>
      </div>

      <ExpenseFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load({
            sub_entities: fSubEntities,
            category1:    fCategory1,
            po_ids:       fPoIds,
            invoice_ids:  fInvoiceIds,
            date_from:    dateFrom,
            date_to:      dateTo,
          });
        }}
      />
      <ExpenseViewModal
        item={viewing}
        onClose={() => setViewing(null)}
        onEdit={canEdit ? (it) => { setViewing(null); setEditing(it); } : undefined}
      />
    </div>
  );
}

// =====================================================
// Modal: Tambah/Edit Expense
// =====================================================
const EMPTY_FORM = {
  occurred_date: todayISO(),
  expense_type: '',
  sub_entity: '',
  category1: 'DB',
  amount: 0,
  notes: '',
  purchase_order_ids: [],
  invoice_ids: [],
};

function ExpenseFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';

  const [form, setForm] = useState(EMPTY_FORM);
  const [poOptions, setPoOptions] = useState([]);
  const [invOptions, setInvOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Saat modal dibuka: reset form & load options
  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEdit) {
      setForm({
        occurred_date: editing.occurred_date?.slice(0, 10) || todayISO(),
        expense_type:   editing.expense_type,
        sub_entity:     editing.sub_entity,
        category1:      'DB',
        amount:         Number(editing.amount),
        notes:          editing.notes || '',
        purchase_order_ids: editing.purchase_orders.map((p) => p.id),
        invoice_ids:        editing.invoices.map((i) => i.id),
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setOptionsLoading(true);
    Promise.all([
      api.get('/purchase-orders'),
      api.get('/invoices'),
    ]).then(([poRes, invRes]) => {
      setPoOptions(poRes.data.purchase_orders.map((p) => ({ value: p.id, label: p.po_number })));
      setInvOptions(invRes.data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
    }).catch((err) => {
      setError('Gagal memuat daftar PO/Invoice: ' + getErrorMessage(err));
    }).finally(() => setOptionsLoading(false));
  }, [open, isEdit, editing]);

  // ----- Cascading reset logic -----
  // Tipe berubah → reset sub_entity. Kategori 1 selalu "DB".
  const setExpenseType = (type) => {
    setForm((f) => ({
      ...f,
      expense_type: type,
      sub_entity: '',
      // PO & Invoice opsional untuk semua tipe — tidak di-reset.
    }));
  };

  // Sub-entity berubah → set sub_entity (tidak ada cascade Kategori 3)
  const setSubEntity = (subCode) => {
    setForm((f) => ({
      ...f,
      sub_entity: subCode,
    }));
  };

  // ----- Derived state -----
  const subEntityOptions = useMemo(
    () => (form.expense_type ? getSubEntitiesByType(form.expense_type) : []),
    [form.expense_type]
  );

  // ----- Validation -----
  const validate = () => {
    if (!form.occurred_date)         return 'Tanggal wajib diisi.';
    if (!form.expense_type)          return 'Pilih Client atau Non-Client.';
    if (!form.sub_entity)            return form.expense_type === 'client'
      ? 'Pilih client.'
      : 'Pilih Internal KBSI atau Internal SMI.';
    if (!(form.amount > 0))          return 'Nominal harus lebih dari 0.';
    // Kategori 1 selalu "DB". Tidak ada Kategori 3. PO & Invoice opsional.
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    // parent_company TIDAK dikirim — backend derive dari sub_entity.
    const payload = {
      occurred_date: form.occurred_date,
      expense_type:   form.expense_type,
      sub_entity:     form.sub_entity,
      category1:      'DB',
      amount:         form.amount,
      notes:          form.notes.trim() || null,
      purchase_order_ids: form.purchase_order_ids,
      invoice_ids:        form.invoice_ids,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/db-before-2025/${editing.id}`, payload);
      } else {
        await api.post('/db-before-2025', payload);
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Expense' : 'Tambah Expense'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-5">
        {/* 1. Tanggal */}
        <div>
          <label className="label">Tanggal Terjadi Expense <span className="text-red-500">*</span></label>
          <input
            type="date"
            required
            className="input"
            value={form.occurred_date}
            onChange={(e) => setForm((f) => ({ ...f, occurred_date: e.target.value }))}
          />
        </div>

        {/* 2. Tipe: Client / Non-Client */}
        <div>
          <label className="label">Tipe <span className="text-red-500">*</span></label>
          <div className="flex gap-2">
            <RadioCard
              checked={form.expense_type === 'client'}
              onChange={() => setExpenseType('client')}
              label="Client"
            />
            <RadioCard
              checked={form.expense_type === 'non_client'}
              onChange={() => setExpenseType('non_client')}
              label="Non-Client"
            />
          </div>
        </div>

        {/* 3. Client / Non-Client picker — langsung tanpa parent dropdown */}
        {form.expense_type && (
          <div>
            <label className="label">
              {form.expense_type === 'client' ? 'Pilih Client' : 'Pilih Non-Client'}
              <span className="text-red-500"> *</span>
            </label>
            <select
              required
              className="input"
              value={form.sub_entity}
              onChange={(e) => setSubEntity(e.target.value)}
            >
              <option value="">— Pilih —</option>
              {subEntityOptions.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* 4. Kategori 1 — selalu "DB" */}
        {form.expense_type && (
          <div>
            <label className="label">Kategori 1</label>
            <input type="text" className="input bg-slate-50" value="DB" readOnly disabled />
          </div>
        )}

        {/* Kategori 3 dihapus untuk halaman DB. */}

        {/* 6. Nominal */}
        <div>
          <label className="label">Nominal (Rupiah) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <input
              type="text"
              inputMode="numeric"
              required
              className="input pl-10 font-mono"
              placeholder="0"
              value={formatNumberID(form.amount)}
              onChange={(e) => setForm((f) => ({ ...f, amount: parseAmount(e.target.value) }))}
            />
          </div>
        </div>

        {/* 7. Keterangan */}
        <div>
          <label className="label">Keterangan <span className="text-slate-400 font-normal">(opsional)</span></label>
          <textarea
            rows={3}
            maxLength={2000}
            className="input"
            placeholder="Detail tambahan…"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {/* 8 & 9. PO + Invoice refs — opsional, untuk semua tipe */}
        {form.expense_type && (
          <>
            <div>
              <label className="label">
                Merujuk ke PO Nomor
                <span className="text-slate-400 font-normal ml-1">(opsional, bisa pilih beberapa)</span>
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
          </>
        )}

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
function ExpenseViewModal({ item, onClose, onEdit }) {
  if (!item) return null;

  const wasEdited = item.updated_at && item.updated_at !== item.created_at;

  return (
    <Modal open={!!item} onClose={onClose} title="Detail Expense" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Info Umum */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Umum</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Kode Expense" value={
              item.expense_code
                ? <span className="font-mono font-medium">{item.expense_code}</span>
                : <span className="text-slate-300">—</span>
            } />
            <Field label="Tanggal Terjadi" value={formatDateOnly(item.occurred_date)} />
            <Field label="Pihak" value={subEntityLabel(item.sub_entity)} />
            <Field label="Tipe" value={item.expense_type === 'client' ? 'Client' : 'Non-Client'} />
            <Field label="Nominal" value={<span className="font-mono">{formatIDR(item.amount)}</span>} />
          </dl>
        </section>

        {/* Kategori */}
        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Kategori</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Kategori 1" value={cat1Label(item.category1)} />
          </dl>
        </section>

        {/* Keterangan */}
        {item.notes && (
          <section className="pt-4 border-t border-slate-100">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Keterangan</h3>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.notes}</p>
          </section>
        )}

        {/* Referensi PO & Invoice (opsional) */}
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

        {/* Audit */}
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
            {wasEdited && (
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

function Field({ label, value }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-900">{value}</dd>
    </>
  );
}

// ============= Small components =============
function RadioCard({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors
        ${checked
          ? 'border-brand-600 bg-brand-50 text-brand-800'
          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'}`}
    >
      {label}
    </button>
  );
}

// ============= Helpers =============
function todayISO() {
  // Hari ini di WIB (UTC+7) → YYYY-MM-DD.
  // 'en-CA' locale natively pakai format YYYY-MM-DD.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}
