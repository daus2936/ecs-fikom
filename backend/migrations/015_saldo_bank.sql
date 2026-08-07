-- ============================================================
-- 015_saldo_bank.sql
-- Tabel saldo bank. foto disimpan di disk; kolom ini hanya
-- nama file (mis. "abc123.jpg") di bawah folder uploads/saldo-bank/.
-- ============================================================

CREATE TABLE IF NOT EXISTS saldo_bank (
  id                  SERIAL PRIMARY KEY,
  tanggal_sisa_saldo  DATE          NOT NULL,
  nominal             NUMERIC(15,2) NOT NULL CHECK (nominal >= 0),
  foto_filename       VARCHAR(200)  NOT NULL,
  foto_original_name  VARCHAR(255),
  foto_mimetype       VARCHAR(100),

  created_by          INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by          INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS saldo_bank_tanggal_idx ON saldo_bank(tanggal_sisa_saldo DESC);

DROP TRIGGER IF EXISTS saldo_bank_set_updated_at ON saldo_bank;
CREATE TRIGGER saldo_bank_set_updated_at
  BEFORE UPDATE ON saldo_bank
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
