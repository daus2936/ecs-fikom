// ============================================================
// Excel helper untuk Invoice (Nomor Invoice).
// Lebih sederhana dari InvoiceDetail/Cover karena cuma 2 kolom:
//   - invoice_number (wajib, unik)
//   - description    (opsional)
// ============================================================
import * as XLSX from 'xlsx';

const HEADER = ['invoice_number', 'description'];

const COLUMN_GUIDE = {
  invoice_number: 'WAJIB. Nomor invoice unik (max 100 karakter). Contoh: INV-2026-001',
  description:    'Opsional. Deskripsi/keterangan tambahan (max 1000 karakter).',
};

// ---- Generate template ----
export function downloadInvoiceTemplate() {
  const wb = XLSX.utils.book_new();

  // Sheet "Data" — header + 3 example rows
  const exampleRows = [
    { invoice_number: 'INV-2026-001', description: 'Contoh invoice — boleh dihapus' },
    { invoice_number: 'INV-2026-002', description: '' },
    { invoice_number: 'INV-2026-003', description: 'Catatan opsional di sini' },
  ];
  const dataSheet = XLSX.utils.json_to_sheet(exampleRows, { header: HEADER });

  // Cell comments di header
  if (!dataSheet['!comments']) dataSheet['!comments'] = [];
  HEADER.forEach((key, colIdx) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (dataSheet[cellAddr] && COLUMN_GUIDE[key]) {
      dataSheet[cellAddr].c = [{ a: 'Template', t: COLUMN_GUIDE[key] }];
    }
  });

  // Column widths
  dataSheet['!cols'] = [{ wch: 22 }, { wch: 50 }];

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');

  // Sheet "Referensi" — panduan ringkas
  const refRows = [
    ['Kolom', 'Wajib?', 'Keterangan'],
    ['invoice_number', 'Ya', COLUMN_GUIDE.invoice_number],
    ['description',    'Tidak', COLUMN_GUIDE.description],
    [],
    ['Catatan:', '', ''],
    ['1. Baris pertama harus header (invoice_number, description). Jangan dihapus.', '', ''],
    ['2. Hapus baris contoh sebelum import, atau ganti dengan data Anda.', '', ''],
    ['3. Nomor invoice harus unik di seluruh sistem.', '', ''],
    ['4. Maksimal 5000 baris per import.', '', ''],
    ['5. Kalau ada 1 baris error, SEMUA baris di-rollback (all-or-nothing).', '', ''],
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 70 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Referensi');

  XLSX.writeFile(wb, 'template-import-invoice.xlsx');
}

// ---- Parse uploaded file ----
// Returns { rows, errors } — rows = array siap kirim ke backend
export async function parseInvoiceExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });

  // Cari sheet "Data" (case-insensitive), atau sheet pertama
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'data') || wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel tidak punya sheet.');
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);

  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  const rows = [];
  for (const r of raw) {
    const invoiceNumber = String(r.invoice_number || '').trim();
    if (!invoiceNumber) continue; // skip empty rows

    rows.push({
      invoice_number: invoiceNumber,
      description:    String(r.description || '').trim() || null,
    });
  }
  return { rows };
}
