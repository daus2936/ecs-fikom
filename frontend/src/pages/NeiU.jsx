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

function rekeningLabel(r) {
  if (!r) return '—';
  return `${r.nama_bank} · ${r.nomor_rekening} (${r.nama_pemilik})`;
}

export default function NeiU() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'neiu');
  const canEdit = pCanEdit(role, 'neiu');
  const canDelete = pCanDelete(role, 'neiu');

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
  const [fKodeUsed, setFKodeUsed]   = useState([]); // array kode_used string
  const [fRekTujuan, setFRekTujuan] = useState([]); // array rekening_tujuan_id
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeOptions, setKodeOptions] = useState([]);
  const [rekOptions, setRekOptions]   = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (filters = {}) => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (filters.kode_used?.length)     params.kode_used      = filters.kode_used.join(',');
      if (filters.rek_tujuan_ids?.length) params.rek_tujuan_ids = filters.rek_tujuan_ids.join(',');
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get('/neiu', { params });
      setItems(data.neiu);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally { setLoading(false); }
  }, []);

  // Load opsi kode used + rekening sekali
  useEffect(() => {
    Promise.all([api.get('/neiu/kode-options'), api.get('/rekening')])
      .then(([ko, rk]) => {
        setKodeOptions(ko.data.options.map((o) => ({ value: o.kode_used, label: o.kode_used })));
        setRekOptions(rk.data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
      })
      .catch(() => { /* abaikan */ });
  }, []);

  const currentFilters = () => ({
    kode_used:      fKodeUsed,
    rek_tujuan_ids: fRekTujuan,
    date_from:      dateFrom,
    date_to:        dateTo,
  });

  useEffect(() => {
    const t = setTimeout(() => load(currentFilters()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fKodeUsed, fRekTujuan, dateFrom, dateTo, load]);

  const hasActiveFilter = Boolean(fKodeUsed.length || fRekTujuan.length || dateFrom || dateTo);
  const resetFilters = () => {
    setFKodeUsed([]); setFRekTujuan([]); setDateFrom(''); setDateTo('');
  };

  const handleDelete = async (it) => {
    if (!confirm(`Hapus ${it.kode_used}?`)) return;
    try {
      await api.delete(`/neiu/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NeiU</h1>
          <p className="text-slate-500 mt-1 text-sm">Catatan NeiU. Kode Used di-generate otomatis.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/neiu"
              dataKey="neiu"
              filename="neiu"
              params={{
                kode_used:      fKodeUsed.length ? fKodeUsed.join(',') : undefined,
                rek_tujuan_ids: fRekTujuan.length ? fRekTujuan.join(',') : undefined,
                date_from:      dateFrom || undefined,
                date_to:        dateTo || undefined,
              }}
              columns={[
                { header: 'Kode Used', value: (r) => r.kode_used },
                { header: 'Tanggal', value: (r) => formatDateOnly(r.tanggal_menghutang) },
                { header: 'Nilai Hutang', value: (r) => Number(r.nilai_hutang) },
                { header: 'Untuk Bayar Apa', value: (r) => r.untuk_bayar_apa },
                { header: 'Rekening Tujuan', value: (r) => [r.rek_tujuan_bank, r.rek_tujuan_nomor].filter(Boolean).join(' · ') },
                { header: 'Status', value: (r) => (r.status === 'close' ? 'Close' : 'Open') },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah NeiU</button>}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="label">Kode Used</label>
            <MultiSearchSelect
              options={kodeOptions}
              selected={fKodeUsed}
              onChange={setFKodeUsed}
              placeholder="Cari & pilih kode used…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Rekening Tujuan</label>
            <MultiSearchSelect
              options={rekOptions}
              selected={fRekTujuan}
              onChange={setFRekTujuan}
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
          <span className="font-medium">Total Nominal NeiU</span>
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
            <button type="button" onClick={() => setShowTotal(false)}
              className="text-xs text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap">
              Sembunyikan
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowTotal(true)}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap">
            Lihat Total Nominal
          </button>
        )}
      </div>

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/neiu"
          ids={bulk.selectedIds}
          label="NeiU"
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
                <th className="text-left px-4 py-3 font-medium">Untuk</th>
                <th className="text-left px-4 py-3 font-medium">Rekening Tujuan</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={showSelect ? 8 : 7} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok.' : 'Belum ada data. Klik "Tambah NeiU".'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 font-mono text-slate-900 whitespace-nowrap">{it.kode_used}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateOnly(it.tanggal_menghutang)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 whitespace-nowrap">{formatIDR(it.nilai_hutang)}</td>
                  <td className="px-4 py-3 text-slate-700">{it.untuk_bayar_apa}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {[it.rek_tujuan_bank, it.rek_tujuan_nomor].filter(Boolean).join(' · ')}
                  </td>
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

      <NeiUFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(currentFilters()); }}
      />
      <NeiUViewModal
        item={viewing}
        onClose={() => setViewing(null)}
        onEdit={canEdit ? (it) => { setViewing(null); setEditing(it); } : undefined}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const isClose = status === 'close';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      isClose ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
    }`}>
      {isClose ? 'Close' : 'Open'}
    </span>
  );
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

const EMPTY = {
  tanggal_menghutang: todayISO(),
  nilai_hutang: 0,
  rekening_tujuan_id: null,
  untuk_bayar_apa: '',
};

function NeiUViewModal({ item, onClose, onEdit }) {
  if (!item) return null;
  const wasEdited = item.updated_at && item.updated_at !== item.created_at;
  const isClose = item.status === 'close';

  return (
    <Modal open={!!item} onClose={onClose} title={`Detail NeiU · ${item.kode_used}`} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium">Info NeiU</h3>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              isClose ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {isClose ? 'Close' : 'Open'}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Field label="Kode Used" value={<span className="font-mono">{item.kode_used}</span>} />
            <Field label="Tanggal" value={formatDateOnly(item.tanggal_menghutang)} />
            <Field label="Nilai Hutang" value={<span className="font-mono font-medium">{formatIDR(item.nilai_hutang)}</span>} />
          </dl>
          <div className="mt-2">
            <dt className="text-sm text-slate-500">Untuk Bayar Apa</dt>
            <dd className="text-sm text-slate-900 whitespace-pre-wrap">{item.untuk_bayar_apa}</dd>
          </div>
        </section>

        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Rekening</h3>
          <dl className="grid grid-cols-1 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Rekening Tujuan:</dt>
              <dd className="text-slate-900 mt-0.5">
                {item.rek_tujuan_bank} · {item.rek_tujuan_nomor}
                <span className="text-slate-500"> ({item.rek_tujuan_pemilik})</span>
              </dd>
            </div>
          </dl>
        </section>

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

function NeiUFormModal({ editing, onClose, onSaved }) {
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
      tanggal_menghutang: editing.tanggal_menghutang?.slice(0, 10) || todayISO(),
      nilai_hutang:       Number(editing.nilai_hutang) || 0,
      rekening_tujuan_id: editing.rek_tujuan_id,
      untuk_bayar_apa:    editing.untuk_bayar_apa,
    } : EMPTY);
    api.get('/rekening').then(({ data }) => {
      setRekOptions(data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
    }).catch((e) => setError('Gagal memuat rekening: ' + getErrorMessage(e)));
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.tanggal_menghutang) return setError('Tanggal wajib diisi.');
    if (!(form.nilai_hutang > 0)) return setError('Nilai hutang harus > 0.');
    if (!form.rekening_tujuan_id) return setError('Pilih rekening tujuan.');
    if (!form.untuk_bayar_apa.trim()) return setError('"Untuk bayar apa" wajib diisi.');

    setSubmitting(true);
    try {
      const payload = {
        tanggal_menghutang: form.tanggal_menghutang,
        nilai_hutang:       Number(form.nilai_hutang),
        rekening_tujuan_id: form.rekening_tujuan_id,
        untuk_bayar_apa:    form.untuk_bayar_apa.trim(),
      };
      if (isEdit) await api.put(`/neiu/${editing.id}`, payload);
      else        await api.post('/neiu', payload);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit ${editing.kode_used}` : 'Tambah NeiU'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Tanggal <span className="text-red-500">*</span></label>
          <input type="date" required className="input"
            value={form.tanggal_menghutang}
            onChange={(e) => setForm((f) => ({ ...f, tanggal_menghutang: e.target.value }))} />
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
          <label className="label">Rekening Tujuan <span className="text-red-500">*</span></label>
          <SearchSelect
            options={rekOptions}
            selected={form.rekening_tujuan_id}
            onChange={(v) => setForm((f) => ({ ...f, rekening_tujuan_id: v }))}
            placeholder="Cari bank/nomor rekening/pemilik…"
          />
        </div>

        <div>
          <label className="label">Untuk Bayar Apa <span className="text-red-500">*</span></label>
          <textarea rows={2} required maxLength={500} className="input"
            value={form.untuk_bayar_apa}
            onChange={(e) => setForm((f) => ({ ...f, untuk_bayar_apa: e.target.value }))} />
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
