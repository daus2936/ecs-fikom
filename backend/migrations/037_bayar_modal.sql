-- ============================================================
-- 037_bayar_modal.sql
-- Tabel bayar_modal (halaman "BM"). Klon bayar_hutang dengan modifikasi:
--   - TANPA periode_pelunasan_hari.
--   - FK ke modal (modal_id), bukan hutang.
-- Status Modal = 'lunas' jika total bayar_modal >= nilai_modal
-- (tidak ada konsep bunga untuk Modal).
-- ============================================================

CREATE TABLE IF NOT EXISTS bayar_modal (
  id                      SERIAL PRIMARY KEY,
  tanggal_bayar           DATE          NOT NULL,
  nilai_bayar             NUMERIC(15,2) NOT NULL CHECK (nilai_bayar > 0),

  modal_id                INTEGER       NOT NULL REFERENCES modal(id) ON DELETE RESTRICT,
  rekening_masuk_id       INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,
  rekening_dari_id        INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,

  created_by              INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by              INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bayar_modal_tanggal_idx ON bayar_modal(tanggal_bayar DESC);
CREATE INDEX IF NOT EXISTS bayar_modal_modal_idx   ON bayar_modal(modal_id);

DROP TRIGGER IF EXISTS bayar_modal_set_updated_at ON bayar_modal;
CREATE TRIGGER bayar_modal_set_updated_at
  BEFORE UPDATE ON bayar_modal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
