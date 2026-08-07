// ============================================================
// Konstanta entitas & kategori untuk expense.
// Backend & frontend pakai shape yang sama
// (lihat frontend/src/lib/expense-constants.js).
// ============================================================

// Parent company → label.
// Field ini disimpan di DB untuk keperluan analytics/grouping,
// tapi TIDAK lagi ditampilkan di form. Auto-derive dari sub_entity.
export const PARENT_COMPANIES = {
  KBSI: 'PT Kiprah Bangun Sinergi Indonesia (KBSI)',
  SMI:  'PT Semesta Masyhur Indonesia (PT SMI)',
};

// Sub-entitas → { label, parent, type }
// type: 'client' | 'non_client'
// User sekarang langsung pilih sub_entity. Backend derive parent.
export const SUB_ENTITIES = {
  // Client (semua langsung di tingkat ini, tanpa parent dropdown)
  BIERSDORF:      { label: 'PT Biersdorf Indonesia',                  parent: 'KBSI', type: 'client' },
  WINGS:          { label: 'PT Sayap Mas Utama (Wings)',              parent: 'SMI',  type: 'client' },
  TRANSPULMIN:    { label: 'PT Transfarma Medica Indah (Transpulmin)', parent: 'SMI', type: 'client' },
  SMD:            { label: 'PT Sinergi Multi Distrindo (SMD)',        parent: 'SMI',  type: 'client' },
  OCULUS:         { label: 'PT Oculus (Softlense)',                   parent: 'SMI',  type: 'client' },
  AML:            { label: 'PT AML',                                  parent: 'SMI',  type: 'client' },
  OTHER_CLIENTS:  { label: 'Other Clients',                           parent: 'SMI',  type: 'client' },
  // Non-Client
  INTERNAL_KBSI:  { label: 'Internal KBSI',                           parent: 'KBSI', type: 'non_client' },
  INTERNAL_SMI:   { label: 'Internal SMI',                            parent: 'SMI',  type: 'non_client' },
};

// Master label map untuk semua kode category1
export const CATEGORY1 = {
  // === Shared ===
  gaji:              'Gaji',
  bpjs_jkk:          'BPJS Ketenagakerjaan (JKK) — Perusahaan & Karyawan',
  bpjs_jkm:          'BPJS Ketenagakerjaan (JKM) — Perusahaan & Karyawan',
  bpjs_kesehatan:    'BPJS Kesehatan — Perusahaan & Karyawan',
  bpjs_jht:          'BPJS Ketenagakerjaan (JHT) — Perusahaan & Karyawan',
  jaminan_pensiun:   'Jaminan Pensiun — Perusahaan & Karyawan',
  pph_21:            'PPh 21 Karyawan',
  pph_23:            'PPh 23',
  ppn:               'PPN',
  // === Client only ===
  expenses:          'Expenses',
  advance_expenses:  'Advance Expenses',
  pembelian_produk:  'Pembelian Produk',
  produksi:          'Produksi',
  // === Non-Client only ===
  pph_1_persen:        'PPh 1%',
  listrik:             'Listrik',
  air_pam:             'Air PAM',
  paper:               'Paper',
  tinta_printer:       'Tinta Printer',
  delivery:            'Delivery',
  meeting:             'Meeting',
  meals:               'Meals',
  ipl:                 'IPL',
  server_ekn:          'Server EKN',
  sewa_kantor:         'Sewa Kantor',
  bayar_bunga_hutang:  'Bayar Bunga Hutang',
  others:              'Others',
};

const CATEGORY1_SHARED = [
  'gaji', 'bpjs_jkk', 'bpjs_jkm', 'bpjs_kesehatan', 'bpjs_jht',
  'jaminan_pensiun', 'pph_21', 'pph_23', 'ppn',
];
export const CATEGORY1_CLIENT = [
  ...CATEGORY1_SHARED,
  'expenses', 'advance_expenses', 'pembelian_produk', 'produksi', 'others',
];
export const CATEGORY1_NON_CLIENT = [
  ...CATEGORY1_SHARED,
  'pph_1_persen', 'listrik', 'air_pam', 'paper', 'tinta_printer',
  'delivery', 'meeting', 'meals', 'ipl', 'server_ekn',
  'sewa_kantor', 'bayar_bunga_hutang', 'others',
];

// Catatan: CATEGORY2 sudah TIDAK ADA. Dihapus sesuai revisi.
// Kategori 3 sekarang langsung muncul untuk sub_entity = BIERSDORF.

export const CATEGORY3 = {
  NMA: 'NMA',
  BMC: 'BMC',
  KPL: 'KPL',
  OTHERS: 'OTHERS',
};

// Kategori 4 — sub-pilihan kalau category3 = NMA (utk Invoice Detail)
export const CATEGORY4 = {
  NMA: 'NMA',
  TL:  'TL',
};

// Daftar kode sub_entity yg termasuk Client (dipakai oleh Invoice Detail)
export const CLIENT_SUB_ENTITY_CODES = Object.entries(SUB_ENTITIES)
  .filter(([, def]) => def.type === 'client')
  .map(([code]) => code);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Validasi: sub_entity ada di SUB_ENTITIES & cocok dgn expense_type */
export function isSubEntityValidFor(subEntity, expenseType) {
  const def = SUB_ENTITIES[subEntity];
  if (!def) return false;
  return def.type === expenseType;
}

/** Derive parent_company dari sub_entity */
export function deriveParentCompany(subEntity) {
  return SUB_ENTITIES[subEntity]?.parent || null;
}

/** category1 berlaku utk expense_type? */
export function isCategory1ValidFor(category1, expenseType) {
  if (!expenseType) return false;
  const codes = expenseType === 'non_client' ? CATEGORY1_NON_CLIENT : CATEGORY1_CLIENT;
  return codes.includes(category1);
}

/** Kategori 3 berlaku hanya kalau sub_entity = BIERSDORF */
export function isCategory3Applicable(subEntity) {
  return subEntity === 'BIERSDORF';
}
