// ============================================================
// Konstanta untuk modul Invoice Detail.
// 8 field nominal — urutannya HARUS stabil supaya template Excel
// match dengan parser di sisi import.
// Harus sinkron dengan backend/src/routes/invoice-details.js
// ============================================================

// [key, label] — label dipakai juga di header Excel
export const INVOICE_DETAIL_NUMERIC_FIELDS = [
  ['bpjs_kesehatan_perusahaan',     'BPJS Kesehatan Dari Perusahaan'],
  ['bpjs_jht_perusahaan',           'BPJS Ketenagakerjaan (JHT) Dari Perusahaan'],
  ['bpjs_jkk_perusahaan',           'BPJS Ketenagakerjaan (JKK) Dari Perusahaan'],
  ['bpjs_jkm_perusahaan',           'BPJS Ketenagakerjaan (JKM) Dari Perusahaan'],
  ['jaminan_pensiun_perusahaan',    'Jaminan Pensiun Dari Perusahaan'],
  ['gross_3',                       'Gross 3'],
  ['pph_21_sebulan',                'PPh 21 (Sebulan)'],
  ['bpjs_ketenagakerjaan_karyawan', 'BPJS Ketenagakerjaan Dari Karyawan'],
  ['bpjs_kesehatan_karyawan',       'BPJS Kesehatan Dari Karyawan'],
  ['dana_pensiun_karyawan',         'Dana Pensiun Dari Karyawan'],
];
