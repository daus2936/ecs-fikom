import { useState } from 'react';
import { fetchAllAndExport } from '../lib/excel-export.js';
import { getErrorMessage } from '../lib/api.js';

// Tombol Export Excel reusable. Hanya dirender oleh halaman kalau user
// admin/superadmin (pengecekan dilakukan di halaman pemanggil).
//
// Props:
//   endpoint, dataKey, columns, filename : diteruskan ke fetchAllAndExport
//   params : filter aktif (opsional) — export mengikuti filter
//   label  : teks tombol (default "Export Excel")
export default function ExportButton({ endpoint, dataKey, columns, filename, params = {}, label = 'Export Excel' }) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const n = await fetchAllAndExport({ endpoint, params, dataKey, columns, filename });
      if (n === 0) alert('Tidak ada data untuk diekspor (sesuai filter saat ini).');
    } catch (err) {
      alert('Gagal export: ' + getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={onClick} disabled={busy} className="btn-secondary">
      {busy ? 'Menyiapkan…' : label}
    </button>
  );
}
