import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';

export default function Rekening() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'rekening');
  const canEdit = pCanEdit(role, 'rekening');
  const canDelete = pCanDelete(role, 'rekening');

  const [items, setItems] = useState([]);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const bulk = useBulkSelect(items);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async (q = '') => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/rekening', { params: q ? { q } : {} });
      setItems(data.rekening);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const handleDelete = async (it) => {
    if (!confirm(`Hapus rekening ${it.nama_bank} · ${it.nomor_rekening}?`)) return;
    try {
      await api.delete(`/rekening/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Rekening</h1>
          <p className="text-slate-500 mt-1 text-sm">Master data rekening bank. Dipakai untuk Hutang dan Bayar.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/rekening"
              dataKey="rekening"
              filename="rekening"
              params={{ q: search.trim() || undefined }}
              columns={[
                { header: 'Nama Bank', value: (r) => r.nama_bank },
                { header: 'Nomor Rekening', value: (r) => r.nomor_rekening },
                { header: 'Nama Pemilik', value: (r) => r.nama_pemilik },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Rekening</button>}
        </div>
      </div>

      <div className="mb-4">
        <input
          type="search"
          placeholder="Cari nomor, pemilik, atau bank…"
          className="input max-w-md"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/rekening"
          ids={bulk.selectedIds}
          label="Rekening"
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
                  <input type="checkbox"
                    checked={bulk.allSelected(pageIds)}
                    onChange={() => bulk.toggleAll(pageIds)} />
                </th>
              )}
              <th className="text-left px-4 py-3 font-medium">Nama Bank</th>
              <th className="text-left px-4 py-3 font-medium">Nomor Rekening</th>
              <th className="text-left px-4 py-3 font-medium">Nama Pemilik</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={showSelect ? 5 : 4} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={showSelect ? 5 : 4} className="px-4 py-12 text-center text-slate-400">
                {search ? 'Tidak ada rekening yang cocok.' : 'Belum ada data. Klik "Tambah Rekening".'}
              </td></tr>
            )}
            {!loading && pageItems.map((it) => (
              <tr key={it.id} className="hover:bg-slate-50">
                {showSelect && (
                  <td className="px-4 py-3">
                    <input type="checkbox"
                      checked={bulk.isSelected(it.id)}
                      onChange={() => bulk.toggle(it.id)} />
                  </td>
                )}
                <td className="px-4 py-3 text-slate-900">{it.nama_bank}</td>
                <td className="px-4 py-3 font-mono text-slate-900">{it.nomor_rekening}</td>
                <td className="px-4 py-3 text-slate-700">{it.nama_pemilik}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {canEdit && <button onClick={() => setEditing(it)} className="text-brand-700 hover:text-brand-800 font-medium">Edit</button>}
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

      <RekeningFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(search.trim()); }}
      />
    </div>
  );
}

const EMPTY = { nomor_rekening: '', nama_pemilik: '', nama_bank: '' };

function RekeningFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(isEdit ? {
      nomor_rekening: editing.nomor_rekening,
      nama_pemilik:   editing.nama_pemilik,
      nama_bank:      editing.nama_bank,
    } : EMPTY);
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.nomor_rekening.trim()) return setError('Nomor rekening wajib diisi.');
    if (!form.nama_pemilik.trim())   return setError('Nama pemilik wajib diisi.');
    if (!form.nama_bank.trim())      return setError('Nama bank wajib diisi.');
    setSubmitting(true);
    try {
      const payload = {
        nomor_rekening: form.nomor_rekening.trim(),
        nama_pemilik:   form.nama_pemilik.trim(),
        nama_bank:      form.nama_bank.trim(),
      };
      if (isEdit) await api.put(`/rekening/${editing.id}`, payload);
      else        await api.post('/rekening', payload);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Rekening' : 'Tambah Rekening'} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Nomor Rekening <span className="text-red-500">*</span></label>
          <input type="text" required className="input font-mono"
            value={form.nomor_rekening}
            onChange={(e) => setForm((f) => ({ ...f, nomor_rekening: e.target.value }))} />
        </div>
        <div>
          <label className="label">Nama Pemilik Rekening <span className="text-red-500">*</span></label>
          <input type="text" required className="input"
            value={form.nama_pemilik}
            onChange={(e) => setForm((f) => ({ ...f, nama_pemilik: e.target.value }))} />
        </div>
        <div>
          <label className="label">Nama Bank <span className="text-red-500">*</span></label>
          <input type="text" required className="input"
            value={form.nama_bank}
            onChange={(e) => setForm((f) => ({ ...f, nama_bank: e.target.value }))} />
        </div>
        {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
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
