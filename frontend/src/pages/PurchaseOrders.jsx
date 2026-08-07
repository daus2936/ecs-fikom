import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateTime } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';

export default function PurchaseOrders() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'purchase-orders');
  const canEdit = pCanEdit(role, 'purchase-orders');
  const canDelete = pCanDelete(role, 'purchase-orders');
  const showActions = canEdit || canDelete;

  const [pos, setPos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // 'new' | po object | null

  const { pageItems, page, setPage, totalPages, total } = usePagination(pos, 10);
  const bulk = useBulkSelect(pos);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/purchase-orders', { params: q ? { q } : {} });
      setPos(data.purchase_orders);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleDelete = async (po) => {
    if (!confirm(`Yakin ingin menghapus nomor PO "${po.po_number}"?\n\nTindakan ini tidak bisa dibatalkan.`)) return;
    try {
      await api.delete(`/purchase-orders/${po.id}`);
      setPos((prev) => prev.filter((x) => x.id !== po.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const colCount = (showSelect ? 1 : 0) + (showActions ? 5 : 4);

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Nomor Purchase Order (PO)</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Daftar nomor PO. Nomor di sini akan dijadikan rujukan oleh data lain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/purchase-orders"
              dataKey="purchase_orders"
              filename="nomor-po"
              params={{ q: search.trim() || undefined }}
              columns={[
                { header: 'Nomor PO', value: (r) => r.po_number },
                { header: 'Dibuat Oleh', value: (r) => r.created_by_name || r.created_by_username || '' },
                { header: 'Tanggal Dibuat (WIB)', value: (r) => formatDateTime(r.created_at) },
              ]}
            />
          )}
          {canCreate && (
            <button onClick={() => setEditing('new')} className="btn-primary">
              + Tambah PO
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Cari nomor PO…"
          className="input max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/purchase-orders"
          ids={bulk.selectedIds}
          label="Nomor PO"
          onClear={bulk.clear}
          onDone={() => { bulk.clear(); load(search.trim()); }}
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
              <th className="text-left px-4 py-3 font-medium">Nomor PO</th>
              <th className="text-left px-4 py-3 font-medium">Dibuat Oleh</th>
              <th className="text-left px-4 py-3 font-medium">
                Tanggal Dibuat <span className="text-slate-400 normal-case font-normal">(WIB)</span>
              </th>
              {showActions && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={colCount} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
            )}
            {!loading && pos.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-slate-400">
                  {search ? 'Tidak ada PO yang cocok.' : 'Belum ada PO. Klik "Tambah PO" untuk membuat.'}
                </td>
              </tr>
            )}
            {!loading && pageItems.map((po, idx) => (
              <tr key={po.id} className="hover:bg-slate-50">
                {showSelect && (
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={bulk.isSelected(po.id)} onChange={() => bulk.toggle(po.id)} />
                  </td>
                )}
                <td className="px-4 py-3 text-slate-400">{(page - 1) * 10 + idx + 1}</td>
                <td className="px-4 py-3 font-mono font-medium text-slate-900">
                  {po.po_number}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {po.created_by_name || <span className="text-slate-300">—</span>}
                  {po.created_by_username && (
                    <span className="text-slate-400 text-xs ml-1.5">@{po.created_by_username}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(po.created_at)}</td>
                {showActions && (
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canEdit && (
                      <button
                        onClick={() => setEditing(po)}
                        className="text-brand-700 hover:text-brand-800 font-medium"
                      >
                        Edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => handleDelete(po)}
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
        {!loading && (
          <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
        )}
      </div>

      <PoFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(search.trim()); }}
      />
    </div>
  );
}

// =====================================================
// Modal: Create / Edit PO (input nomor PO saja)
// =====================================================
function PoFormModal({ editing, onClose, onSaved }) {
  const isEdit = editing && editing !== 'new';
  const [poNumber, setPoNumber] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (editing) {
      setPoNumber(isEdit ? editing.po_number : '');
      setError('');
    }
  }, [editing, isEdit]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (isEdit) {
        await api.put(`/purchase-orders/${editing.id}`, { po_number: poNumber.trim() });
      } else {
        await api.post('/purchase-orders', { po_number: poNumber.trim() });
      }
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!editing} onClose={onClose} title={isEdit ? 'Edit Purchase Order' : 'Tambah Purchase Order'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Nomor PO <span className="text-red-500">*</span></label>
          <input
            type="text"
            required
            maxLength={100}
            autoFocus
            className="input font-mono"
            placeholder="contoh: PO-2026-001"
            value={poNumber}
            onChange={(e) => setPoNumber(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Format bebas. Nomor harus unik (belum pernah digunakan sebelumnya).
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={submitting || !poNumber.trim()} className="btn-primary">
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
