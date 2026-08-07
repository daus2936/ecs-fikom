import { useState, useCallback, useMemo } from 'react';
import api, { getErrorMessage } from '../lib/api.js';

// ============================================================
// Hook seleksi multi-baris untuk fitur hapus banyak.
//   items: array data saat ini (tiap item harus punya .id)
// Mengembalikan: selectedIds(Set), toggle(id), toggleAll(idsList),
//   clear(), isSelected(id), count, allSelected(idsList).
// ============================================================
export function useBulkSelect(items) {
  const [selected, setSelected] = useState(() => new Set());

  const toggle = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  // Pilih semua id di idsList; kalau semua sudah terpilih → batal semua.
  const toggleAll = useCallback((idsList) => {
    setSelected((prev) => {
      const allSel = idsList.length > 0 && idsList.every((id) => prev.has(id));
      if (allSel) {
        const next = new Set(prev);
        idsList.forEach((id) => next.delete(id));
        return next;
      }
      const next = new Set(prev);
      idsList.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  const isSelected = useCallback((id) => selected.has(id), [selected]);
  const allSelected = useCallback(
    (idsList) => idsList.length > 0 && idsList.every((id) => selected.has(id)),
    [selected]
  );

  // Buang id yang tidak ada lagi di items (mis. setelah reload/filter).
  const validSelectedIds = useMemo(() => {
    const present = new Set(items.map((it) => it.id));
    return [...selected].filter((id) => present.has(id));
  }, [selected, items]);

  return {
    selected,
    selectedIds: validSelectedIds,
    count: validSelectedIds.length,
    toggle,
    toggleAll,
    clear,
    isSelected,
    allSelected,
  };
}

// ============================================================
// Bar aksi "hapus terpilih" — muncul di atas tabel kalau ada yang dipilih.
// Props:
//   count      : jumlah terpilih
//   endpoint   : base endpoint (mis. '/invoices') → POST {endpoint}/bulk-delete
//   ids        : array id terpilih
//   label      : nama data untuk konfirmasi (mis. 'Nomor Invoice')
//   onDone     : dipanggil setelah berhasil (untuk reload + clear)
//   onClear    : batal pilih
// ============================================================
export function BulkDeleteBar({ count, endpoint, ids, label = 'data', onDone, onClear }) {
  const [busy, setBusy] = useState(false);
  if (count === 0) return null;

  const handleDelete = async () => {
    if (busy) return;
    if (!confirm(`Hapus ${count} ${label} terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`${endpoint}/bulk-delete`, { ids });
      if (onDone) onDone(data?.deleted ?? count);
    } catch (err) {
      alert('Gagal menghapus: ' + getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-3 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
      <span className="text-sm text-red-800 font-medium">{count} dipilih</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onClear} className="text-sm text-slate-600 hover:text-slate-800 underline">
          Batal
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
        >
          {busy ? 'Menghapus…' : `Hapus ${count} Terpilih`}
        </button>
      </div>
    </div>
  );
}
