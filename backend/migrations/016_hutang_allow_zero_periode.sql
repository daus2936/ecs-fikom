-- ============================================================
-- 016_hutang_allow_zero_periode.sql
--
-- Relax CHECK constraint pada hutang.periode_pinjam_hari:
-- sebelumnya WAJIB > 0, sekarang BOLEH = 0.
-- Migration ini aman untuk DB yang sudah punya migration 013 ter-apply.
-- ============================================================

-- Drop old constraint (nama-nya bisa beda di PG, jadi pakai DO-block).
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'hutang'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) LIKE '%periode_pinjam_hari%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE hutang DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE hutang
  ADD CONSTRAINT hutang_periode_pinjam_hari_check
  CHECK (periode_pinjam_hari >= 0);
