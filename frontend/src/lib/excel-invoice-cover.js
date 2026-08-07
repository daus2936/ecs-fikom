// ============================================================
// Excel helpers untuk Invoice Cover.
// Struktur identik dengan Invoice Detail tapi pakai 7 field cover.
// ============================================================
import * as XLSX from 'xlsx';
import { INVOICE_COVER_NUMERIC_FIELDS } from './invoice-cover-constants.js';
import { SUB_ENTITIES, CATEGORY3 } from './expense-constants.js';

const HEADER = [
  'submit_date',
  'sub_entity',
  'category3',
  'nomor_faktur_pajak',
  'po_numbers',
  'invoice_numbers',
  ...INVOICE_COVER_NUMERIC_FIELDS.map(([k]) => k),
];

const COLUMN_GUIDE = {
  submit_date:        'Format YYYY-MM-DD. Contoh: 2026-05-31',
  sub_entity:         'Kode client. Pilih SATU dari: BIERSDORF, WINGS, TRANSPULMIN, SMD, OCULUS, AML, OTHER_CLIENTS. Lihat sheet "Referensi" untuk daftar lengkap.',
  category3:          'WAJIB diisi kalau sub_entity = BIERSDORF (pilih: NMA / BMC / KPL). Kosongkan untuk client lain.',
  nomor_faktur_pajak: 'WAJIB. Nomor Faktur Pajak (maks 50 karakter). Contoh: 010.000-26.12345678',
  po_numbers:         'Wajib minimal 1. Multi-PO: pisah dgn "; ". Contoh: "PO-2026-001; PO-2026-002"',
  invoice_numbers:    'Opsional. Multi-Invoice: pisah dgn "; ". Contoh: "INV-2026-001; INV-2026-002"',
};
for (const [k, label] of INVOICE_COVER_NUMERIC_FIELDS) {
  COLUMN_GUIDE[k] = `${label}. Nilai dalam Rupiah, >= 0, tanpa pemisah ribuan. Contoh: 1500000`;
}

function buildExampleRows() {
  // 7 field nominal sebagai contoh ilustratif (angka konsisten matematis)
  const baseAmounts = {
    total_biaya:     10000000,
    fee:               500000,
    sub_total_1:     10500000,   // = total_biaya + fee
    ppn:              1155000,   // 11% dari sub_total_1
    sub_total_2:     11655000,   // = sub_total_1 + ppn
    pph_23_2_persen:   210000,   // 2% dari sub_total_1
    total:           11445000,   // = sub_total_2 - pph_23
  };
  return [
    // BIERSDORF — 3 variasi cat3
    { submit_date:'2026-05-31', sub_entity:'BIERSDORF',     category3:'NMA', nomor_faktur_pajak:'010.000-26.00000001', po_numbers:'PO-2026-001; PO-2026-002', invoice_numbers:'INV-2026-001', ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'BIERSDORF',     category3:'BMC', nomor_faktur_pajak:'010.000-26.00000002', po_numbers:'PO-2026-003',              invoice_numbers:'',             ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'BIERSDORF',     category3:'KPL', nomor_faktur_pajak:'010.000-26.00000003', po_numbers:'PO-2026-004',              invoice_numbers:'',             ...baseAmounts },
    // SMI clients
    { submit_date:'2026-05-31', sub_entity:'WINGS',         category3:'',    nomor_faktur_pajak:'010.000-26.00000010', po_numbers:'PO-2026-010',              invoice_numbers:'INV-2026-010', ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'TRANSPULMIN',   category3:'',    nomor_faktur_pajak:'010.000-26.00000011', po_numbers:'PO-2026-011',              invoice_numbers:'',             ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'SMD',           category3:'',    nomor_faktur_pajak:'010.000-26.00000012', po_numbers:'PO-2026-012',              invoice_numbers:'',             ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'OCULUS',        category3:'',    nomor_faktur_pajak:'010.000-26.00000013', po_numbers:'PO-2026-013',              invoice_numbers:'',             ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'AML',           category3:'',    nomor_faktur_pajak:'010.000-26.00000014', po_numbers:'PO-2026-014',              invoice_numbers:'',             ...baseAmounts },
    { submit_date:'2026-05-31', sub_entity:'OTHER_CLIENTS', category3:'',    nomor_faktur_pajak:'010.000-26.00000015', po_numbers:'PO-2026-015',              invoice_numbers:'',             ...baseAmounts },
  ];
}

function buildReferensiSheet() {
  const ref = [];

  ref.push(['PANDUAN PENGISIAN TEMPLATE INVOICE COVER', '']);
  ref.push(['', '']);
  ref.push(['Cara pakai:', '']);
  ref.push(['1.', 'Buka sheet "Data" → hapus baris contoh setelah Anda paham polanya.']);
  ref.push(['2.', 'Isi tiap baris dengan data Anda. Ikuti kode di tabel-tabel di bawah ini.']);
  ref.push(['3.', 'Simpan file (.xlsx), lalu klik tombol "Import Excel" di aplikasi.']);
  ref.push(['4.', 'Kalau ada baris yang salah, SEMUA baris akan ditolak — Anda dapat list error untuk diperbaiki.']);
  ref.push(['', '']);

  ref.push(['KODE CLIENT (kolom "sub_entity" di sheet Data)', '']);
  ref.push(['Wajib isi salah satu kode di kolom kiri. Ketik PERSIS, huruf besar.', '']);
  ref.push(['Kode', 'Nama Lengkap PT']);
  for (const [code, def] of Object.entries(SUB_ENTITIES)) {
    if (def.type === 'client') ref.push([code, def.label]);
  }
  ref.push(['', '']);
  ref.push(['Catatan:', 'Hanya client yang boleh. Internal KBSI / Internal SMI tidak berlaku di Invoice Cover.']);
  ref.push(['', '']);

  ref.push(['KODE KATEGORI 3 (kolom "category3" di sheet Data)', '']);
  ref.push(['WAJIB diisi kalau sub_entity = BIERSDORF. Untuk client lain, kosongkan.', '']);
  ref.push(['Kode', 'Keterangan']);
  for (const [code, label] of Object.entries(CATEGORY3)) ref.push([code, label]);
  ref.push(['', '']);
  ref.push(['Kalau sub_entity bukan BIERSDORF', 'Kosongkan kolom ini.']);
  ref.push(['Catatan',                          'Invoice Cover TIDAK memiliki category4 (berbeda dengan Invoice Detail).']);
  ref.push(['', '']);

  ref.push(['MATRIKS: Client mana yang boleh pakai category3?', '']);
  ref.push(['Client', 'category3 yang diizinkan']);
  for (const [code, def] of Object.entries(SUB_ENTITIES)) {
    if (def.type !== 'client') continue;
    if (code === 'BIERSDORF') ref.push([code, 'WAJIB salah satu: NMA, BMC, KPL']);
    else                       ref.push([code, '(kosong saja)']);
  }
  ref.push(['', '']);

  ref.push(['FORMAT po_numbers & invoice_numbers', '']);
  ref.push(['po_numbers',      'WAJIB minimal 1 PO. Multi-PO dipisah "; ". Contoh: "PO-2026-001; PO-2026-002"']);
  ref.push(['invoice_numbers', 'OPSIONAL. Multi-Invoice dipisah "; ". Contoh: "INV-2026-001; INV-2026-002"']);
  ref.push(['Penting',         'Nomor PO/Invoice HARUS sudah didaftarkan di halaman "Nomor Purchase Order" / "Nomor Invoice".']);
  ref.push(['', '']);

  ref.push(['FORMAT TANGGAL & NOMINAL', '']);
  ref.push(['submit_date', 'YYYY-MM-DD. Contoh: 2026-05-31']);
  ref.push(['nominal',     'Angka >= 0 tanpa pemisah ribuan. Boleh 0. Contoh: 1500000 (bukan "Rp 1.500.000")']);
  ref.push(['', '']);

  ref.push(['7 KOLOM NOMINAL (semua wajib, boleh 0)', '']);
  ref.push(['Kunci kolom', 'Keterangan']);
  for (const [k, label] of INVOICE_COVER_NUMERIC_FIELDS) ref.push([k, label]);

  const ws = XLSX.utils.aoa_to_sheet(ref);
  ws['!cols'] = [{ wch: 32 }, { wch: 70 }];
  return ws;
}

export function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  const dataSheet = XLSX.utils.json_to_sheet(buildExampleRows(), { header: HEADER });
  dataSheet['!cols'] = [
    { wch: 12 }, { wch: 16 }, { wch: 10 },
    { wch: 32 }, { wch: 32 },
    ...INVOICE_COVER_NUMERIC_FIELDS.map(() => ({ wch: 18 })),
  ];
  HEADER.forEach((key, colIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIdx });
    const cell = dataSheet[cellRef];
    if (!cell) return;
    cell.c = [{ a: 'Panduan', t: COLUMN_GUIDE[key] || '' }];
  });
  XLSX.utils.book_append_sheet(wb, dataSheet, 'Data');
  XLSX.utils.book_append_sheet(wb, buildReferensiSheet(), 'Referensi');

  XLSX.writeFile(wb, 'template-invoice-cover.xlsx');
}

export async function parseExcelFile(file) {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const sheetName = wb.SheetNames.includes('Data') ? 'Data' : wb.SheetNames[0];
  if (!sheetName) throw new Error('File Excel kosong atau tidak valid.');

  const sheet = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  if (raw.length === 0) throw new Error('Sheet "Data" kosong.');

  return raw.map((r, idx) => {
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
      nomor_faktur_pajak: String(r.nomor_faktur_pajak || '').trim(),
      po_numbers:      splitList(r.po_numbers),
      invoice_numbers: splitList(r.invoice_numbers),
    };
    for (const [k] of INVOICE_COVER_NUMERIC_FIELDS) {
      const v = r[k];
      out[k] = (v === '' || v === null || v === undefined) ? 0 : Number(v);
    }
    out._rowNum = idx + 2;
    return out;
  });
}
