-- ============================================================
-- 021_users_add_2fa.sql
--
-- Tambah kolom untuk 2FA (TOTP / authenticator app):
--   - twofa_enabled : apakah 2FA aktif untuk user ini
--   - twofa_secret  : base32 secret untuk generate TOTP (NULL kalau tidak aktif)
--
-- Tidak ada backup codes (sesuai permintaan).
-- Admin bisa reset (mematikan) 2FA user lain → set enabled=false, secret=NULL.
-- ============================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twofa_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS twofa_secret VARCHAR(64);
