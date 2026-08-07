-- ============================================================
-- 035_db_before_2025_reprefix.sql
--
-- Halaman "DB" (live) memakai kode prefix DB-. Agar tidak bentrok
-- dengan db_before_2025 (yang sebelumnya juga DB-), kode lama di
-- db_before_2025 di-ubah menjadi DBB- (konsisten dgn pola EXP-/EXPB-).
--
-- Idempoten: hanya mengubah baris yang masih berprefix 'DB-' dan
-- belum 'DBB-'. Aman dijalankan berulang.
-- ============================================================

UPDATE db_before_2025
SET expense_code = 'DBB-' || substring(expense_code from 4)
WHERE expense_code LIKE 'DB-%'
  AND expense_code NOT LIKE 'DBB-%';
