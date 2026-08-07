-- ============================================================
-- 006_invoices_add_description.sql
-- Tambah kolom description (opsional) ke tabel invoices.
-- ============================================================

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS description TEXT;
