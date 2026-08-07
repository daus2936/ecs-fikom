-- ============================================================
-- 013_hutang.sql
-- Tabel hutang. kode_hutang auto-generate dari id:
-- HTG-000001, HTG-000002, dst (6 digit zero-padded).
-- Status (Lunas/Belom Lunas) di-derive di query — tidak disimpan.
-- ============================================================

CREATE TABLE IF NOT EXISTS hutang (
  id                    SERIAL PRIMARY KEY,
  -- GENERATED column: dihasilkan otomatis dari id, immutable & stored.
  -- Postgres jamin kode unik karena id unik.
  kode_hutang           VARCHAR(20) GENERATED ALWAYS AS ('HTG-' || lpad(id::text, 6, '0')) STORED,

  tanggal_menghutang    DATE          NOT NULL,
  nilai_hutang          NUMERIC(15,2) NOT NULL CHECK (nilai_hutang > 0),
  periode_pinjam_hari   INTEGER       NOT NULL CHECK (periode_pinjam_hari >= 0),

  rekening_masuk_id     INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,
  untuk_bayar_apa       VARCHAR(500)  NOT NULL,
  dari_siapa            VARCHAR(200)  NOT NULL,
  rekening_dari_id      INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,

  created_by            INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by            INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS hutang_tanggal_idx     ON hutang(tanggal_menghutang DESC);
CREATE INDEX IF NOT EXISTS hutang_kode_idx        ON hutang(kode_hutang);
CREATE INDEX IF NOT EXISTS hutang_rek_masuk_idx   ON hutang(rekening_masuk_id);
CREATE INDEX IF NOT EXISTS hutang_rek_dari_idx    ON hutang(rekening_dari_id);

DROP TRIGGER IF EXISTS hutang_set_updated_at ON hutang;
CREATE TRIGGER hutang_set_updated_at
  BEFORE UPDATE ON hutang
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
