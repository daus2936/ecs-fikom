import { useEffect, useState, useCallback, useRef } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';

// Catatan: URL foto sekarang dikirim backend sebagai field `foto_url`
// (presigned URL kalau STORAGE_DRIVER=s3, atau URL statik kalau local).
// Frontend tidak lagi menyusun URL sendiri.

export default function SaldoBank() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'saldo-bank');
  const canEdit = pCanEdit(role, 'saldo-bank');
  const canDelete = pCanDelete(role, 'saldo-bank');

  const [items, setItems] = useState([]);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const bulk = useBulkSelect(items);
  const showSelect = isAdmin(role);
  const pageIds = pageItems.map((it) => it.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [previewPhoto, setPreviewPhoto] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/saldo-bank');
      setItems(data.saldo_bank);
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (it) => {
    if (!confirm(`Hapus saldo ${formatDateOnly(it.tanggal_sisa_saldo)} (${formatIDR(it.nominal)})?`)) return;
    try {
      await api.delete(`/saldo-bank/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Saldo Bank</h1>
          <p className="text-slate-500 mt-1 text-sm">Catatan saldo bank disertai foto bukti.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/saldo-bank"
              dataKey="saldo_bank"
              filename="saldo-bank"
              columns={[
                { header: 'Tanggal Saldo', value: (r) => formatDateOnly(r.tanggal_sisa_saldo) },
                { header: 'Nominal', value: (r) => Number(r.nominal) },
                { header: 'Ada Foto', value: (r) => (r.foto_filename ? 'Ya' : 'Tidak') },
                { header: 'Nama File Foto', value: (r) => r.foto_original_name || '' },
                { header: 'Dibuat Oleh', value: (r) => r.created_by_name || r.created_by_username || '' },
                { header: 'Tanggal Input (WIB)', value: (r) => formatDateTime(r.created_at) },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Saldo</button>}
        </div>
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/saldo-bank"
          ids={bulk.selectedIds}
          label="Saldo Bank"
          onClear={bulk.clear}
          onDone={() => { bulk.clear(); load(); }}
        />
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
                {showSelect && (<th className="px-4 py-3 w-10"><input type="checkbox" checked={bulk.allSelected(pageIds)} onChange={() => bulk.toggleAll(pageIds)} /></th>)}
              <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
              <th className="text-right px-4 py-3 font-medium">Nominal</th>
              <th className="text-left px-4 py-3 font-medium">Foto</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && <tr><td colSpan={showSelect ? 5 : 4} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={showSelect ? 5 : 4} className="px-4 py-12 text-center text-slate-400">Belum ada data.</td></tr>
            )}
            {!loading && pageItems.map((it) => {
              const url = it.foto_url;
              return (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateOnly(it.tanggal_sisa_saldo)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 whitespace-nowrap">{formatIDR(it.nominal)}</td>
                  <td className="px-4 py-3">
                    {url ? (
                      <button
                        type="button"
                        onClick={() => setPreviewPhoto({ url, name: it.foto_original_name, tanggal: it.tanggal_sisa_saldo, nominal: it.nominal })}
                        className="block"
                      >
                        <img
                          src={url}
                          alt="Foto saldo"
                          className="h-16 w-16 object-cover rounded border border-slate-200 hover:border-brand-500 cursor-pointer transition-colors"
                        />
                      </button>
                    ) : (
                      <span className="text-slate-400 text-sm">— tanpa foto</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {canEdit && <button onClick={() => setEditing(it)} className="text-brand-700 hover:text-brand-800 font-medium">Edit</button>}
                    {canDelete && <button onClick={() => handleDelete(it)} className="text-red-600 hover:text-red-700 font-medium ml-3">Hapus</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />}
      </div>

      <SaldoBankFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />

      {/* Preview foto full-size */}
      {previewPhoto && (
        <Modal open={!!previewPhoto} onClose={() => setPreviewPhoto(null)}
          title={`Foto Saldo · ${formatDateOnly(previewPhoto.tanggal)} · ${formatIDR(previewPhoto.nominal)}`}
          maxWidth="max-w-4xl">
          <img src={previewPhoto.url} alt="Foto saldo" className="w-full rounded-lg" />
          {previewPhoto.name && (
            <p className="text-xs text-slate-500 mt-2">File asli: {previewPhoto.name}</p>
          )}
        </Modal>
      )}
    </div>
  );
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

function SaldoBankFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [tanggal, setTanggal] = useState(todayISO());
  const [nominal, setNominal] = useState(0);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setError(''); setFile(null); setFilePreview(null);
    if (isEdit) {
      setTanggal(editing.tanggal_sisa_saldo?.slice(0, 10) || todayISO());
      setNominal(Number(editing.nominal) || 0);
    } else {
      setTanggal(todayISO());
      setNominal(0);
    }
  }, [open, isEdit, editing]);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Foto harus JPG, PNG, atau WEBP.');
      e.target.value = ''; return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError('Ukuran foto melebihi 5MB.');
      e.target.value = ''; return;
    }
    setError('');
    setFile(f);
    setFilePreview(URL.createObjectURL(f));
  };

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!tanggal) return setError('Tanggal wajib diisi.');
    if (!(nominal >= 0)) return setError('Nominal harus >= 0.');
    // Foto OPSIONAL — tidak wajib di-upload.

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('tanggal_sisa_saldo', tanggal);
      fd.append('nominal', String(nominal));
      if (file) fd.append('foto', file);

      if (isEdit) {
        await api.put(`/saldo-bank/${editing.id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      } else {
        await api.post('/saldo-bank', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  const existingUrl = isEdit && !filePreview ? (editing.foto_url || null) : null;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Saldo Bank' : 'Tambah Saldo Bank'} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Tanggal Sisa Saldo <span className="text-red-500">*</span></label>
          <input type="date" required className="input"
            value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </div>
        <div>
          <label className="label">Nominal (Rupiah) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <input type="text" inputMode="numeric" required className="input pl-10 font-mono"
              value={formatNumberID(nominal)}
              onChange={(e) => setNominal(parseAmount(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label">
            Upload Foto <span className="text-slate-400 font-normal ml-1">(opsional)</span>
            {isEdit && <span className="text-slate-400 font-normal ml-1">— kosongkan kalau tidak diubah</span>}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileChange}
            className="block w-full text-sm text-slate-600
              file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
              file:text-sm file:font-medium file:bg-slate-100 file:text-slate-700
              hover:file:bg-slate-200 file:cursor-pointer"
          />
          <p className="text-xs text-slate-400 mt-1">JPG/PNG/WEBP, max 5MB.</p>

          {filePreview && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-slate-500">Preview foto baru:</p>
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setFilePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs text-red-600 hover:text-red-700 font-medium"
                >
                  × Hapus foto
                </button>
              </div>
              <img src={filePreview} alt="Preview" className="max-h-48 rounded border border-slate-200" />
            </div>
          )}
          {existingUrl && !filePreview && (
            <div className="mt-3">
              <p className="text-xs text-slate-500 mb-1">Foto saat ini:</p>
              <img src={existingUrl} alt="Existing" className="max-h-48 rounded border border-slate-200" />
              <p className="text-xs text-slate-400 mt-1">Untuk mengganti, upload foto baru di atas.</p>
            </div>
          )}
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
