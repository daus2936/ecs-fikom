-- ============================================================
-- 020_users_add_custom_roles.sql
--
-- Tambah 3 role baru ke CHECK constraint kolom users.role:
--   - All-EX-GP-ED-INV : semua akses kecuali GP; tidak bisa edit Invoice/Detail/Cover
--   - EXP-INV          : hanya Expenses + Invoice/Detail/Cover; edit cuma di Expenses
--   - All-View         : viewer semua halaman kecuali GP; tidak bisa input/edit/hapus
--
-- Pakai DROP + ADD constraint. Nama constraint default PostgreSQL
-- untuk inline CHECK biasanya users_role_check.
-- ============================================================

DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'users'::regclass
    AND contype  = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%';
  IF cname IS NOT NULL THEN
    EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(cname);
  END IF;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'superadmin',
    'admin',
    'user',
    'All-EX-GP-ED-INV',
    'EXP-INV',
    'All-View'
  ));
