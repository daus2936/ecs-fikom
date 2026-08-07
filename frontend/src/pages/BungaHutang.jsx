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

// Badge status lunas / belom lunas (dipakai juga oleh Hutang)
export function StatusBadge({ status }) {
  if (status === 'lunas') {
    return <span className="badge bg-emerald-100 text-emerald-700">Lunas</span>;
  }
  return <span className="badge bg-amber-100 text-amber-700">Belom Lunas</span>;
}

export default function BungaHutang() {
  const { user: me } = useAuth();
  const role = me?.role;
  const canCreate = pCanCreate(role, 'bunga-hutang');
  const canEdit = pCanEdit(role, 'bunga-hutang');
  const canDelete = pCanDelete(role, 'bunga-hutang');

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
  const [fKodeHutang, setFKodeHutang] = useState([]);
  const [fKodeBunga, setFKodeBunga]   = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kodeHutangOptions, setKodeHutangOptions] = useState([]);
  const [kodeBungaOptions, setKodeBungaOptions]   = useState([]);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async (filters = {}) => {
    setLoading(true); setError('');
    try {
      const params = {};
      if (filters.kode_hutang?.length)       params.kode_hutang       = filters.kode_hutang.join(',');
      if (filters.kode_bunga_hutang?.length) params.kode_bunga_hutang = filters.kode_bunga_hutang.join(',');
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to)   params.date_to   = filters.date_to;
      const { data } = await api.get('/bunga-hutang', { params });
      setItems(data.bunga_hutang);
      setSummary(data.summary || { total_amount: 0, count: 0 });
    } catch (e) { setError(getErrorMessage(e)); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    Promise.all([api.get('/hutang/kode-options'), api.get('/bunga-hutang/kode-options')])
      .then(([kh, kb]) => {
        setKodeHutangOptions(kh.data.options.map((o) => ({ value: o.kode_hutang, label: o.kode_hutang })));
        setKodeBungaOptions(kb.data.options.map((o) => ({ value: o.kode_bunga_hutang, label: o.kode_bunga_hutang })));
      })
      .catch(() => { /* abaikan */ });
  }, []);

  const currentFilters = () => ({
    kode_hutang:       fKodeHutang,
    kode_bunga_hutang: fKodeBunga,
    date_from:         dateFrom,
    date_to:           dateTo,
  });

  useEffect(() => {
    const t = setTimeout(() => load(currentFilters()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fKodeHutang, fKodeBunga, dateFrom, dateTo, load]);

  const hasActiveFilter = Boolean(fKodeHutang.length || fKodeBunga.length || dateFrom || dateTo);
  const resetFilters = () => {
    setFKodeHutang([]); setFKodeBunga([]); setDateFrom(''); setDateTo('');
  };

  const handleDelete = async (it) => {
    if (!confirm(`Hapus bunga hutang ${it.kode_bunga_hutang}?`)) return;
    try {
      await api.delete(`/bunga-hutang/${it.id}`);
      setItems((p) => p.filter((x) => x.id !== it.id));
    } catch (e) { alert(getErrorMessage(e)); }
  };

  return (
    <div className="p-8 max-w-7xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Bunga Hutang</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Kewajiban bunga atas hutang. Status menjadi "Lunas" jika total Bayar Bunga Hutang sudah memenuhi nilai bunga.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(role) && (
            <ExportButton
              endpoint="/bunga-hutang"
              dataKey="bunga_hutang"
              filename="bunga-hutang"
              params={{
                kode_hutang:       fKodeHutang.length ? fKodeHutang.join(',') : undefined,
                kode_bunga_hutang: fKodeBunga.length ? fKodeBunga.join(',') : undefined,
                date_from:         dateFrom || undefined,
                date_to:           dateTo || undefined,
              }}
              columns={[
                { header: 'Kode Bunga Hutang', value: (r) => r.kode_bunga_hutang },
                { header: 'Tanggal', value: (r) => formatDateOnly(r.tanggal) },
                { header: 'Kode Hutang', value: (r) => r.kode_hutang || '' },
                { header: 'Nilai Bunga Hutang', value: (r) => Number(r.nilai_bunga_hutang) },
                { header: 'Sudah Dibayar', value: (r) => Number(r.total_dibayar || 0) },
                { header: 'Status', value: (r) => (r.status === 'lunas' ? 'Lunas' : 'Belom Lunas') },
              ]}
            />
          )}
          {canCreate && <button onClick={() => setEditing('new')} className="btn-primary">+ Tambah Bunga Hutang</button>}
        </div>
      </div>

      {/* Total nominal */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <div className="text-sm text-emerald-800">
          <span className="font-medium">Total Nominal Bunga Hutang</span>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="label">Kode Hutang</label>
            <MultiSearchSelect
              options={kodeHutangOptions}
              selected={fKodeHutang}
              onChange={setFKodeHutang}
              placeholder="Cari & pilih kode hutang…"
              emptyMessage="Tidak ada yang cocok."
            />
          </div>
          <div>
            <label className="label">Kode Bunga Hutang</label>
            <MultiSearchSelect
              options={kodeBungaOptions}
              selected={fKodeBunga}
              onChange={setFKodeBunga}
              placeholder="Cari & pilih kode bunga…"
              emptyMessage="Tidak ada yang cocok."
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
          endpoint="/bunga-hutang"
          ids={bulk.selectedIds}
          label="Bunga Hutang"
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
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode Bunga</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Tanggal</th>
                <th className="text-left px-4 py-3 font-medium whitespace-nowrap">Kode Hutang</th>
                <th className="text-right px-4 py-3 font-medium">Nilai Bunga</th>
                <th className="text-right px-4 py-3 font-medium">Sudah Dibayar</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={showSelect ? 8 : 7} className="px-4 py-10 text-center text-slate-400">Memuat…</td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={showSelect ? 8 : 7} className="px-4 py-12 text-center text-slate-400">
                  {hasActiveFilter ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada data. Klik "Tambah Bunga Hutang" untuk membuat.'}
                </td></tr>
              )}
              {!loading && pageItems.map((it) => (
                <tr key={it.id} className="hover:bg-slate-50 align-top">
                  {showSelect && (<td className="px-4 py-3"><input type="checkbox" checked={bulk.isSelected(it.id)} onChange={() => bulk.toggle(it.id)} /></td>)}
                  <td className="px-4 py-3 font-mono font-medium text-slate-900 whitespace-nowrap">{it.kode_bunga_hutang}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{formatDateOnly(it.tanggal)}</td>
                  <td className="px-4 py-3 font-mono text-slate-700 whitespace-nowrap">{it.kode_hutang || '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-900 whitespace-nowrap">{formatIDR(it.nilai_bunga_hutang)}</td>
                  <td className="px-4 py-3 text-right font-mono text-slate-600 whitespace-nowrap">{formatIDR(it.total_dibayar)}</td>
                  <td className="px-4 py-3"><StatusBadge status={it.status} /></td>
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

      <BungaHutangFormModal
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(currentFilters()); }}
      />
      <BungaHutangViewModal
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
  tanggal: todayISO(),
  nilai_bunga_hutang: 0,
  hutang_id: null,
};

function BHField({ label, value }) {
  return (<><dt className="text-slate-500">{label}</dt><dd className="text-slate-900">{value}</dd></>);
}

function BungaHutangViewModal({ item, onClose, onEdit }) {
  if (!item) return null;
  const wasEdited = item.updated_at && item.updated_at !== item.created_at;
  return (
    <Modal open={!!item} onClose={onClose} title={`Detail Bunga Hutang · ${item.kode_bunga_hutang || '—'}`} maxWidth="max-w-2xl">
      <div className="space-y-4">
        <section>
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-2">Info Bunga Hutang</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <BHField label="Kode Bunga Hutang" value={<span className="font-mono font-medium">{item.kode_bunga_hutang}</span>} />
            <BHField label="Tanggal" value={formatDateOnly(item.tanggal)} />
            <BHField label="Kode Hutang (dirujuk)" value={<span className="font-mono">{item.kode_hutang || '—'}</span>} />
            <BHField label="Nilai Bunga Hutang" value={<span className="font-mono">{formatIDR(item.nilai_bunga_hutang)}</span>} />
            <BHField label="Sudah Dibayar" value={<span className="font-mono">{formatIDR(item.total_dibayar)}</span>} />
            <BHField label="Status" value={<StatusBadge status={item.status} />} />
          </dl>
          {item.untuk_bayar_apa && (
            <p className="text-xs text-slate-500 mt-2">Hutang untuk: {item.untuk_bayar_apa} · dari {item.dari_siapa}</p>
          )}
        </section>

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

function BungaHutangFormModal({ editing, onClose, onSaved }) {
  const open = editing !== null;
  const isEdit = editing && typeof editing === 'object';
  const [form, setForm] = useState(EMPTY);
  const [hutangOptions, setHutangOptions] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(isEdit ? {
      tanggal: editing.tanggal?.slice(0, 10) || todayISO(),
      nilai_bunga_hutang: Number(editing.nilai_bunga_hutang) || 0,
      hutang_id: editing.hutang_id,
    } : EMPTY);
    api.get('/hutang').then((ht) => {
      setHutangOptions(ht.data.hutang.map((h) => ({
        value: h.id,
        label: `${h.kode_hutang} · ${h.dari_siapa} · ${h.untuk_bayar_apa}`.slice(0, 100),
      })));
    }).catch((e) => setError('Gagal memuat data hutang: ' + getErrorMessage(e)));
  }, [open, isEdit, editing]);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!form.tanggal) return setError('Tanggal wajib diisi.');
    if (!(form.nilai_bunga_hutang > 0)) return setError('Nilai bunga hutang harus > 0.');
    if (!form.hutang_id) return setError('Pilih kode hutang yang dirujuk.');

    setSubmitting(true);
    try {
      const payload = {
        tanggal: form.tanggal,
        nilai_bunga_hutang: Number(form.nilai_bunga_hutang),
        hutang_id: form.hutang_id,
      };
      if (isEdit) await api.put(`/bunga-hutang/${editing.id}`, payload);
      else        await api.post('/bunga-hutang', payload);
      onSaved();
    } catch (err) { setError(getErrorMessage(err)); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Bunga Hutang' : 'Tambah Bunga Hutang'} maxWidth="max-w-2xl">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Tanggal <span className="text-red-500">*</span></label>
          <input type="date" required className="input"
            value={form.tanggal}
            onChange={(e) => setForm((f) => ({ ...f, tanggal: e.target.value }))} />
        </div>
        <div>
          <label className="label">Nilai Bunga Hutang (Rupiah) <span className="text-red-500">*</span></label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">Rp</span>
            <input type="text" inputMode="numeric" required className="input pl-10 font-mono"
              value={formatNumberID(form.nilai_bunga_hutang)}
              onChange={(e) => setForm((f) => ({ ...f, nilai_bunga_hutang: parseAmount(e.target.value) }))} />
          </div>
        </div>
        <div>
          <label className="label">Untuk Bayar Hutang Apa <span className="text-red-500">*</span></label>
          <SearchSelect options={hutangOptions} selected={form.hutang_id}
            onChange={(v) => setForm((f) => ({ ...f, hutang_id: v }))}
            placeholder="Cari kode hutang (HTG-...)…" />
          <p className="text-xs text-slate-500 mt-1">Pilih hutang yang dikenai bunga ini.</p>
        </div>
        {isEdit && (
          <p className="text-xs text-slate-400">Kode bunga hutang ({editing.kode_bunga_hutang}) tidak berubah saat edit.</p>
        )}
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
