import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete, isAdmin } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import ExportButton from '../components/ExportButton.jsx';
import { useBulkSelect, BulkDeleteBar } from '../components/BulkDelete.jsx';

// Format option label rekening biar konsisten di semua picker
export function rekeningLabel(r) {
  if (!r) return '—';
  return `${r.nama_bank} · ${r.nomor_rekening} (${r.nama_pemilik})`;
}

export default function Hutang() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'hutang');
  const canEdit = pCanEdit(role, 'hutang');
  const canDelete = pCanDelete(role, 'hutang');

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
  const [fKodeHutang, setFKodeHutang] = useState([]);  // array kode_hutang string
  const [fRekMasuk, setFRekMasuk]     = useState([]);  // array rekening_masuk_id
  const [fRekDari, setFRekDari]       = useState([]);  // array rekening_dari_id
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  // Options (di-load sekali)
  const [kodeOptions, setKodeOptions] = useState([]);
  const [rekOptions, setRekOptions]   = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (filters = {}) => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (filters.kode_hutang?.length)   params.kode_hutang   = filters.kode_hutang.join(',');
      if (filters.rek_masuk_ids?.length) params.rek_masuk_ids = filters.rek_masuk_ids.join(',');
      if (filters.rek_dari_ids?.length)  params.rek_dari_ids  = filters.rek_dari_ids.join(',');
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get('/hutang', { params });
      setItems(data.hutang);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  // Load opsi kode hutang + rekening sekali
  useEffect(() => {
    Promise.all([api.get('/hutang/kode-options'), api.get('/rekening')])
      .then(([ko, rk]) => {
        setKodeOptions(ko.data.options.map((o) => ({ value: o.kode_hutang, label: o.kode_hutang })));
        setRekOptions(rk.data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
      })
      .catch(() => { /* abaikan */ });
  }, []);

  const currentFilters = () => ({
    kode_hutang:   fKodeHutang,
    rek_masuk_ids: fRekMasuk,
    rek_dari_ids:  fRekDari,
    date_from:     dateFrom,
    date_to:       dateTo,
  });

  useEffect(() => {
    const t = setTimeout(() => load(currentFilters()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fKodeHutang, fRekMasuk, fRekDari, dateFrom, dateTo, load]);

  const hasActiveFilter = Boolean(
    fKodeHutang.length || fRekMasuk.length || fRekDari.length || dateFrom || dateTo
  );
  const resetFilters = () => {
    setFKodeHutang([]); setFRekMasuk([]); setFRekDari([]); setDateFrom(''); setDateTo('');
  };

  const handleDelete = async (it) => {
    if (!confirm(`Hapus ${it.kode_hutang}?`)) return;
    try {
      await api.delete(`/hutang/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hutang</h1>
          <p className="text-slate-500 mt-1 text-sm">Catatan hutang. Kode hutang di-generate otomatis.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/hutang"
              dataKey="hutang"
              filename="hutang"
              params={{
                kode_hutang:   fKodeHutang.length ? fKodeHutang.join(',') : undefined,
                rek_masuk_ids: fRekMasuk.length ? fRekMasuk.join(',') : undefined,
                rek_dari_ids:  fRekDari.length ? fRekDari.join(',') : undefined,
                date_from:     dateFrom || undefined,
                date_to:       dateTo || undefined,
              }}
              columns={[
                { header: 'Kode Hutang', value: (r) => r.kode_hutang },
                { header: 'Tanggal', value: (r) => formatDateOnly(r.tanggal_menghutang) },
                { header: 'Nilai Hutang', value: (r) => Number(r.nilai_hutang) },
                { header: 'Periode Pinjam (hari)', value: (r) => r.periode_pinjam_hari },
                { header: 'Dari Siapa', value: (r) => r.dari_siapa },
                { header: 'Untuk Bayar Apa', value: (r) => r.untuk_bayar_apa },
                { header: 'Masuk ke Rekening', value: (r) => [r.rek_masuk_bank, r.rek_masuk_nomor].filter(Boolean).join(' · ') },
                { header: 'Dari Rekening', value: (r) => [r.rek_dari_bank, r.rek_dari_nomor].filter(Boolean).join(' · ') },
                { header: 'Status', value: (r) => (r.status === 'lunas' ? 'Lunas' : 'Belom Lunas') },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Hutang</button>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Kode Hutang</label>
            <MultiSearchSelect
              options={kodeOptions}
              selected={fKodeHutang}
              onChange={setFKodeHutang}
              placeholder="Cari & pilih kode hutang…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Masuk ke Rekening Mana</label>
            <MultiSearchSelect
              options={rekOptions}
              selected={fRekMasuk}
              onChange={setFRekMasuk}
              placeholder="Cari & pilih rekening…"
              emptyMessage="Tidak ada rekening yang cocok."
            />
          </div>
          <div>
            <label className="label">Dari Rekening Mana</label>
            <MultiSearchSelect
              options={rekOptions}
              selected={fRekDari}
              onChange={setFRekDari}
              placeholder="Cari & pilih rekening…"
              emptyMessage="Tidak ada rekening yang cocok."
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
        {hasActiveFilter && (
          <div className="mt-3">
            <button type="button" onClick={resetFilters} className="btn-secondary">Reset Filter</button>
          </div>
        )}
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</div>}

      {/* summary-total-banner */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-emerald-800">
          <span className="font-medium">Total Nominal Hutang</span>
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
          endpoint="/hutang"
          ids={bulk.selectedIds}
          label="Hutang"
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
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
                <th className="text-right px-4 py-3 font-medium">Nilai</th>
                <th className="text-right px-4 py-3 font-medium">Periode</th>
                <th className="text-left px-4 py-3 font-medium">Dari</th>
                <th className="text-left px-4 py-3 font-medium">Untuk</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={showSelect ? 9 : 8} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 9 : 8} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok.' : 'Belum ada data. Klik "Tambah Hutang".'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 font-mono text-slate-900 whitespace-nowrap">{it.kode_hutang}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateOnly(it.tanggal_menghutang)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 whitespace-nowrap">{formatIDR(it.nilai_hutang)}</td>
                  <td className="px-4 py-3 text-right text-slate-700 whitespace-nowrap">{it.periode_pinjam_hari} hari</td>
                  <td className="px-4 py-3 text-slate-700">{it.dari_siapa}</td>
                  <td className="px-4 py-3 text-slate-700">{it.untuk_bayar_apa}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={it.status} />
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

      <HutangFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(currentFilters()); }}
      />
      <HutangViewModal
        item={viewing}
        onClose={() => setViewing(null)}
        onEdit={canEdit ? (it) => { setViewing(null); setEditing(it); } : undefined}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const isLunas = status === 'lunas';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      isLunas
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-amber-100 text-amber-800'
    }`}>
      {isLunas ? 'Lunas' : 'Belom Lunas'}
    </span>
  );
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

const EMPTY = {
  tanggal_menghutang: todayISO(),
  nilai_hutang: 0,
  periode_pinjam_hari: 30,
  rekening_masuk_id: null,
  untuk_bayar_apa: '',
  dari_siapa: '',
  rekening_dari_id: null,
};

function HutangViewModal({ item, onClose, onEdit }) {
  if (!item) return null;
  const wasEdited = item.updated_at && item.updated_at !== item.created_at;
  const isLunas = item.status === 'lunas';

  return (
    <Modal open={!!item} onClose={onClose} title={`Detail Hutang · ${item.kode_hutang}`} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Status & Info Umum */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium">Info Hutang</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isLunas ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {isLunas ? 'Lunas' : 'Belom Lunas'}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Kode Hutang" value={<span className="font-mono">{item.kode_hutang}</span>} />
            <Field label="Tanggal Menghutang" value={formatDateOnly(item.tanggal_menghutang)} />
            <Field label="Nilai Hutang" value={<span className="font-mono font-medium">{formatIDR(item.nilai_hutang)}</span>} />
            <Field label="Periode Pinjam" value={`${item.periode_pinjam_hari} hari`} />
            <Field label="Dari Siapa" value={item.dari_siapa} />
          </dl>
          <div className="mt-2">
            <dt className="text-sm text-slate-500">Untuk Bayar Apa</dt>
            <dd className="text-sm text-slate-900 whitespace-pre-wrap">{item.untuk_bayar_apa}</dd>
          </div>
        </section>

        {/* Rekening */}
        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Rekening</h3>
          <dl className="grid grid-cols-1 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Masuk ke rekening:</dt>
              <dd className="text-slate-900 mt-0.5">
                {item.rek_masuk_bank} · {item.rek_masuk_nomor}
                <span className="text-slate-500"> ({item.rek_masuk_pemilik})</span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Dari rekening:</dt>
              <dd className="text-slate-900 mt-0.5">
                {item.rek_dari_bank} · {item.rek_dari_nomor}
                <span className="text-slate-500"> ({item.rek_dari_pemilik})</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Audit */}
        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Audit</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Dibuat oleh" value={item.created_by_name
              ? `${item.created_by_name}${item.created_by_username ? ` (@${item.created_by_username})` : ''}` : '—'} />
            <Field label="Tanggal dibuat" value={formatDateTime(item.created_at) + ' WIB'} />
            {wasEdited && (
              <>
                <Field label="Terakhir diubah oleh" value={item.updated_by_name
                  ? `${item.updated_by_name}${item.updated_by_username ? ` (@${item.updated_by_username})` : ''}` : '—'} />
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

function HutangFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [form, setForm] = useState(EMPTY);
  const [rekOptions, setRekOptions] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(isEdit ? {
      tanggal_menghutang:  editing.tanggal_menghutang?.slice(0, 10) || todayISO(),
      nilai_hutang:        Number(editing.nilai_hutang) || 0,
      periode_pinjam_hari: Number(editing.periode_pinjam_hari) || 30,
      rekening_masuk_id:   editing.rek_masuk_id,
      untuk_bayar_apa:     editing.untuk_bayar_apa,
      dari_siapa:          editing.dari_siapa,
      rekening_dari_id:    editing.rek_dari_id,
    } : EMPTY);
    api.get('/rekening').then(({ data }) => {
      setRekOptions(data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
    }).catch((e) => setError('Gagal memuat rekening: ' + getErrorMessage(e)));
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.tanggal_menghutang) return setError('Tanggal menghutang wajib diisi.');
    if (!(form.nilai_hutang > 0)) return setError('Nilai hutang harus > 0.');
    if (!(form.periode_pinjam_hari >= 0)) return setError('Periode pinjam harus >= 0 hari.');
    if (!form.rekening_masuk_id) return setError('Pilih rekening masuk.');
    if (!form.untuk_bayar_apa.trim()) return setError('"Untuk bayar apa" wajib diisi.');
    if (!form.dari_siapa.trim()) return setError('"Dari siapa" wajib diisi.');
    if (!form.rekening_dari_id) return setError('Pilih rekening asal.');

    setSubmitting(true);
    try {
      const payload = {
        tanggal_menghutang:  form.tanggal_menghutang,
        nilai_hutang:        Number(form.nilai_hutang),
        periode_pinjam_hari: Number(form.periode_pinjam_hari),
        rekening_masuk_id:   form.rekening_masuk_id,
        untuk_bayar_apa:     form.untuk_bayar_apa.trim(),
        dari_siapa:          form.dari_siapa.trim(),
        rekening_dari_id:    form.rekening_dari_id,
      };
      if (isEdit) await api.put(`/hutang/${editing.id}`, payload);
      else        await api.post('/hutang', payload);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${editing.kode_hutang}` : 'Tambah Hutang'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tanggal Menghutang <span className="text-red-500">*</span></label>
            <input type="date" required className="input"
              value={form.tanggal_menghutang}
              onChange={(e) => setForm((f) => ({ ...f, tanggal_menghutang: e.target.value }))} />
          </div>
          <div>
            <label className="label">Periode Pinjam (Hari) <span className="text-red-500">*</span></label>
            <input type="number" required min="0" className="input"
              value={form.periode_pinjam_hari}
              onChange={(e) => setForm((f) => ({ ...f, periode_pinjam_hari: e.target.value }))} />
          </div>
        </div>

        <div>
          <label className="label">Nilai Hutang (Rupiah) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <input type="text" inputMode="numeric" required className="input pl-10 font-mono"
              value={formatNumberID(form.nilai_hutang)}
              onChange={(e) => setForm((f) => ({ ...f, nilai_hutang: parseAmount(e.target.value) }))} />
          </div>
        </div>

        <div>
          <label className="label">Masuk ke Rekening Mana <span className="text-red-500">*</span></label>
          <SearchSelect
            options={rekOptions}
            selected={form.rekening_masuk_id}
            onChange={(v) => setForm((f) => ({ ...f, rekening_masuk_id: v }))}
            placeholder="Cari bank/nomor rekening/pemilik…"
          />
        </div>

        <div>
          <label className="label">Untuk Bayar Apa <span className="text-red-500">*</span></label>
          <textarea rows={2} required maxLength={500} className="input"
            value={form.untuk_bayar_apa}
            onChange={(e) => setForm((f) => ({ ...f, untuk_bayar_apa: e.target.value }))} />
        </div>

        <div>
          <label className="label">Dari Siapa <span className="text-red-500">*</span></label>
          <input type="text" required maxLength={200} className="input"
            value={form.dari_siapa}
            onChange={(e) => setForm((f) => ({ ...f, dari_siapa: e.target.value }))} />
        </div>

        <div>
          <label className="label">Dari Rekening Mana <span className="text-red-500">*</span></label>
          <SearchSelect
            options={rekOptions}
            selected={form.rekening_dari_id}
            onChange={(v) => setForm((f) => ({ ...f, rekening_dari_id: v }))}
            placeholder="Cari bank/nomor rekening/pemilik…"
          />
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
