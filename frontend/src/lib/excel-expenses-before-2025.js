// ============================================================
// excel-expenses-before-2025.js — template + parser Excel untuk
// halaman "Expenses Before 2025".
// Sama seperti Expenses, tetapi Nomor PO & Invoice OPSIONAL untuk
// semua tipe (tidak ada aturan "client wajib PO").
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
  occurred_date:   'WAJIB. Tanggal terjadi (YYYY-MM-DD). Contoh: 2024-11-30',
  expense_type:    'WAJIB. Pilih: client ATAU non_client',
  sub_entity:      'WAJIB. Kode entitas. Lihat sheet "Referensi" untuk daftar lengkap.',
  category1:       'WAJIB. Kategori utama. Lihat sheet "Referensi".',
  category3:       'OPSIONAL. Wajib hanya kalau sub_entity = BIERSDORF. Pilih: NMA / BMC / KPL / OTHERS.',
  amount:          'WAJIB. Nominal dalam rupiah (angka, tanpa Rp / titik). Contoh: 1500000',
  notes:           'OPSIONAL. Catatan tambahan (max 2000 karakter).',
  po_numbers:      'OPSIONAL. Daftar nomor PO terkait. Pisah dengan "; ". Contoh: "PO-2024-001; PO-2024-002"',
  invoice_numbers: 'OPSIONAL. Daftar nomor Invoice. Pisah dengan "; ". Contoh: "INV-2024-001"',
};

// Generate file template Excel siap-download (dengan contoh value)
export function downloadExpensesBefore2025Template() {
  const wb = XLSX.utils.book_new();

  const examples = [
    {
      occurred_date: '2024-11-30',
      expense_type: 'client',
      sub_entity: 'BIERSDORF',
      category1: 'gaji',
      category3: 'NMA',
      amount: 5000000,
      notes: 'Contoh expense lama (client Biersdorf, dgn PO)',
      po_numbers: 'PO-2024-001',
      invoice_numbers: '',
    },
    {
      occurred_date: '2024-12-15',
      expense_type: 'client',
      sub_entity: 'WINGS',
      category1: 'expenses',
      category3: '',
      amount: 1500000,
      notes: 'PO & Invoice opsional, boleh lebih dari satu',
      po_numbers: 'PO-2024-010; PO-2024-011',
      invoice_numbers: 'INV-2024-001',
    },
    {
      occurred_date: '2024-12-20',
      expense_type: 'non_client',
      sub_entity: 'INTERNAL_KBSI',
      category1: 'listrik',
      category3: '',
      amount: 750000,
      notes: 'Contoh non_client tanpa PO/Invoice',
      po_numbers: '',
      invoice_numbers: '',
    },
  ];

  const dataSheet = XLSX.utils.json_to_sheet(examples, { header: HEADER });

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
    ['1. occurred_date format YYYY-MM-DD (mis. 2024-11-30)'],
    ['2. amount = angka saja, tanpa Rp atau titik (mis. 1500000)'],
    ['3. category3 WAJIB diisi (NMA/BMC/KPL/OTHERS) kalau sub_entity = BIERSDORF. Kosongkan untuk lainnya.'],
    ['4. po_numbers & invoice_numbers OPSIONAL untuk SEMUA tipe, pisah dgn "; " kalau lebih dari 1.'],
    ['5. PO & Invoice number harus SUDAH ADA di database. Buat dulu di halaman Nomor PO / Nomor Invoice.'],
    ['6. Kode (EXPB-DDMMYY-NNNN) di-generate otomatis oleh sistem.'],
    ['7. Maksimal 5000 baris per import. All-or-nothing: kalau 1 baris error, semua dibatalkan.'],
  ];
  const refSheet = XLSX.utils.aoa_to_sheet(refRows);
  refSheet['!cols'] = [{ wch: 22 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, refSheet, 'Referensi');

  XLSX.writeFile(wb, 'template-import-expenses-before-2025.xlsx');
}

// Parse uploaded file → { rows } siap kirim ke backend
export async function parseExpensesBefore2025Excel(file) {
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
    if (!date) continue;

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
