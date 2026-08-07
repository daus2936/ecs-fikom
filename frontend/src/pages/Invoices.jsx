import { useEffect, useState, useCallback, useRef } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import ExportButton from '../components/ExportButton.jsx';
import InvoiceSortButton from '../components/InvoiceSortButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';
import { formatDateTime as fmtDT } from '../lib/format.js';
import { downloadInvoiceTemplate, parseInvoiceExcel } from '../lib/excel-invoice.js';

export default function Invoices() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'invoices');
  const canEdit = pCanEdit(role, 'invoices');
  const canDelete = pCanDelete(role, 'invoices');

  // ---- Import Excel state ----
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);   // { ok: true, count } atau null

  const [invoices, setInvoices] = useState([]);
  const { pageItems, page, setPage, totalPages, total } = usePagination(invoices, 10);
  const bulk = useBulkSelect(invoices);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);
  const colCount = (showSelect ? 1 : 0) + ((canEdit || canDelete) ? 6 : 5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [sortDir, setSortDir] = useState(null); // null|'asc'|'desc' urut Nomor Invoice
  const [editing, setEditing] = useState(null); // null=tutup, 'new'=tambah, object=edit

  const load = useCallback(async (q = '', sort = null) => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (q) params.q = q;
      if (sort === 'asc' || sort === 'desc') { params.sort = 'invoice'; params.dir = sort; }
      const { data } = await api.get('/invoices', { params });
      setInvoices(data.invoices);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Debounce search 300ms + ikut sortDir
  useEffect(() => {
    const t = setTimeout(() => load(search.trim(), sortDir), 300);
    return () => clearTimeout(t);
  }, [search, sortDir, load]);

  const handleDelete = async (inv) => {
    if (!confirm(`Yakin ingin menghapus nomor invoice "${inv.invoice_number}"?\n\nTindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api.delete(`/invoices/${inv.id}`);
      setInvoices((prev) => prev.filter((x) => x.id !== inv.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset input supaya bisa pilih file sama lagi
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    try {
      const { rows } = await parseInvoiceExcel(file);
      if (rows.length === 0) {
        alert('File Excel tidak punya data (atau header tidak cocok). Pastikan ada kolom "invoice_number".');
        return;
      }
      if (!confirm(`Ditemukan ${rows.length} baris. Lanjut import?`)) return;

      const { data } = await api.post('/invoices/import', { rows });
      setImportResult({ ok: true, count: data.imported });
      load(search.trim(), sortDir); // refresh list
    } catch (err) {
      alert('Gagal import:\n\n' + getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nomor Invoice</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Daftar nomor invoice. Nomor di sini akan dijadikan rujukan oleh data lain.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadInvoiceTemplate}
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
          {isAdmin(role) && (
            <ExportButton
              endpoint="/invoices"
              dataKey="invoices"
              filename="nomor-invoice"
              params={{ q: search.trim() || undefined }}
              columns={[
                { header: 'Nomor Invoice', value: (r) => r.invoice_number },
                { header: 'Deskripsi', value: (r) => r.description },
                { header: 'Dibuat Oleh', value: (r) => r.created_by_name || r.created_by_username || '' },
                { header: 'Tanggal Dibuat (WIB)', value: (r) => fmtDT(r.created_at) },
              ]}
            />
          )}
          {canCreate && (
            <button onClick={() => setEditing('new')} className="btn-primary">
              + Tambah Invoice
            </button>
          )}
        </div>
      </div>

      {importResult && (
        <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
          <span>✓ Berhasil import {importResult.count} nomor invoice.</span>
          <button onClick={() => setImportResult(null)} className="text-emerald-700 hover:text-emerald-900 text-xs">✕</button>
        </div>
      )}

      {/* Search + sort */}
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Cari nomor invoice…"
          className="input max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <InvoiceSortButton sortDir={sortDir} onChange={setSortDir} />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/invoices"
          ids={bulk.selectedIds}
          label="Nomor Invoice"
          onClear={bulk.clear}
          onDone={() => { bulk.clear(); load(search.trim(), sortDir); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              {showSelect && (
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" checked={bulk.allSelected(pageIds)} onChange={() => bulk.toggleAll(pageIds)} />
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium w-16">#</th>
              <th className="text-left px-4 py-3 font-medium">Nomor Invoice</th>
              <th className="text-left px-4 py-3 font-medium">Deskripsi</th>
              <th className="text-left px-4 py-3 font-medium">Dibuat Oleh</th>
              <th className="text-left px-4 py-3 font-medium">
                Tanggal Dibuat <span className="text-slate-400 normal-case font-normal">(WIB)</span>
              </th>
              {(canEdit || canDelete) && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
            )}
            {!loading && invoices.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-slate-400">
                  {search ? 'Tidak ada invoice yang cocok.' : 'Belum ada invoice. Klik "Tambah Invoice" untuk membuat.'}
                </td>
              </tr>
            )}
            {!loading && pageItems.map((inv, idx) => (
              <tr key={inv.id} className="hover:bg-slate-50 align-top">
                {showSelect && (
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={bulk.isSelected(inv.id)} onChange={() => bulk.toggle(inv.id)} />
                  </td>
                )}
                <td className="px-4 py-3 text-slate-400">{(page - 1) * 10 + idx + 1}</td>
                <td className="px-4 py-3 font-mono font-medium text-slate-900">
                  {inv.invoice_number}
                </td>
                <td className="px-4 py-3 text-slate-600 max-w-md">
                  {inv.description
                    ? <span className="line-clamp-2 whitespace-pre-wrap">{inv.description}</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {inv.created_by_name || <span className="text-slate-300">—</span>}
                  {inv.created_by_username && (
                    <span className="text-slate-400 text-xs ml-1.5">@{inv.created_by_username}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{formatDateTime(inv.created_at)}</td>
                {(canEdit || canDelete) && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canEdit && (
                      <button
                        onClick={() => setEditing(inv)}
                        className="text-brand-700 hover:text-brand-800 font-medium"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(inv)}
                        className="text-red-600 hover:text-red-700 font-medium ml-3"
                      >
                        Hapus
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />}
      </div>

      <InvoiceFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(search.trim(), sortDir); }}
      />
    </div>
  );
}

// =====================================================
// Modal: Create / Edit Invoice
// =====================================================
function InvoiceFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setInvoiceNumber(isEdit ? (editing.invoice_number || '') : '');
    setDescription(isEdit ? (editing.description || '') : '');
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        invoice_number: invoiceNumber.trim(),
        description: description.trim() || undefined,
      };
      if (isEdit) await api.put(`/invoices/${editing.id}`, payload);
      else        await api.post('/invoices', payload);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Nomor Invoice' : 'Tambah Invoice'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Nomor Invoice <span className="text-red-500">*</span></label>
          <input
            type="text"
            required
            maxLength={100}
            autoFocus
            className="input font-mono"
            placeholder="contoh: INV-2026-001"
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Format bebas. Nomor harus unik (belum pernah digunakan sebelumnya).
          </p>
        </div>

        <div>
          <label className="label">
            Deskripsi Invoice <span className="text-slate-400 font-normal">(opsional)</span>
          </label>
          <textarea
            rows={3}
            maxLength={1000}
            className="input"
            placeholder="Detail tambahan tentang invoice ini…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">Maks. 1000 karakter.</p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={submitting || !invoiceNumber.trim()} className="btn-primary">
            {submitting ? 'Menyimpan…' : (isEdit ? 'Simpan Perubahan' : 'Simpan')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
