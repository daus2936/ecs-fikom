-- ============================================================
-- 018_invoice_covers_add_nomor_faktur_pajak.sql
--
-- Tambah kolom nomor_faktur_pajak di invoice_covers.
-- VARCHAR(50) NOT NULL DEFAULT '' supaya row existing kompatibel.
-- Aplikasi (zod) memvalidasi non-empty pada input baru/edit.
-- ============================================================

ALTER TABLE invoice_covers
  ADD COLUMN IF NOT EXISTS nomor_faktur_pajak VARCHAR(50) NOT NULL DEFAULT '';

-- Index opsional kalau nanti perlu search berdasarkan nomor faktur.
CREATE INDEX IF NOT EXISTS invoice_covers_nomor_faktur_pajak_idx
  ON invoice_covers(nomor_faktur_pajak);
