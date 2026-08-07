import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import {
  CATEGORY3,
  getClientOptions, subEntityLabel, cat3Label,
} from '../lib/expense-constants.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';
import InvoiceSortButton from '../components/InvoiceSortButton.jsx';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';

const CLIENT_OPTIONS = getClientOptions();

// =====================================================
// Halaman utama
// =====================================================
export default function Payments() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'payments');
  const canEdit = pCanEdit(role, 'payments');
  const canDelete = pCanDelete(role, 'payments');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total_amount: 0, count: 0 });
  const [showTotal, setShowTotal] = useState(false);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const bulk = useBulkSelect(items);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortDir, setSortDir] = useState(null); // urut Nomor Invoice: null|asc|desc
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (filters.q)         params.q         = filters.q;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      if (filters.sort === 'asc' || filters.sort === 'desc') { params.sort = 'invoice'; params.dir = filters.sort; }
      const { data } = await api.get('/payments', { params });
      setItems(data.payments);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load({ q: search.trim(), date_from: dateFrom, date_to: dateTo, sort: sortDir }), 300);
    return () => clearTimeout(t);
  }, [search, dateFrom, dateTo, sortDir, load]);

  const hasActiveFilter = Boolean(search || dateFrom || dateTo);
  const resetFilters = () => { setSearch(''); setDateFrom(''); setDateTo(''); };

  const handleDelete = async (it) => {
    const msg =
      `Yakin ingin menghapus Payment ini?\n\n` +
      `Tanggal: ${formatDateOnly(it.payment_date)}\n` +
      `Client : ${subEntityLabel(it.sub_entity)}\n` +
      `Nominal: ${formatIDR(it.amount)}\n\n` +
      `Tindakan ini tidak bisa dibatalkan.`;
    if (!confirm(msg)) return;
    try {
      await api.delete(`/payments/${it.id}`);
      setItems((prev) => prev.filter((x) => x.id !== it.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Catatan pembayaran masuk dari client. Bisa dirujuk ke invoice yang sudah ada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/payments"
              dataKey="payments"
              filename="payment"
              params={{
                q:         search.trim() || undefined,
                date_from: dateFrom || undefined,
                date_to:   dateTo || undefined,
              }}
              columns={[
                { header: 'Tanggal', value: (r) => formatDateOnly(r.payment_date) },
                { header: 'Client', value: (r) => subEntityLabel(r.sub_entity) },
                { header: 'Kategori 3', value: (r) => (r.category3 ? cat3Label(r.category3) : '') },
                { header: 'Nominal', value: (r) => Number(r.amount) },
                { header: 'Nomor Invoice', value: (r) => (r.invoices || []).map((i) => i.invoice_number).join(', ') },
                { header: 'Tanggal Input (WIB)', value: (r) => formatDateTime(r.created_at) },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Payment</button>}
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[240px]">
            <label className="label">Cari</label>
            <input
              type="search"
              placeholder="Nomor invoice atau nama client…"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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

      {/* summary-total-banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-emerald-800">
          <span className="font-medium">Total Nominal Payment</span>
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

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/payments"
          ids={bulk.selectedIds}
          label="Payment"
          onClear={bulk.clear}
          onDone={() => { bulk.clear(); load({ q: search.trim(), date_from: dateFrom, date_to: dateTo, sort: sortDir }); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                {showSelect && (<th className="px-4 py-3 w-10"><input type="checkbox" checked={bulk.allSelected(pageIds)} onChange={() => bulk.toggleAll(pageIds)} /></th>)}
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal Masuk</th>
                <th className="text-left px-4 py-3 font-medium">Client</th>
                <th className="text-left px-4 py-3 font-medium">Kategori</th>
                <th className="text-right px-4 py-3 font-medium">Nominal</th>
                <th className="text-left px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={showSelect ? 7 : 6} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>
              )}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 7 : 6} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data. Klik "Tambah Payment" untuk membuat.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 whitespace-nowrap text-slate-900">{formatDateOnly(it.payment_date)}</td>
                  <td className="px-4 py-3 text-slate-900">{subEntityLabel(it.sub_entity)}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {it.category3
                      ? <span>{cat3Label(it.category3)}</span>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono whitespace-nowrap text-slate-900">{formatIDR(it.amount)}</td>
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
                    {canEdit && <button onClick={() => setEditing(it)} className="text-brand-700 hover:text-brand-800 font-medium ml-3">Edit</button>}
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

      <PaymentFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          load({ q: search.trim(), date_from: dateFrom, date_to: dateTo, sort: sortDir });
        }}
      />
      <PaymentViewModal
        item={viewing}
        onClose={() => setViewing(null)}
        onEdit={canEdit ? (it) => { setViewing(null); setEditing(it); } : undefined}
      />
    </div>
  );
}

// =====================================================
// Modal: Tambah/Edit Payment
// =====================================================
const EMPTY_FORM = {
  payment_date: todayISO(),
  sub_entity: '',
  category3: '',
  amount: 0,
  invoice_ids: [],
};

function PaymentFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';

  const [form, setForm] = useState(EMPTY_FORM);
  const [invOptions, setInvOptions] = useState([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (isEdit) {
      setForm({
        payment_date: editing.payment_date?.slice(0, 10) || todayISO(),
        sub_entity:  editing.sub_entity,
        category3:   editing.category3 || '',
        amount:      Number(editing.amount) || 0,
        invoice_ids: editing.invoices.map((i) => i.id),
      });
    } else {
      setForm(EMPTY_FORM);
    }

    setOptionsLoading(true);
    api.get('/invoices')
      .then(({ data }) => {
        setInvOptions(data.invoices.map((i) => ({ value: i.id, label: i.invoice_number })));
      })
      .catch((err) => setError('Gagal memuat daftar invoice: ' + getErrorMessage(err)))
      .finally(() => setOptionsLoading(false));
  }, [open, isEdit, editing]);

  const showCategory3 = form.sub_entity === 'BIERSDORF';

  const setSubEntity = (code) => {
    setForm((f) => ({ ...f, sub_entity: code, category3: '' }));
  };

  const validate = () => {
    if (!form.payment_date) return 'Tanggal payment wajib diisi.';
    if (!form.sub_entity)   return 'Pilih Client.';
    if (form.sub_entity === 'BIERSDORF' && !form.category3) {
      return 'Kategori 3 (NMA/BMC/KPL) wajib diisi untuk PT Biersdorf Indonesia.';
    }
    if (!(form.amount > 0)) return 'Nominal harus lebih dari 0.';
    return null;
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const v = validate();
    if (v) { setError(v); return; }

    const payload = {
      payment_date: form.payment_date,
      sub_entity:   form.sub_entity,
      category3:    showCategory3 && form.category3 ? form.category3 : null,
      amount:       Number(form.amount),
      invoice_ids:  form.invoice_ids,
    };

    setSubmitting(true);
    try {
      if (isEdit) await api.put(`/payments/${editing.id}`, payload);
      else        await api.post('/payments', payload);
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
      title={isEdit ? 'Edit Payment' : 'Tambah Payment'}
      maxWidth="max-w-2xl">
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
            <label className="label">Tanggal Payment Masuk <span className="text-red-500">*</span></label>
            <input type="date" required className="input"
              value={form.payment_date}
              onChange={(e) => setForm((f) => ({ ...f, payment_date: e.target.value }))} />
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
          <label className="label">Nominal Payment (Rupiah) <span className="text-red-500">*</span></label>
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
function PaymentViewModal({ item, onClose, onEdit }) {
  if (!item) return null;
  const wasEdited = item.updated_at && item.updated_at !== item.created_at;

  return (
    <Modal open={!!item} onClose={onClose} title="Detail Payment" maxWidth="max-w-2xl">
      <div className="space-y-5">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Umum</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Tanggal Payment Masuk" value={formatDateOnly(item.payment_date)} />
            <Field label="Client" value={subEntityLabel(item.sub_entity)} />
            {item.category3 && <Field label="Kategori 3" value={cat3Label(item.category3)} />}
            <Field label="Nominal" value={<span className="font-mono font-medium">{formatIDR(item.amount)}</span>} />
          </dl>
        </section>

        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Referensi Invoice</h3>
          {item.invoices.length === 0 ? (
            <p className="text-sm text-slate-400">— Tidak ada invoice yang dirujuk —</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {item.invoices.map((i) => (
                <span key={i.id} className="badge bg-slate-100 text-slate-700 font-mono">{i.invoice_number}</span>
              ))}
            </div>
          )}
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

// ============= Small components =============
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
