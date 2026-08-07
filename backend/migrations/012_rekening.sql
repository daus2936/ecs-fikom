-- ============================================================
-- 012_rekening.sql
-- Master data rekening bank. Dirujuk Hutang/Bayar Hutang/Bayar Bunga.
-- ============================================================

CREATE TABLE IF NOT EXISTS rekening (
  id              SERIAL PRIMARY KEY,
  nomor_rekening  VARCHAR(50)   NOT NULL UNIQUE,
  nama_pemilik    VARCHAR(200)  NOT NULL,
  nama_bank       VARCHAR(100)  NOT NULL,

  created_by      INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by      INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rekening_nama_bank_idx ON rekening(nama_bank);

DROP TRIGGER IF EXISTS rekening_set_updated_at ON rekening;
CREATE TRIGGER rekening_set_updated_at
  BEFORE UPDATE ON rekening
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
