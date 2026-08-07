-- ============================================================
-- 028_nei_add_updated_by.sql
--
-- Menambahkan kolom updated_by ke tabel nei.
-- Kolom ini terlewat di 027; route nei.js menyeleksi c.updated_by
-- (warisan invoice_covers yang mendapat updated_by lewat 010_add_updated_by.sql).
--
-- Idemponten: aman dijalankan walau kolom sudah ada.
-- Untuk yang baru pertama setup, 027 sudah menyertakan updated_by;
-- migrasi 028 ini tidak akan mengubah apa pun (IF NOT EXISTS).
-- ============================================================

ALTER TABLE nei
  ADD COLUMN IF NOT EXISTS updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

UPDATE nei SET updated_by = created_by WHERE updated_by IS NULL;

CREATE INDEX IF NOT EXISTS nei_updated_by_idx ON nei(updated_by);
