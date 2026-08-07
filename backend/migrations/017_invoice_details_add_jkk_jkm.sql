-- ============================================================
-- 017_invoice_details_add_jkk_jkm.sql
--
-- Tambah 2 kolom nominal di invoice_details:
--   - bpjs_jkk_perusahaan  (BPJS Ketenagakerjaan JKK Dari Perusahaan)
--   - bpjs_jkm_perusahaan  (BPJS Ketenagakerjaan JKM Dari Perusahaan)
--
-- DEFAULT 0 supaya row existing terisi otomatis (backfill aman).
-- ============================================================

ALTER TABLE invoice_details
  ADD COLUMN IF NOT EXISTS bpjs_jkk_perusahaan NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (bpjs_jkk_perusahaan >= 0),
  ADD COLUMN IF NOT EXISTS bpjs_jkm_perusahaan NUMERIC(15,2) NOT NULL DEFAULT 0
    CHECK (bpjs_jkm_perusahaan >= 0);
