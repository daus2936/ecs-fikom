// ============================================================
// Excel helpers untuk Invoice Detail.
// Pakai library 'xlsx' (SheetJS).
// ============================================================
import * as XLSX from 'xlsx';
import { INVOICE_DETAIL_NUMERIC_FIELDS } from './invoice-detail-constants.js';
import { SUB_ENTITIES, CATEGORY3, CATEGORY4 } from './expense-constants.js';

// Header excel (urutannya menentukan struktur file).
//
// Urutan kolom numeric DI TEMPLATE sengaja berbeda dari urutan tampilan di
// halaman (INVOICE_DETAIL_NUMERIC_FIELDS): di template, bpjs_jkk & bpjs_jkm
// diletakkan paling depan sesuai permintaan. Parser membaca berdasarkan NAMA
// kolom (bukan posisi), jadi urutan ini bebas diubah tanpa merusak import.
const TEMPLATE_NUMERIC_ORDER = [
  'bpjs_jkk_perusahaan',
  'bpjs_jkm_perusahaan',
  'bpjs_kesehatan_perusahaan',
  'bpjs_jht_perusahaan',
  'jaminan_pensiun_perusahaan',
  'gross_3',
  'pph_21_sebulan',
  'bpjs_ketenagakerjaan_karyawan',
  'bpjs_kesehatan_karyawan',
  'dana_pensiun_karyawan',
];

// Map key → label (dari constants) untuk dipakai di guide/referensi.
const LABEL_BY_KEY = Object.fromEntries(INVOICE_DETAIL_NUMERIC_FIELDS);

const HEADER = [
  'submit_date',
  'sub_entity',
  'category3',
  'category4',
  'po_numbers',
  'invoice_numbers',
  ...TEMPLATE_NUMERIC_ORDER,
];

// Penjelasan per kolom — dipakai sebagai cell comments di baris header
const COLUMN_GUIDE = {
  submit_date:     'Format YYYY-MM-DD. Contoh: 2026-05-31',
  sub_entity:      'Kode client. Pilih SATU dari: BIERSDORF, WINGS, TRANSPULMIN, SMD, OCULUS, AML, OTHER_CLIENTS. Lihat sheet "Referensi" untuk daftar lengkap dengan nama PT.',
  category3:       'WAJIB diisi kalau sub_entity = BIERSDORF (pilih: NMA / BMC / KPL / OTHERS). Kosongkan untuk client lain.',
  category4:       'WAJIB diisi kalau category3 = NMA (pilih: NMA / TL). Kosongkan kalau category3 bukan NMA.',
  po_numbers:      'Wajib minimal 1. Format multi-PO: pisahkan dengan titik koma + spasi. Contoh: "PO-2026-001; PO-2026-002"',
  invoice_numbers: 'Opsional. Format multi-Invoice: pisahkan dengan titik koma + spasi. Contoh: "INV-2026-001; INV-2026-002"',
};
for (const k of TEMPLATE_NUMERIC_ORDER) {
  COLUMN_GUIDE[k] = `${LABEL_BY_KEY[k]}. Nilai dalam Rupiah, >= 0, tanpa pemisah ribuan. Contoh: 1500000`;
}

// 1 baris contoh per client (7 baris) — biar user paham variasi cat3/cat4
function buildExampleRows() {
  const baseAmounts = {
    bpjs_kesehatan_perusahaan:     500000,
    bpjs_jht_perusahaan:           300000,
    bpjs_jkk_perusahaan:           50000,
    bpjs_jkm_perusahaan:           20000,
    jaminan_pensiun_perusahaan:    200000,
    gross_3:                       10000000,
    pph_21_sebulan:                250000,
    bpjs_ketenagakerjaan_karyawan: 100000,
    bpjs_kesehatan_karyawan:       100000,
    dana_pensiun_karyawan:         100000,
  };
  return [
    // BIERSDORF: 3 variasi (cat3=NMA+cat4=TL, cat3=BMC, cat3=KPL)
    { submit_date: '2026-05-31', sub_entity: 'BIERSDORF',     category3: 'NMA', category4: 'TL', po_numbers: 'PO-2026-001; PO-2026-002', invoice_numbers: 'INV-2026-001', ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'BIERSDORF',     category3: 'BMC', category4: '',   po_numbers: 'PO-2026-003',              invoice_numbers: '',             ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'BIERSDORF',     category3: 'KPL', category4: '',   po_numbers: 'PO-2026-004',              invoice_numbers: '',             ...baseAmounts },
    // SMI clients (tanpa cat3/cat4)
    { submit_date: '2026-05-31', sub_entity: 'WINGS',         category3: '',    category4: '',   po_numbers: 'PO-2026-010',              invoice_numbers: 'INV-2026-010', ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'TRANSPULMIN',   category3: '',    category4: '',   po_numbers: 'PO-2026-011',              invoice_numbers: '',             ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'SMD',           category3: '',    category4: '',   po_numbers: 'PO-2026-012',              invoice_numbers: '',             ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'OCULUS',        category3: '',    category4: '',   po_numbers: 'PO-2026-013',              invoice_numbers: '',             ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'AML',           category3: '',    category4: '',   po_numbers: 'PO-2026-014',              invoice_numbers: '',             ...baseAmounts },
    { submit_date: '2026-05-31', sub_entity: 'OTHER_CLIENTS', category3: '',    category4: '',   po_numbers: 'PO-2026-015',              invoice_numbers: '',             ...baseAmounts },
  ];
}

// ============================================================
// Sheet "Referensi" — guidance lengkap
// ============================================================
function buildReferensiSheet() {
  const ref = [];

  ref.push(['PANDUAN PENGISIAN TEMPLATE INVOICE DETAIL', '']);
  ref.push(['', '']);
  ref.push(['Cara pakai:', '']);
  ref.push(['1.', 'Buka sheet "Data" → hapus baris contoh setelah Anda paham polanya.']);
  ref.push(['2.', 'Isi tiap baris dengan data Anda. Ikuti kode di tabel-tabel di bawah ini.']);
  ref.push(['3.', 'Simpan file (.xlsx), lalu klik tombol "Import Excel" di aplikasi.']);
  ref.push(['4.', 'Kalau ada baris yang salah, SEMUA baris akan ditolak — Anda dapat list error untuk diperbaiki.']);
  ref.push(['', '']);

  // ====== Tabel kode CLIENT ======
  ref.push(['KODE CLIENT (kolom "sub_entity" di sheet Data)', '']);
  ref.push(['Wajib isi salah satu kode di kolom kiri. Ketik PERSIS, huruf besar.', '']);
  ref.push(['Kode', 'Nama Lengkap PT']);
  for (const [code, def] of Object.entries(SUB_ENTITIES)) {
    if (def.type === 'client') ref.push([code, def.label]);
  }
  ref.push(['', '']);
  ref.push(['Catatan:', 'Hanya client yang boleh. Internal KBSI / Internal SMI tidak berlaku di Invoice Detail.']);
  ref.push(['', '']);

  // ====== Tabel KATEGORI 3 ======
  ref.push(['KODE KATEGORI 3 (kolom "category3" di sheet Data)', '']);
  ref.push(['WAJIB diisi kalau sub_entity = BIERSDORF. Untuk client lain, kosongkan.', '']);
  ref.push(['Kode', 'Keterangan']);
  for (const [code, label] of Object.entries(CATEGORY3)) ref.push([code, label]);
  ref.push(['', '']);
  ref.push(['Kalau sub_entity bukan BIERSDORF', 'Kosongkan kolom ini.']);
  ref.push(['', '']);

  // ====== Tabel KATEGORI 4 ======
  ref.push(['KODE KATEGORI 4 (kolom "category4" di sheet Data)', '']);
  ref.push(['WAJIB diisi kalau category3 = NMA. Untuk category3 lain (BMC/KPL), kosongkan.', '']);
  ref.push(['Kode', 'Keterangan']);
  for (const [code, label] of Object.entries(CATEGORY4)) ref.push([code, label]);
  ref.push(['', '']);

  // ====== Aturan kombinasi cat3 × client ======
  ref.push(['MATRIKS: Client mana yang boleh pakai category3?', '']);
  ref.push(['Client', 'category3 yang diizinkan']);
  for (const [code, def] of Object.entries(SUB_ENTITIES)) {
    if (def.type !== 'client') continue;
    if (code === 'BIERSDORF') ref.push([code, 'WAJIB salah satu: NMA, BMC, KPL, OTHERS']);
    else                       ref.push([code, '(kosong saja)']);
  }
  ref.push(['', '']);

  // ====== Aturan PO & Invoice ======
  ref.push(['FORMAT po_numbers & invoice_numbers', '']);
  ref.push(['po_numbers',      'WAJIB minimal 1 PO. Multi-PO dipisah "; " (titik koma + spasi). Contoh: "PO-2026-001; PO-2026-002"']);
  ref.push(['invoice_numbers', 'OPSIONAL. Boleh kosong. Multi-Invoice dipisah "; ". Contoh: "INV-2026-001; INV-2026-002"']);
  ref.push(['Penting',         'Nomor PO/Invoice HARUS sudah didaftarkan di halaman "Nomor Purchase Order" / "Nomor Invoice" sebelum import. Kalau belum ada, daftarkan dulu.']);
  ref.push(['', '']);

  // ====== Format tanggal & angka ======
  ref.push(['FORMAT TANGGAL & NOMINAL', '']);
  ref.push(['submit_date', 'YYYY-MM-DD (4 digit tahun, 2 digit bulan, 2 digit tanggal). Contoh: 2026-05-31']);
  ref.push(['nominal',     'Angka >= 0 tanpa pemisah ribuan. Boleh 0. Contoh: 1500000 (bukan "Rp 1.500.000" atau "1,500,000")']);
  ref.push(['', '']);

  // ====== Daftar kolom nominal ======
  ref.push(['10 KOLOM NOMINAL (semua wajib diisi, boleh 0)', '']);
  ref.push(['Kunci kolom', 'Keterangan']);
  for (const k of TEMPLATE_NUMERIC_ORDER) ref.push([k, LABEL_BY_KEY[k]]);

  const ws = XLSX.utils.aoa_to_sheet(ref);
  ws['!cols'] = [{ wch: 32 }, { wch: 70 }];

  // Bold untuk baris header section (cek kolom A yang ALL CAPS)
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let row = range.s.r; row <= range.e.r; row++) {
    const cellRef = XLSX.utils.encode_cell({ r: row, c: 0 });
    const cell = ws[cellRef];
    if (!cell) continue;
    const val = String(cell.v || '');
    // Section heading: dimulai dengan tulisan ALL-CAPS-LONGish
    if (/^[A-Z][A-Z0-9 :"()&×/_-]{8,}$/.test(val.split('(')[0].trim())) {
      cell.s = { font: { bold: true } };
    }
  }
  return ws;
}

// ============================================================
// Download template
// ============================================================
export function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  // ---- Sheet "Data" ----
  const dataSheet = XLSX.utils.json_to_sheet(buildExampleRows(), { header: HEADER });
  dataSheet['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 10 },
    { wch: 32 }, { wch: 32 },
    ...TEMPLATE_NUMERIC_ORDER.map(() => ({ wch: 18 })),
  ];

  // Tambah comment di tiap header cell (hover tooltip di Excel)
  HEADER.forEach((key, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    const cell = dataSheet[cellRef];
    if (!cell) return;
    cell.c = [{ a: 'Panduan', t: COLUMN_GUIDE[key] || '' }];
  });

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');

  // ---- Sheet "Referensi" ----
  XLSX.utils.book_append_sheet(wb, buildReferensiSheet(), 'Referensi');

  XLSX.writeFile(wb, 'template-invoice-detail.xlsx');
}

// ============================================================
// Parse uploaded Excel file
// ============================================================
export async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames.includes('Data') ? 'Data' : wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel kosong atau tidak valid.');

  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (raw.length === 0) throw new Error('Sheet "Data" kosong.');

  return raw.map((r, idx) => {
    // Normalisasi submit_date
    let submitDate = r.submit_date;
    if (submitDate instanceof Date) {
      submitDate = submitDate.toISOString().slice(0, 10);
    } else if (typeof submitDate === 'number') {
      const parsed = XLSX.SSF.parse_date_code(submitDate);
      if (parsed) {
        submitDate = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    } else {
      submitDate = String(submitDate || '').trim();
    }

    const splitList = (v) => String(v || '').split(/[;\n,]+/).map((s) => s.trim()).filter(Boolean);

    const out = {
      submit_date: submitDate,
      sub_entity:  String(r.sub_entity || '').trim().toUpperCase(),
      category3:   String(r.category3  || '').trim().toUpperCase() || null,
      category4:   String(r.category4  || '').trim().toUpperCase() || null,
      po_numbers:      splitList(r.po_numbers),
      invoice_numbers: splitList(r.invoice_numbers),
    };
    for (const [k] of INVOICE_DETAIL_NUMERIC_FIELDS) {
      const v = r[k];
      out[k] = (v === '' || v === null || v === undefined) ? 0 : Number(v);
    }
    out._rowNum = idx + 2;
    return out;
  });
}
