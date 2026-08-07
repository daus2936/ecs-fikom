// ============================================================
// Konstanta untuk modul Nei.
// 7 field nominal — urutannya HARUS stabil supaya template Excel
// match dengan parser di sisi import.
// Harus sinkron dengan backend/src/routes/nei.js
// ============================================================

// [key, label] — label dipakai juga di header Excel
export const NEI_NUMERIC_FIELDS = [
  ['total_biaya',     'Total Biaya'],
  ['fee',             'Fee'],
  ['sub_total_1',     'SUB TOTAL 1'],
  ['ppn',             'PPN'],
  ['sub_total_2',     'SUB TOTAL 2'],
  ['pph_23_2_persen', 'PPH 23 2%'],
  ['total',           'TOTAL'],
];
