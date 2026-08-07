import * as XLSX from 'xlsx';
import api from './api.js';

// ============================================================
// Utility export ke Excel (.xlsx) — dipakai semua halaman.
//
// Hanya admin/superadmin yang menampilkan tombol export (di-guard di
// komponen), dan backend juga membatasi data via permission view biasa.
//
// exportRowsToExcel(filename, columns, rows):
//   - columns: array { header, value } di mana value(row) → sel.
//   - rows: array data.
//   - Membuat 1 sheet "Data", auto-width sederhana, lalu unduh file.
//
// fetchAllAndExport({ endpoint, params, dataKey, columns, filename }):
//   - fetch endpoint dengan ?export=1 (backend kirim SEMUA data tanpa LIMIT),
//     ikut params filter aktif, lalu export.
// ============================================================

export function exportRowsToExcel(filename, columns, rows) {
  const header = columns.map((c) => c.header);
  const body = rows.map((row) =>
    columns.map((c) => {
      const v = c.value(row);
      return v === null || v === undefined ? '' : v;
    })
  );

  const aoa = [header, ...body];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto-width kasar berdasarkan panjang konten per kolom (maks 60).
  ws['!cols'] = columns.map((c, i) => {
    let max = String(c.header).length;
    for (const r of body) {
      const len = String(r[i] ?? '').length;
      if (len > max) max = len;
    }
    return { wch: Math.min(Math.max(max + 2, 10), 60) };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');

  // Nama file + timestamp supaya unik.
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
  XLSX.writeFile(wb, `${filename}_${stamp}.xlsx`);
}

export async function fetchAllAndExport({ endpoint, params = {}, dataKey, columns, filename }) {
  const { data } = await api.get(endpoint, { params: { ...params, export: 1 } });
  const rows = data[dataKey] || [];
  exportRowsToExcel(filename, columns, rows);
  return rows.length;
}

// ============================================================
// Export hasil hitung Gross Profit (1 atau 2) ke Excel multi-sheet.
//   sheets: array { name, columns, rows } — tiap sheet jadi 1 worksheet.
//   filename: nama file dasar.
// Dipakai halaman GP1 & GP2 yang hasilnya = ringkasan + breakdown.
// ============================================================
export function exportSheetsToExcel(filename, sheets) {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const { name, columns, rows } = sheet;
    const header = columns.map((c) => c.header);
    const body = rows.map((row) =>
      columns.map((c) => {
        const v = c.value(row);
        return v === null || v === undefined ? '' : v;
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
    ws['!cols'] = columns.map((c, i) => {
      let max = String(c.header).length;
      for (const r of body) {
        const len = String(r[i] ?? '').length;
        if (len > max) max = len;
      }
      return { wch: Math.min(Math.max(max + 2, 10), 60) };
    });
    // Nama sheet maks 31 char (batas Excel).
    XLSX.utils.book_append_sheet(wb, ws, String(name).slice(0, 31));
  }
  const stamp = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  XLSX.writeFile(wb, `${filename}_${stamp}.xlsx`);
}
