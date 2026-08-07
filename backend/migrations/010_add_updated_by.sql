-- ============================================================
-- 010_add_updated_by.sql
--
-- Tambah kolom updated_by ke 3 tabel utama yang punya operasi edit:
-- expenses, invoice_details, invoice_covers.
--
-- Kolom ini di-set tiap kali INSERT (= created_by) dan tiap UPDATE
-- (= user id yg ngedit). Untuk data lama, default = created_by.
--
-- ON DELETE SET NULL — kalau user yg pernah edit dihapus suatu hari,
-- jangan kunci row-nya. (Walaupun kita ga delete user, ini safety net.)
-- ============================================================

-- expenses
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE expenses SET updated_by = created_by WHERE updated_by IS NULL;

-- invoice_details
ALTER TABLE invoice_details
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE invoice_details SET updated_by = created_by WHERE updated_by IS NULL;

-- invoice_covers
ALTER TABLE invoice_covers
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE invoice_covers SET updated_by = created_by WHERE updated_by IS NULL;
