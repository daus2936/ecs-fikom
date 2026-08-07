-- ============================================================
-- 025_saldo_bank_foto_optional.sql
--
-- Foto pada Saldo Bank kini OPSIONAL (tidak wajib).
-- Relax kolom foto_filename dari NOT NULL → nullable.
-- ============================================================

ALTER TABLE saldo_bank ALTER COLUMN foto_filename DROP NOT NULL;
