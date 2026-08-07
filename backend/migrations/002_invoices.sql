-- ============================================================
-- 002_invoices.sql
-- Tabel invoice. Nomor invoice unik, dijadikan rujukan oleh
-- tabel-tabel lain berikutnya (expense, dll).
--   - invoice_number UNIQUE   → konsistensi referensi
--   - created_by RESTRICT     → user yang punya invoice tidak bisa di-delete
--                                (kita memang tidak delete user, tapi safety net)
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id              SERIAL PRIMARY KEY,
  invoice_number  VARCHAR(100) NOT NULL UNIQUE,
  created_by      INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_created_by_idx ON invoices(created_by);
CREATE INDEX IF NOT EXISTS invoices_created_at_idx ON invoices(created_at DESC);

-- Trigger auto-update updated_at (fungsi set_updated_at sudah dibuat di migrasi 001)
DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
