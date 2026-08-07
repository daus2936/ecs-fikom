import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { formatDateOnly, formatDateTime, formatIDR, formatNumberID, parseAmount } from '../lib/format.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canCreate as pCanCreate, canEdit as pCanEdit, canDelete as pCanDelete } from '../lib/permissions.js';
import Modal from '../components/Modal.jsx';
import Pagination, { usePagination } from '../components/Pagination.jsx';
import SearchSelect from '../components/SearchSelect.jsx';
import MultiSearchSelect from '../components/MultiSearchSelect.jsx';
import { rekeningLabel } from './M.jsx';

export default function BM() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'bm');
  const canEdit = pCanEdit(role, 'bm');
  const canDelete = pCanDelete(role, 'bm');

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ total_amount: 0, count: 0 });
  const [showTotal, setShowTotal] = useState(false);
  const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // ---- Filter multiple-select ----
  const [fKodeHutang, setFKodeHutang] = useState([]);
  const [fRekMasuk, setFRekMasuk]     = useState([]);
  const [fRekDari, setFRekDari]       = useState([]);
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
      if (filters.kode_modal?.length)   params.kode_modal   = filters.kode_modal.join(',');
      if (filters.rek_masuk_ids?.length) params.rek_masuk_ids = filters.rek_masuk_ids.join(',');
      if (filters.rek_dari_ids?.length)  params.rek_dari_ids  = filters.rek_dari_ids.join(',');
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get('/bm', { params });
      setItems(data.bayar_modal);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    Promise.all([api.get('/m/kode-options'), api.get('/rekening')])
      .then(([ko, rk]) => {
        setKodeOptions(ko.data.options.map((o) => ({ value: o.kode_modal, label: o.kode_modal })));
        setRekOptions(rk.data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
      })
      .catch(() => { /* abaikan */ });
  }, []);

  const currentFilters = () => ({
    kode_modal:   fKodeHutang,
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
    if (!confirm(`Hapus pembayaran modal ${it.kode_modal}?`)) return;
    try {
      await api.delete(`/bm/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bayar Modal</h1>
          <p className="text-slate-500 mt-1 text-sm">Pembayaran pokok modal. Cari berdasarkan kode modal.</p>
        </div>
        {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Bayar Modal</button>}
      </div>

      {/* Total nominal */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-emerald-800">
          <span className="font-medium">Total Nominal Bayar Modal</span>
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
            <label className="label">Kode Modal</label>
            <MultiSearchSelect
              options={kodeOptions}
              selected={fKodeHutang}
              onChange={setFKodeHutang}
              placeholder="Cari & pilih kode modal…"
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal Bayar</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode Modal</th>
                <th className="text-right px-4 py-3 font-medium">Nilai</th>
                <th className="text-left px-4 py-3 font-medium">Dari Rekening</th>
                <th className="text-left px-4 py-3 font-medium">Masuk ke Rekening</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateOnly(it.tanggal_bayar)}</td>
                  <td className="px-4 py-3 font-mono text-slate-900 whitespace-nowrap">{it.kode_modal || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 whitespace-nowrap">{formatIDR(it.nilai_bayar)}</td>
                  <td className="px-4 py-3 text-slate-700">{it.rek_dari_bank} · {it.rek_dari_nomor}</td>
                  <td className="px-4 py-3 text-slate-700">{it.rek_masuk_bank} · {it.rek_masuk_nomor}</td>
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

      <BMFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(currentFilters()); }}
      />
      <BMViewModal
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
  modal_id: null,
  rekening_masuk_id: null,
  rekening_dari_id: null,
};

function BMViewModal({ item, onClose, onEdit }) {
  if (!item) return null;
  const wasEdited = item.updated_at && item.updated_at !== item.created_at;
  return (
    <Modal open={!!item} onClose={onClose} title={`Detail Bayar Modal · ${item.kode_modal || '—'}`} maxWidth="max-w-2xl">
      <div className="space-y-5">
        {/* Info Pembayaran */}
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Pembayaran</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <BHField label="Tanggal Bayar" value={formatDateOnly(item.tanggal_bayar)} />
            <BHField label="Kode Modal"   value={<span className="font-mono">{item.kode_modal || '—'}</span>} />
            <BHField label="Nilai Bayar"   value={<span className="font-mono font-medium">{formatIDR(item.nilai_bayar)}</span>} />
            <BHField label="Dari Siapa (Hutang)" value={item.dari_siapa || '—'} />
          </dl>
          {item.untuk_bayar_apa && (
            <div className="mt-2">
              <dt className="text-sm text-slate-500">Untuk Bayar Apa (dari hutang)</dt>
              <dd className="text-sm text-slate-900 whitespace-pre-wrap">{item.untuk_bayar_apa}</dd>
            </div>
          )}
        </section>

        {/* Rekening */}
        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Rekening</h3>
          <dl className="grid grid-cols-1 gap-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Dari rekening:</dt>
              <dd className="text-slate-900 mt-0.5">
                {item.rek_dari_bank} · {item.rek_dari_nomor}
                <span className="text-slate-500"> ({item.rek_dari_pemilik})</span>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Masuk ke rekening:</dt>
              <dd className="text-slate-900 mt-0.5">
                {item.rek_masuk_bank} · {item.rek_masuk_nomor}
                <span className="text-slate-500"> ({item.rek_masuk_pemilik})</span>
              </dd>
            </div>
          </dl>
        </section>

        {/* Audit */}
        <section className="pt-4 border-t border-slate-100">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Audit</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <BHField label="Dibuat oleh" value={item.created_by_name
              ? `${item.created_by_name}${item.created_by_username ? ` (@${item.created_by_username})` : ''}` : '—'} />
            <BHField label="Tanggal dibuat" value={formatDateTime(item.created_at) + ' WIB'} />
            {wasEdited && (
              <>
                <BHField label="Terakhir diubah oleh" value={item.updated_by_name
                  ? `${item.updated_by_name}${item.updated_by_username ? ` (@${item.updated_by_username})` : ''}` : '—'} />
                <BHField label="Terakhir diubah" value={formatDateTime(item.updated_at) + ' WIB'} />
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

function BHField({ label, value }) {
  return (<><dt className="text-slate-500">{label}</dt><dd className="text-slate-900">{value}</dd></>);
}

function BMFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [form, setForm] = useState(EMPTY);
  const [rekOptions, setRekOptions] = useState([]);
  const [hutangOptions, setHutangOptions] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(isEdit ? {
      tanggal_bayar: editing.tanggal_bayar?.slice(0, 10) || todayISO(),
      nilai_bayar: Number(editing.nilai_bayar) || 0,
      modal_id: editing.modal_id,
      rekening_masuk_id: editing.rek_masuk_id,
      rekening_dari_id: editing.rek_dari_id,
    } : EMPTY);
    Promise.all([api.get('/rekening'), api.get('/hutang')]).then(([rk, ht]) => {
      setRekOptions(rk.data.rekening.map((r) => ({ value: r.id, label: rekeningLabel(r) })));
      setHutangOptions(ht.data.hutang.map((h) => ({
        value: h.id,
        label: `${h.kode_modal} · ${h.dari_siapa} · ${h.untuk_bayar_apa}`.slice(0, 100),
      })));
    }).catch((e) => setError('Gagal memuat data: ' + getErrorMessage(e)));
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.tanggal_bayar) return setError('Tanggal bayar wajib diisi.');
    if (!(form.nilai_bayar > 0)) return setError('Nilai bayar harus > 0.');
    if (!form.modal_id) return setError('Pilih kode hutang yang dibayar.');
    if (!form.rekening_masuk_id) return setError('Pilih rekening masuk.');
    if (!form.rekening_dari_id) return setError('Pilih rekening asal.');

    setSubmitting(true);
    try {
      const payload = {
        tanggal_bayar: form.tanggal_bayar,
        nilai_bayar: Number(form.nilai_bayar),
        modal_id: form.modal_id,
        rekening_masuk_id: form.rekening_masuk_id,
        rekening_dari_id: form.rekening_dari_id,
      };
      if (isEdit) await api.put(`/bm/${editing.id}`, payload);
      else        await api.post('/bm', payload);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Bayar Modal' : 'Tambah Bayar Modal'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Tanggal Bayar Modal <span className="text-red-500">*</span></label>
            <input type="date" required className="input"
              value={form.tanggal_bayar}
              onChange={(e) => setForm((f) => ({ ...f, tanggal_bayar: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="label">Nilai Bayar Modal (Rupiah) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <input type="text" inputMode="numeric" required className="input pl-10 font-mono"
              value={formatNumberID(form.nilai_bayar)}
              onChange={(e) => setForm((f) => ({ ...f, nilai_bayar: parseAmount(e.target.value) }))} />
          </div>
        </div>
        <div>
          <label className="label">Untuk Bayar Modal Apa <span className="text-red-500">*</span></label>
          <SearchSelect options={hutangOptions} selected={form.modal_id}
            onChange={(v) => setForm((f) => ({ ...f, modal_id: v }))}
            placeholder="Cari kode hutang (HTG-...)…" />
        </div>
        <div>
          <label className="label">Masuk ke Rekening Mana <span className="text-red-500">*</span></label>
          <SearchSelect options={rekOptions} selected={form.rekening_masuk_id}
            onChange={(v) => setForm((f) => ({ ...f, rekening_masuk_id: v }))}
            placeholder="Cari rekening…" />
        </div>
        <div>
          <label className="label">Dari Rekening Mana <span className="text-red-500">*</span></label>
          <SearchSelect options={rekOptions} selected={form.rekening_dari_id}
            onChange={(v) => setForm((f) => ({ ...f, rekening_dari_id: v }))}
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
