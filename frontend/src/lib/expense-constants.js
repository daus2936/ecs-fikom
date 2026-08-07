// ============================================================
// Konstanta entitas & kategori untuk expense.
// Harus sinkron dengan backend/src/constants/expense.js
// ============================================================

// Parent company — kept untuk display kalau dibutuhkan,
// tapi user TIDAK lagi memilih ini. Auto-derive dari sub_entity di backend.
export const PARENT_COMPANIES = {
  KBSI: 'PT Kiprah Bangun Sinergi Indonesia (KBSI)',
  SMI:  'PT Semesta Masyhur Indonesia (PT SMI)',
};

// Sub-entitas → { label, parent, type }
export const SUB_ENTITIES = {
  BIERSDORF:      { label: 'PT Biersdorf Indonesia',                  parent: 'KBSI', type: 'client' },
  WINGS:          { label: 'PT Sayap Mas Utama (Wings)',              parent: 'SMI',  type: 'client' },
  TRANSPULMIN:    { label: 'PT Transfarma Medica Indah (Transpulmin)', parent: 'SMI', type: 'client' },
  SMD:            { label: 'PT Sinergi Multi Distrindo (SMD)',        parent: 'SMI',  type: 'client' },
  OCULUS:         { label: 'PT Oculus (Softlense)',                   parent: 'SMI',  type: 'client' },
  AML:            { label: 'PT AML',                                  parent: 'SMI',  type: 'client' },
  OTHER_CLIENTS:  { label: 'Other Clients',                           parent: 'SMI',  type: 'client' },
  INTERNAL_KBSI:  { label: 'Internal KBSI',                           parent: 'KBSI', type: 'non_client' },
  INTERNAL_SMI:   { label: 'Internal SMI',                            parent: 'SMI',  type: 'non_client' },
};

export const CATEGORY1 = {
  gaji:              'Gaji',
  bpjs_jkk:          'BPJS Ketenagakerjaan (JKK) — Perusahaan & Karyawan',
  bpjs_jkm:          'BPJS Ketenagakerjaan (JKM) — Perusahaan & Karyawan',
  bpjs_kesehatan:    'BPJS Kesehatan — Perusahaan & Karyawan',
  bpjs_jht:          'BPJS Ketenagakerjaan (JHT) — Perusahaan & Karyawan',
  jaminan_pensiun:   'Jaminan Pensiun — Perusahaan & Karyawan',
  pph_21:            'PPh 21 Karyawan',
  pph_23:            'PPh 23',
  ppn:               'PPN',
  expenses:          'Expenses',
  advance_expenses:  'Advance Expenses',
  pembelian_produk:  'Pembelian Produk',
  produksi:          'Produksi',
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

// Catatan: CATEGORY2 sudah dihapus dari skema baru.

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

/** Daftar opsi client (sub_entity yang type='client'), dipakai Invoice Detail */
export function getClientOptions() {
  return Object.entries(SUB_ENTITIES)
    .filter(([, def]) => def.type === 'client')
    .map(([code, def]) => ({ code, label: def.label }));
}

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

/** Daftar opsi category1 utk expense_type tertentu */
export function getCategory1Options(expenseType) {
  if (!expenseType) return [];
  const codes = expenseType === 'non_client' ? CATEGORY1_NON_CLIENT : CATEGORY1_CLIENT;
  return codes.map((code) => ({ code, label: CATEGORY1[code] }));
}

export function isCategory1ValidFor(category1, expenseType) {
  if (!expenseType || !category1) return false;
  const codes = expenseType === 'non_client' ? CATEGORY1_NON_CLIENT : CATEGORY1_CLIENT;
  return codes.includes(category1);
}

/** Daftar sub-entity (yang langsung dipilih user) per tipe */
export function getSubEntitiesByType(expenseType) {
  return Object.entries(SUB_ENTITIES)
    .filter(([, def]) => def.type === expenseType)
    .map(([code, def]) => ({ code, label: def.label }));
}

/** Kategori 3 hanya muncul kalau sub_entity = BIERSDORF */
export function isCategory3Applicable(subEntity) {
  return subEntity === 'BIERSDORF';
}

// Label getter
export const subEntityLabel = (code) => SUB_ENTITIES[code]?.label || code;
export const parentLabel    = (code) => PARENT_COMPANIES[code] || code;
export const cat1Label      = (code) => CATEGORY1[code] || code;
export const cat3Label      = (code) => CATEGORY3[code] || code;
export const cat4Label      = (code) => CATEGORY4[code] || code;
