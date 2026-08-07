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

export default function NeiP() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'neip');
  const canEdit = pCanEdit(role, 'neip');
  const canDelete = pCanDelete(role, 'neip');

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
  const [fKodeUsed, setFKodeUsed]   = useState([]);
  const [fRekTujuan, setFRekTujuan] = useState([]);
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
      if (filters.kode_used?.length)      params.kode_used      = filters.kode_used.join(',');
      if (filters.rek_tujuan_ids?.length) params.rek_tujuan_ids = filters.rek_tujuan_ids.join(',');
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get('/neip', { params });
      setItems(data.neip);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

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
    if (!confirm(`Hapus pembayaran ${it.kode_used || ''}?`)) return;
    try {
      await api.delete(`/neip/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">NeiP</h1>
          <p className="text-slate-500 mt-1 text-sm">Pembayaran NeiU. Cari berdasarkan Kode Used.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/neip"
              dataKey="neip"
              filename="neip"
              params={{
                kode_used:      fKodeUsed.length ? fKodeUsed.join(',') : undefined,
                rek_tujuan_ids: fRekTujuan.length ? fRekTujuan.join(',') : undefined,
                date_from:      dateFrom || undefined,
                date_to:        dateTo || undefined,
              }}
              columns={[
                { header: 'Tanggal Paid', value: (r) => formatDateOnly(r.tanggal_bayar) },
                { header: 'Kode Used', value: (r) => r.kode_used || '' },
                { header: 'Nilai Bayar', value: (r) => Number(r.nilai_bayar) },
                { header: 'Rekening Tujuan', value: (r) => [r.rek_tujuan_bank, r.rek_tujuan_nomor].filter(Boolean).join(' · ') },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah NeiP</button>}
        </div>
      </div>

      {/* Total nominal */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-emerald-800">
          <span className="font-medium">Total Nominal NeiP</span>
          {(dateFrom || dateTo) && (
            <span className="text-emerald-600 ml-1">(periode {dateFrom || 'awal'} s/d {dateTo || 'akhir'})</span>
          )}
          <span className="text-emerald-600 ml-1">· {summary.count} data</span>
        </div>
        {showTotal ? (
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-emerald-900 font-mono">{formatIDR(summary.total_amount)}</span>
            <button type="button" onClick={() => setShowTotal(false)} className="text-xs text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap">Sembunyikan</button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowTotal(true)} className="text-sm font-medium text-emerald-700 hover:text-emerald-900 underline whitespace-nowrap">Lihat Total Nominal</button>
        )}
      </div>

      {/* Filter bar */}
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

      {showSelect && (
        <BulkDeleteBar
          count={bulk.count}
          endpoint="/neip"
          ids={bulk.selectedIds}
          label="NeiP"
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
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal Paid</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode Used</th>
                <th className="text-right px-4 py-3 font-medium">Nilai</th>
                <th className="text-left px-4 py-3 font-medium">Rekening Tujuan</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={showSelect ? 6 : 5} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 6 : 5} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateOnly(it.tanggal_bayar)}</td>
                  <td className="px-4 py-3 font-mono text-slate-900 whitespace-nowrap">{it.kode_used || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 whitespace-nowrap">{formatIDR(it.nilai_bayar)}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{[it.rek_tujuan_bank, it.rek_tujuan_nomor].filter(Boolean).join(' · ')}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => setViewing(it)} className="text-slate-600 hover:text-slate-800 font-medium">Detail</button>
                    {canEdit && <button onClick={() => setEditing(it)} className="text-brand-700 hover:text-brand-800 font-medium ml-3">Edit</button>}
                    {canDelete && <button onClick={() => handleDelete(it)} className="text-red-600 hover:text-red-700 font-medium ml-3">Hapus</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />}
        </div>
      </div>

      <NeiPFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(currentFilters()); }}
      />
      <NeiPViewModal
        item={viewing}
        onClose={() => setViewing(null)}
        onEdit={canEdit ? (it) => { setViewing(null); setEditing(it); } : undefined}
      />
    </div>
  );
}

function todayISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
}

const EMPTY = {
  tanggal_bayar: todayISO(),
  nilai_bayar: 0,
  neiu_id: null,
  rekening_tujuan_id: null,
};

function NeiPViewModal({ item, onClose, onEdit }) {
  if (!item) return null;
  const wasEdited = item.updated_at && item.updated_at !== item.created_at;
  return (
    <Modal open={!!item} onClose={onClose} title={`Detail NeiP · ${item.kode_used || '—'}`} maxWidth="max-w-2xl">
      <div className="space-y-5">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Pembayaran</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <NPField label="Tanggal Paid" value={formatDateOnly(item.tanggal_bayar)} />
            <NPField label="Kode Used" value={<span className="font-mono">{item.kode_used || '—'}</span>} />
            <NPField label="Nilai Bayar" value={<span className="font-mono font-medium">{formatIDR(item.nilai_bayar)}</span>} />
          </dl>
          {item.untuk_bayar_apa && (
            <div className="mt-2">
              <dt className="text-sm text-slate-500">Untuk Bayar Apa (dari NeiU)</dt>
              <dd className="text-sm text-slate-900 whitespace-pre-wrap">{item.untuk_bayar_apa}</dd>
            </div>
          )}
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
            <NPField label="Dibuat oleh" value={item.created_by_name
              ? `${item.created_by_name}${item.created_by_username ? ` (@${item.created_by_username})` : ''}` : '—'} />
            <NPField label="Tanggal dibuat" value={formatDateTime(item.created_at) + ' WIB'} />
            {wasEdited && (
              <>
                <NPField label="Terakhir diubah oleh" value={item.updated_by_name
                  ? `${item.updated_by_name}${item.updated_by_username ? ` (@${item.updated_by_username})` : ''}` : '—'} />
                <NPField label="Terakhir diubah" value={formatDateTime(item.updated_at) + ' WIB'} />
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

function NPField({ label, value }) {
  return (<><dt className="text-slate-500">{label}</dt><dd className="text-slate-900">{value}</dd></>);
}

function NeiPFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [form, setForm] = useState(EMPTY);
  const [rekOptions, setRekOptions] = useState([]);
  const [neiuOptions, setNeiuOptions] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(isEdit ? {
      tanggal_bayar: editing.tanggal_bayar?.slice(0, 10) || todayISO(),
      nilai_bayar: Number(editing.nilai_bayar) || 0,
      neiu_id: editing.neiu_id,
      rekening_tujuan_id: editing.rek_tujuan_id,
    } : EMPTY);
    Promise.all([api.get('/rekening'), api.get('/neiu')]).then(([rk, nu]) => {
      setRekOptions(rk.data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
      setNeiuOptions(nu.data.neiu.map((n) => ({
        value: n.id,
        label: `${n.kode_used} · ${n.untuk_bayar_apa}`.slice(0, 100),
      })));
    }).catch((e) => setError('Gagal memuat data: ' + getErrorMessage(e)));
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.tanggal_bayar) return setError('Tanggal Paid wajib diisi.');
    if (!(form.nilai_bayar > 0)) return setError('Nilai bayar harus > 0.');
    if (!form.neiu_id) return setError('Pilih Kode Used yang dibayar.');
    if (!form.rekening_tujuan_id) return setError('Pilih rekening tujuan.');

    setSubmitting(true);
    try {
      const payload = {
        tanggal_bayar: form.tanggal_bayar,
        nilai_bayar: Number(form.nilai_bayar),
        neiu_id: form.neiu_id,
        rekening_tujuan_id: form.rekening_tujuan_id,
      };
      if (isEdit) await api.put(`/neip/${editing.id}`, payload);
      else        await api.post('/neip', payload);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit NeiP' : 'Tambah NeiP'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Tanggal Paid <span className="text-red-500">*</span></label>
          <input type="date" required className="input"
            value={form.tanggal_bayar}
            onChange={(e) => setForm((f) => ({ ...f, tanggal_bayar: e.target.value }))} />
        </div>
        <div>
          <label className="label">Nilai Bayar (Rupiah) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <input type="text" inputMode="numeric" required className="input pl-10 font-mono"
              value={formatNumberID(form.nilai_bayar)}
              onChange={(e) => setForm((f) => ({ ...f, nilai_bayar: parseAmount(e.target.value) }))} />
          </div>
        </div>
        <div>
          <label className="label">Kode Used <span className="text-red-500">*</span></label>
          <SearchSelect options={neiuOptions} selected={form.neiu_id}
            onChange={(v) => setForm((f) => ({ ...f, neiu_id: v }))}
            placeholder="Cari kode used (USED-...)…" />
        </div>
        <div>
          <label className="label">Rekening Tujuan <span className="text-red-500">*</span></label>
          <SearchSelect options={rekOptions} selected={form.rekening_tujuan_id}
            onChange={(v) => setForm((f) => ({ ...f, rekening_tujuan_id: v }))}
            placeholder="Cari rekening…" />
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
