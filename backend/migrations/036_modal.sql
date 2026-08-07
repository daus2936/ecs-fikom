-- ============================================================
-- 036_modal.sql
-- Tabel modal (halaman "M"). Klon hutang dengan modifikasi:
--   - TANPA periode_pinjam_hari.
--   - kode_modal auto-generate: MDL-000001, MDL-000002, dst.
--   - "Hutang" → "Modal" pada kolom inti (kode/tanggal/nilai).
-- Status (Lunas/Belom Lunas) di-derive di query — tidak disimpan.
-- ============================================================

CREATE TABLE IF NOT EXISTS modal (
  id                    SERIAL PRIMARY KEY,
  kode_modal            VARCHAR(20) GENERATED ALWAYS AS ('MDL-' || lpad(id::text, 6, '0')) STORED,

  tanggal_modal         DATE          NOT NULL,
  nilai_modal           NUMERIC(15,2) NOT NULL CHECK (nilai_modal > 0),

  rekening_masuk_id     INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,
  untuk_bayar_apa       VARCHAR(500)  NOT NULL,
  dari_siapa            VARCHAR(200)  NOT NULL,
  rekening_dari_id      INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,

  created_by            INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by            INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS modal_tanggal_idx     ON modal(tanggal_modal DESC);
CREATE INDEX IF NOT EXISTS modal_kode_idx        ON modal(kode_modal);
CREATE INDEX IF NOT EXISTS modal_rek_masuk_idx   ON modal(rekening_masuk_id);
CREATE INDEX IF NOT EXISTS modal_rek_dari_idx    ON modal(rekening_dari_id);

DROP TRIGGER IF EXISTS modal_set_updated_at ON modal;
CREATE TRIGGER modal_set_updated_at
  BEFORE UPDATE ON modal
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
