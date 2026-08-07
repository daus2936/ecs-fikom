-- ============================================================
-- 014_bayar_hutang.sql
-- Tabel bayar_hutang & bayar_bunga_hutang.
-- Hutang status = 'lunas' jika hutang punya ≥1 baris di kedua tabel ini.
-- ============================================================

CREATE TABLE IF NOT EXISTS bayar_hutang (
  id                      SERIAL PRIMARY KEY,
  tanggal_bayar           DATE          NOT NULL,
  nilai_bayar             NUMERIC(15,2) NOT NULL CHECK (nilai_bayar > 0),
  periode_pelunasan_hari  INTEGER       NOT NULL CHECK (periode_pelunasan_hari > 0),

  hutang_id               INTEGER       NOT NULL REFERENCES hutang(id) ON DELETE RESTRICT,
  rekening_masuk_id       INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,
  rekening_dari_id        INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,

  created_by              INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by              INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bayar_hutang_tanggal_idx ON bayar_hutang(tanggal_bayar DESC);
CREATE INDEX IF NOT EXISTS bayar_hutang_hutang_idx  ON bayar_hutang(hutang_id);

DROP TRIGGER IF EXISTS bayar_hutang_set_updated_at ON bayar_hutang;
CREATE TRIGGER bayar_hutang_set_updated_at
  BEFORE UPDATE ON bayar_hutang
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE IF NOT EXISTS bayar_bunga_hutang (
  id                  SERIAL PRIMARY KEY,
  tanggal_bayar       DATE          NOT NULL,
  nilai_bayar         NUMERIC(15,2) NOT NULL CHECK (nilai_bayar > 0),

  hutang_id           INTEGER       NOT NULL REFERENCES hutang(id) ON DELETE RESTRICT,
  rekening_masuk_id   INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,
  rekening_dari_id    INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,

  created_by          INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by          INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bayar_bunga_tanggal_idx ON bayar_bunga_hutang(tanggal_bayar DESC);
CREATE INDEX IF NOT EXISTS bayar_bunga_hutang_idx  ON bayar_bunga_hutang(hutang_id);

DROP TRIGGER IF EXISTS bayar_bunga_hutang_set_updated_at ON bayar_bunga_hutang;
CREATE TRIGGER bayar_bunga_hutang_set_updated_at
  BEFORE UPDATE ON bayar_bunga_hutang
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
