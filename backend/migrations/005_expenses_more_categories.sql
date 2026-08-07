-- ============================================================
-- 005_expenses_more_categories.sql
-- Update CHECK constraint expenses.category1 untuk terima
-- kode-kode kategori non-client tambahan:
--   pph_1_persen, listrik, air_pam, paper, tinta_printer,
--   delivery, meeting, meals, ipl, server_ekn, sewa_kantor,
--   bayar_bunga_hutang, others
--
-- Catatan: enforcement category1 ↔ expense_type tetap di layer
-- aplikasi (isCategory1ValidFor). DB hanya memastikan kode-nya
-- termasuk daftar yang dikenal — supaya fleksibel kalau di masa
-- depan ada penyesuaian per type tanpa migrasi DB lagi.
-- ============================================================

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_category1_check;

ALTER TABLE expenses ADD CONSTRAINT expenses_category1_check CHECK (
  category1 IN (
    -- Shared
    'gaji',
    'bpjs_jkk','bpjs_jkm','bpjs_kesehatan','bpjs_jht',
    'jaminan_pensiun',
    'pph_21','pph_23','ppn',
    -- Client only
    'expenses','advance_expenses','pembelian_produk','produksi',
    -- Non-Client only
    'pph_1_persen','listrik','air_pam','paper','tinta_printer',
    'delivery','meeting','meals','ipl','server_ekn',
    'sewa_kantor','bayar_bunga_hutang','others'
  )
);
