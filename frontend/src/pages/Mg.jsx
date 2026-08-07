import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import {
  SUB_ENTITIES, CATEGORY1, CATEGORY3,
  getSubEntitiesByType, getCategory1Options, isCategory1ValidFor, isCategory3Applicable,
  subEntityLabel, cat1Label, cat3Label,
} from '../lib/expense-constants.js';
import { downloadMgTemplate, parseMgExcel } from '../lib/excel-mg.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';
import InvoiceSortButton from '../components/InvoiceSortButton.jsx';

// =====================================================
// Halaman utama
// =====================================================
export default function Mg() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'expenses');
  const canEdit = pCanEdit(role, 'expenses');
  const canDelete = pCanDelete(role, 'expenses');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total_amount: 0, count: 0 });
  const [showTotal, setShowTotal] = useState(false);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const bulk = useBulkSelect(items);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ---- Filter multiple-select ----
  const [fSubEntities, setFSubEntities] = useState([]); // array kode sub_entity
  const [fUntukSiapa, setFUntukSiapa]   = useState([]); // array untuk_siapa (Pm/Put/Led/Others)
  const [fCategory1, setFCategory1]     = useState([]); // array kode kategori1
  const [fCategory3, setFCategory3]     = useState([]); // array kode kategori3
  const [fPoIds, setFPoIds]             = useState([]); // array id PO
  const [fInvoiceIds, setFInvoiceIds]   = useState([]); // array id invoice
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDir, setSortDir] = useState(null); // urut Nomor Invoice: null|asc|desc
  // Options untuk filter PO & Invoice (di-load sekali saat mount)
  const [filterPoOptions, setFilterPoOptions] = useState([]);
  const [filterInvOptions, setFilterInvOptions] = useState([]);
  const [editing, setEditing] = useState(null); // null=tutup, 'new'=buat baru, object=edit
  const [viewing, setViewing] = useState(null); // detail modal
  // Import Excel
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Opsi dropdown filter (dari constants — gabungan semua, lintas tipe)
  const subEntityOptions = useMemo(
    () => Object.entries(SUB_ENTITIES).map(([code, def]) => ({ value: code, label: def.label })),
    []
  );
  const category1Options = useMemo(
    () => Object.entries(CATEGORY1).map(([code, label]) => ({ value: code, label })),
    []
  );
  const category3Options = useMemo(
    () => Object.entries(CATEGORY3).map(([code, label]) => ({ value: code, label })),
    []
  );

  // ---- Import Excel state ----

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.sub_entities?.length) params.sub_entities = filters.sub_entities.join(',');
      if (filters.untuk_siapa?.length)  params.untuk_siapa  = filters.untuk_siapa.join(',');
      if (filters.category1?.length)    params.category1    = filters.category1.join(',');
      if (filters.category3?.length)    params.category3    = filters.category3.join(',');
      if (filters.po_ids?.length)       params.po_ids       = filters.po_ids.join(',');
      if (filters.invoice_ids?.length)  params.invoice_ids  = filters.invoice_ids.join(',');
      if (filters.date_from)            params.date_from    = filters.date_from;
      if (filters.date_to)              params.date_to      = filters.date_to;
      if (filters.sort === 'asc' || filters.sort === 'desc') { params.sort = 'invoice'; params.dir = filters.sort; }
      const { data } = await api.get('/mg', { params });
      setItems(data.mg);
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
      untuk_siapa:  fUntukSiapa,
      category1:    fCategory1,
      category3:    fCategory3,
      po_ids:       fPoIds,
      invoice_ids:  fInvoiceIds,
      date_from:    dateFrom,
      date_to:      dateTo,
      sort:         sortDir,
    }), 300);
    return () => clearTimeout(t);
  }, [fSubEntities, fUntukSiapa, fCategory1, fCategory3, fPoIds, fInvoiceIds, dateFrom, dateTo, sortDir, load]);

  const hasActiveFilter = Boolean(
    fSubEntities.length || fUntukSiapa.length || fCategory1.length || fCategory3.length ||
    fPoIds.length || fInvoiceIds.length || dateFrom || dateTo
  );
  const dateRangeInvalid = dateFrom && dateTo && dateFrom > dateTo;
  const resetFilters = () => {
    setFSubEntities([]);
    setFUntukSiapa([]);
    setFCategory1([]);
    setFCategory3([]);
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
      await api.delete(`/mg/${it.id}`);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const currentFilters = () => ({
    sub_entities: fSubEntities,
    untuk_siapa:  fUntukSiapa,
    category1:    fCategory1,
    category3:    fCategory3,
    po_ids:       fPoIds,
    invoice_ids:  fInvoiceIds,
    date_from:    dateFrom,
    date_to:      dateTo,
    sort:         sortDir,
  });

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const { rows } = await parseMgExcel(file);
      if (rows.length === 0) {
        alert('File Excel tidak punya data atau header tidak cocok. Pastikan kolom "occurred_date" terisi.');
        return;
      }
      if (!confirm(`Ditemukan ${rows.length} baris. Lanjut import?`)) return;
      const { data } = await api.post('/mg/import', { rows });
      setImportResult({ ok: true, count: data.imported, codes: data.codes });
      load(currentFilters());
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
          <h1 className="text-2xl font-bold text-slate-900">Mg</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Daftar Mg. Hanya admin/superadmin.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadMgTemplate}
            className="btn-secondary"
            title="Download template Excel untuk import (sudah berisi contoh value)"
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
          {isAdmin(role) && (
            <ExportButton
              endpoint="/mg"
              dataKey="mg"
              filename="mg"
              params={{
                sub_entities: fSubEntities.length ? fSubEntities.join(',') : undefined,
                untuk_siapa:  fUntukSiapa.length ? fUntukSiapa.join(',') : undefined,
                category1:    fCategory1.length ? fCategory1.join(',') : undefined,
                category3:    fCategory3.length ? fCategory3.join(',') : undefined,
                po_ids:       fPoIds.length ? fPoIds.join(',') : undefined,
                invoice_ids:  fInvoiceIds.length ? fInvoiceIds.join(',') : undefined,
                date_from:    dateFrom || undefined,
                date_to:      dateTo || undefined,
              }}
              columns={[
                { header: 'Kode Mg', value: (r) => r.mg_code },
                { header: 'Tanggal', value: (r) => formatDateOnly(r.occurred_date) },
                { header: 'Untuk Siapa', value: (r) => r.untuk_siapa },
                { header: 'Client / Non-Client', value: (r) => subEntityLabel(r.sub_entity) },
                { header: 'Kategori 1', value: (r) => cat1Label(r.category1) },
                { header: 'Kategori 3', value: (r) => (r.category3 ? cat3Label(r.category3) : '') },
                { header: 'Nominal', value: (r) => Number(r.amount) },
                { header: 'Nomor PO', value: (r) => (r.purchase_orders || []).map((p) => p.po_number).join(', ') },
                { header: 'Nomor Invoice', value: (r) => (r.invoices || []).map((i) => i.invoice_number).join(', ') },
                { header: 'Catatan', value: (r) => r.notes },
                { header: 'Tanggal Input (WIB)', value: (r) => formatDateTime(r.created_at) },
              ]}
            />
          )}
          {canCreate && (
            <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Mg</button>
          )}
        </div>
      </div>

      {importResult && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
          <span>✓ Berhasil import {importResult.count} data Mg{importResult.codes?.length > 0 ? ` (kode: ${importResult.codes.slice(0, 3).join(', ')}${importResult.codes.length > 3 ? '…' : ''})` : ''}.</span>
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
            <label className="label">Untuk Siapa</label>
            <MultiSearchSelect
              options={[
                { value: 'Pm', label: 'Pm' },
                { value: 'Put', label: 'Put' },
                { value: 'Led', label: 'Led' },
                { value: 'Others', label: 'Others' },
              ]}
              selected={fUntukSiapa}
              onChange={setFUntukSiapa}
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
        <div className="mt-3 flex items-center gap-2">
          <InvoiceSortButton sortDir={sortDir} onChange={setSortDir} />
          {hasActiveFilter && (
            <button type="button" onClick={resetFilters} className="btn-secondary">
              Reset Filter
            </button>
          )}
        </div>
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

      {/* summary-total-banner: total per "Untuk Siapa" */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm text-emerald-800">
            <span className="font-medium">Total Nominal per "Untuk Siapa"</span>
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
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {['Pm', 'Put', 'Led', 'Others'].map((key) => (
              <div key={key} className="bg-white border border-emerald-200 rounded-lg px-3 py-2">
                <div className="text-xs text-emerald-700">{key}</div>
                <div className="text-sm font-bold text-emerald-900 font-mono mt-0.5">
                  {formatIDR(summary.untuk_siapa?.[key] || 0)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/mg"
          ids={bulk.selectedIds}
          label="Mg"
          onClear={bulk.clear}
          onDone={() => { bulk.clear(); load({ sub_entities: fSubEntities, untuk_siapa: fUntukSiapa, category1: fCategory1, category3: fCategory3, po_ids: fPoIds, invoice_ids: fInvoiceIds, date_from: dateFrom, date_to: dateTo, sort: sortDir }); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {showSelect && (<th className="px-4 py-3 w-10"><input type="checkbox" checked={bulk.allSelected(pageIds)} onChange={() => bulk.toggleAll(pageIds)} /></th>)}
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Untuk Siapa</th>
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
                <tr><td colSpan={showSelect ? 11 : 10} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 11 : 10} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data. Klik "Tambah Mg" untuk membuat.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-slate-700 font-medium">
                    {it.mg_code || <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-900">
                    {formatDateOnly(it.occurred_date)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">{it.untuk_siapa}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{subEntityLabel(it.sub_entity)}</div>
                    <div className="text-xs text-slate-400">
                      {it.expense_type === 'client' ? 'Client' : 'Non-Client'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{cat1Label(it.category1)}</div>
                    {it.category3 && <div className="text-xs text-slate-500">↳ {it.category3}</div>}
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

      <MgFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load({
            sub_entities: fSubEntities,
            untuk_siapa:  fUntukSiapa,
            category1:    fCategory1,
            category3:    fCategory3,
            po_ids:       fPoIds,
            invoice_ids:  fInvoiceIds,
            date_from:    dateFrom,
            date_to:      dateTo,
            sort:         sortDir,
          });
        }}
      />
      <MgViewModal
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
  untuk_siapa: '',
  expense_type: '',
  sub_entity: '',
  category1: '',
  category3: '',
  amount: 0,
  notes: '',
  purchase_order_ids: [],
  invoice_ids: [],
};

function MgFormModal({ editing, onClose, onSaved }) {
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
        untuk_siapa:    editing.untuk_siapa || '',
        expense_type:   editing.expense_type,
        sub_entity:     editing.sub_entity,
        category1:      editing.category1,
        category3:      editing.category3 || '',
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
  // Tipe berubah → reset sub_entity, category1 (kalau tidak valid), category3,
  // dan PO/Invoice refs kalau jadi non_client.
  const setExpenseType = (type) => {
    setForm((f) => {
      const cat1StillValid = isCategory1ValidFor(f.category1, type);
      return {
        ...f,
        expense_type: type,
        sub_entity: '',
        category1: cat1StillValid ? f.category1 : '',
        category3: '',
        // PO & Invoice opsional untuk semua tipe — tidak di-reset saat ganti tipe.
      };
    });
  };

  // Sub-entity berubah → reset category3 (karena cat3 hanya berlaku utk Biersdorf)
  const setSubEntity = (subCode) => {
    setForm((f) => ({
      ...f,
      sub_entity: subCode,
      category3: '', // selalu reset; user re-pick kalau Biersdorf
    }));
  };

  // Kategori 1 berubah → tidak ada cascade lagi (category2 sudah dihapus)
  const setCategory1 = (code) => {
    setForm((f) => ({ ...f, category1: code }));
  };

  // ----- Derived state -----
  const subEntityOptions = useMemo(
    () => (form.expense_type ? getSubEntitiesByType(form.expense_type) : []),
    [form.expense_type]
  );
  const category1Options = useMemo(
    () => getCategory1Options(form.expense_type),
    [form.expense_type]
  );
  const showCategory3 = isCategory3Applicable(form.sub_entity);
  // Untuk Gaji + Biersdorf: kategori 3 wajib.
  // Untuk non-Gaji + Biersdorf: kategori 3 opsional.
  const cat3Required = showCategory3 && form.category1 === 'gaji';

  // ----- Validation -----
  const validate = () => {
    if (!form.occurred_date)         return 'Tanggal wajib diisi.';
    if (!form.untuk_siapa)           return 'Pilih "Untuk Siapa".';
    if (!form.expense_type)          return 'Pilih Client atau Non-Client.';
    if (!form.sub_entity)            return form.expense_type === 'client'
      ? 'Pilih client.'
      : 'Pilih Internal KBSI atau Internal SMI.';
    if (!form.category1)             return 'Pilih kategori 1.';
    if (cat3Required && !form.category3) return 'Pilih kategori 3 (NMA/BMC/KPL).';
    if (!(form.amount > 0))          return 'Nominal harus lebih dari 0.';
    // Nomor PO & Invoice OPSIONAL — tidak ada validasi wajib.
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
      untuk_siapa:    form.untuk_siapa,
      expense_type:   form.expense_type,
      sub_entity:     form.sub_entity,
      category1:      form.category1,
      category3:      showCategory3 && form.category3 ? form.category3 : null,
      amount:         form.amount,
      notes:          form.notes.trim() || null,
      purchase_order_ids: form.purchase_order_ids,
      invoice_ids:        form.invoice_ids,
    };

    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/mg/${editing.id}`, payload);
      } else {
        await api.post('/mg', payload);
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
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Mg' : 'Tambah Mg'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-5">
        {/* 1. Tanggal */}
        <div>
          <label className="label">Tanggal <span className="text-red-500">*</span></label>
          <input
            type="date"
            required
            className="input"
            value={form.occurred_date}
            onChange={(e) => setForm((f) => ({ ...f, occurred_date: e.target.value }))}
          />
        </div>

        {/* 1b. Untuk Siapa */}
        <div>
          <label className="label">Untuk Siapa <span className="text-red-500">*</span></label>
          <select
            required
            className="input"
            value={form.untuk_siapa}
            onChange={(e) => setForm((f) => ({ ...f, untuk_siapa: e.target.value }))}
          >
            <option value="">— Pilih —</option>
            <option value="Pm">Pm</option>
            <option value="Put">Put</option>
            <option value="Led">Led</option>
            <option value="Others">Others</option>
          </select>
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

        {/* 4. Kategori 1 — daftar tergantung tipe */}
        {form.expense_type && (
          <div>
            <label className="label">Kategori 1 <span className="text-red-500">*</span></label>
            <select
              required
              className="input"
              value={form.category1}
              onChange={(e) => setCategory1(e.target.value)}
            >
              <option value="">— Pilih —</option>
              {category1Options.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* 5. Kategori 3 — hanya untuk Biersdorf.
            Wajib jika Gaji + Biersdorf, opsional kalau bukan Gaji. */}
        {showCategory3 && form.category1 && (
          <div>
            <label className="label">
              Kategori 3
              {cat3Required
                ? <span className="text-red-500"> *</span>
                : <span className="text-slate-400 font-normal"> (opsional)</span>}
            </label>
            <select
              required={cat3Required}
              className="input"
              value={form.category3}
              onChange={(e) => setForm((f) => ({ ...f, category3: e.target.value }))}
            >
              <option value="">{cat3Required ? '— Pilih —' : '— Tidak dipilih —'}</option>
              {Object.entries(CATEGORY3).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </div>
        )}

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
function MgViewModal({ item, onClose, onEdit }) {
  if (!item) return null;

  const wasEdited = item.updated_at && item.updated_at !== item.created_at;

  return (
    <Modal open={!!item} onClose={onClose} title="Detail Mg" maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Info Umum */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Umum</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Kode Mg" value={
              item.mg_code
                ? <span className="font-mono font-medium">{item.mg_code}</span>
                : <span className="text-slate-300">—</span>
            } />
            <Field label="Tanggal Terjadi" value={formatDateOnly(item.occurred_date)} />
            <Field label="Untuk Siapa" value={item.untuk_siapa} />
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
            {item.category3 && <Field label="Kategori 3" value={cat3Label(item.category3)} />}
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
