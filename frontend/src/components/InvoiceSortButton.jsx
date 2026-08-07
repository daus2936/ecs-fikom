// Tombol toggle sorting berdasarkan Nomor Invoice.
// State 3 langkah: null (default/tanggal) → 'asc' (A→Z) → 'desc' (Z→A) → null.
// Dipakai di halaman Nomor Invoice, Expenses, Invoice Detail, Invoice Cover, Payment.
export default function InvoiceSortButton({ sortDir, onChange, label = 'Nomor Invoice' }) {
  const next = () => {
    if (sortDir === null || sortDir === undefined) onChange('asc');
    else if (sortDir === 'asc') onChange('desc');
    else onChange(null);
  };
  const arrow = sortDir === 'asc' ? '▲' : sortDir === 'desc' ? '▼' : '↕';
  const active = sortDir === 'asc' || sortDir === 'desc';
  return (
    <button
      type="button"
      onClick={next}
      title="Urutkan berdasarkan Nomor Invoice (klik: A→Z, lalu Z→A, lalu kembali default)"
      className={
        'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ' +
        (active
          ? 'bg-brand-50 border-brand-300 text-brand-800'
          : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50')
      }
    >
      <span>Urut: {label}</span>
      <span className="text-xs">{arrow}</span>
    </button>
  );
}
