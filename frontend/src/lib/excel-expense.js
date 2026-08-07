// ============================================================
// excel-expense.js — template + parser Excel untuk Expenses.
// ============================================================
import * as XLSX from 'xlsx';
import { SUB_ENTITIES, CATEGORY1, CATEGORY3 } from './expense-constants.js';

const HEADER = [
  'occurred_date',
  'expense_type',
  'sub_entity',
  'category1',
  'category3',
  'amount',
  'notes',
  'po_numbers',
  'invoice_numbers',
];

const COLUMN_GUIDE = {
  occurred_date:   'WAJIB. Tanggal terjadi (YYYY-MM-DD). Contoh: 2026-05-31',
  expense_type:    'WAJIB. Pilih: client ATAU non_client',
  sub_entity:      'WAJIB. Kode entitas. Lihat sheet "Referensi" untuk daftar lengkap.',
  category1:       'WAJIB. Kategori utama. Lihat sheet "Referensi".',
  category3:       'OPSIONAL. Wajib hanya kalau sub_entity = BIERSDORF. Pilih: NMA / BMC / KPL / OTHERS.',
  amount:          'WAJIB. Nominal dalam rupiah (angka, tanpa Rp / titik). Contoh: 1500000',
  notes:           'OPSIONAL. Catatan tambahan (max 2000 karakter).',
  po_numbers:      'OPSIONAL. Daftar nomor PO yang terkait. Pisah dengan "; ". Contoh: "PO-2026-001; PO-2026-002"',
  invoice_numbers: 'OPSIONAL. Daftar nomor Invoice. Pisah dengan "; ". Contoh: "INV-2026-001"',
};

// Generate file template Excel siap-download
export function downloadExpenseTemplate() {
  const wb = XLSX.utils.book_new();

  // Sheet "Data" — header + beberapa contoh row
  const examples = [
    {
      occurred_date: '2026-05-31',
      expense_type: 'client',
      sub_entity: 'BIERSDORF',
      category1: 'gaji',
      category3: 'NMA',
      amount: 5000000,
      notes: 'Contoh expense gaji untuk Biersdorf NMA',
      po_numbers: 'PO-2026-001',
      invoice_numbers: '',
    },
    {
      occurred_date: '2026-05-31',
      expense_type: 'client',
      sub_entity: 'WINGS',
      category1: 'expenses',
      category3: '',
      amount: 1500000,
      notes: '',
      po_numbers: 'PO-2026-010; PO-2026-011',
      invoice_numbers: 'INV-2026-001',
    },
    {
      occurred_date: '2026-05-31',
      expense_type: 'non_client',
      sub_entity: 'INTERNAL_KBSI',
      category1: 'bpjs_kesehatan',
      category3: '',
      amount: 750000,
      notes: 'BPJS Kesehatan karyawan',
      po_numbers: '',
      invoice_numbers: '',
    },
  ];

  const dataSheet = XLSX.utils.json_to_sheet(examples, { header: HEADER });

  // Cell comments untuk header
  HEADER.forEach((key, colIdx) => {
    const addr = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    if (dataSheet[addr] && COLUMN_GUIDE[key]) {
      dataSheet[addr].c = [{ a: 'Template', t: COLUMN_GUIDE[key] }];
    }
  });

  dataSheet['!cols'] = [
    { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 18 }, { wch: 11 },
    { wch: 14 }, { wch: 40 }, { wch: 30 }, { wch: 30 },
  ];

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');

  // Sheet "Referensi" — panduan nilai valid
  const refRows = [
    ['=== EXPENSE TYPE ==='],
    ['client', 'Pengeluaran untuk client (Biersdorf, Wings, dst)'],
    ['non_client', 'Pengeluaran internal (KBSI atau SMI)'],
    [],
    ['=== SUB ENTITY (client) ==='],
    ...Object.entries(SUB_ENTITIES)
      .filter(([, def]) => def.type === 'client')
      .map(([code, def]) => [code, def.label]),
    [],
    ['=== SUB ENTITY (non_client) ==='],
    ...Object.entries(SUB_ENTITIES)
      .filter(([, def]) => def.type === 'non_client')
      .map(([code, def]) => [code, def.label]),
    [],
    ['=== CATEGORY 1 ==='],
    ...Object.entries(CATEGORY1).map(([code, label]) => [code, label]),
    [],
    ['=== CATEGORY 3 (hanya untuk Biersdorf) ==='],
    ...Object.entries(CATEGORY3).map(([code, label]) => [code, label]),
    [],
    ['=== CATATAN PENTING ==='],
    ['1. occurred_date format YYYY-MM-DD (mis. 2026-05-31)'],
    ['2. amount = angka saja, tanpa Rp atau titik (mis. 1500000)'],
    ['3. category3 WAJIB diisi (NMA/BMC/KPL/OTHERS) kalau sub_entity = BIERSDORF. Kosongkan untuk lainnya.'],
    ['4. po_numbers & invoice_numbers OPSIONAL, pisah dgn "; " kalau lebih dari 1.'],
    ['5. PO & Invoice number harus SUDAH ADA di database. Buat dulu di halaman Nomor PO / Nomor Invoice.'],
    ['6. Kode expense (EXP-YYYY-NNNNN) di-generate otomatis oleh sistem.'],
    ['7. Maksimal 5000 baris per import. All-or-nothing: kalau 1 baris error, semua dibatalkan.'],
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Referensi');

  XLSX.writeFile(wb, 'template-import-expense.xlsx');
}

// Parse uploaded file → { rows } siap kirim ke backend
export async function parseExpenseExcel(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheetName = wb.SheetNames.find((n) => n.toLowerCase() === 'data') || wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel tidak punya sheet.');
  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

  const splitList = (v) =>
    String(v || '')
      .split(/[;,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  // Helper: konversi nilai tanggal dari Excel.
  // Kalau cell adalah Date object (auto-parse XLSX), convert ke YYYY-MM-DD lokal.
  // Kalau string, pakai apa adanya (asumsi sudah YYYY-MM-DD).
  const toDateString = (v) => {
    if (v instanceof Date) {
      const y = v.getFullYear();
      const m = String(v.getMonth() + 1).padStart(2, '0');
      const d = String(v.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return String(v || '').trim();
  };

  const rows = [];
  for (const r of raw) {
    const date = toDateString(r.occurred_date);
    if (!date) continue; // skip baris kosong

    rows.push({
      occurred_date:   date,
      expense_type:    String(r.expense_type || '').trim().toLowerCase(),
      sub_entity:      String(r.sub_entity || '').trim().toUpperCase(),
      category1:       String(r.category1 || '').trim().toLowerCase(),
      category3:       String(r.category3 || '').trim().toUpperCase() || null,
      amount:          Number(r.amount) || 0,
      notes:           String(r.notes || '').trim() || null,
      po_numbers:      splitList(r.po_numbers),
      invoice_numbers: splitList(r.invoice_numbers),
    });
  }
  return { rows };
}
