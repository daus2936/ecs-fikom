-- ============================================================
-- 023_expenses_expense_code_per_day.sql
--
-- Ubah format expense_code menjadi PER TANGGAL INPUT:
--   Format: EXP-DDMMYY-NNNN  (contoh: EXP-290526-0001)
--   - DDMMYY = tanggal dari created_at (tanggal input)
--   - NNNN   = counter 4 digit, reset tiap HARI
--
-- Catatan: saat migration ini dibuat, belum ada data expense.
-- Jadi tidak ada backfill. Kolom + unique index sudah dibuat di
-- migration 022. Migration ini hanya memastikan kolom & index ada
-- (idempotent) — generate format baru ditangani aplikasi.
--
-- Kalau ADA data lama dengan format berbeda (EXP-YYYY-NNNNN), data
-- itu TIDAK diutak-atik (unik tetap valid). Hanya data baru yang
-- pakai format DDMMYY.
-- ============================================================

-- Pastikan kolom ada (kalau 022 belum/sudah jalan, ini aman).
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS expense_code VARCHAR(20);

-- Pastikan unique index ada.
CREATE UNIQUE INDEX IF NOT EXISTS expenses_expense_code_unique
  ON expenses(expense_code);
