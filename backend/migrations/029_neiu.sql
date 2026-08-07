-- ============================================================
-- 029_neiu.sql
--
-- Tabel neiu (halaman NeiU) — mirip hutang, dengan modifikasi:
--   - kode_used auto-generate: USED-000001, dst (pengganti kode_hutang).
--   - rekening_tujuan_id (pengganti "Masuk ke Rekening Mana" → "Rekening Tujuan").
--   - TIDAK ada: rekening_dari (Dari Rekening Mana), dari_siapa, periode_pinjam_hari.
--   - Field tetap: tanggal (tanggal_menghutang), nilai_hutang, untuk_bayar_apa.
--   - Status (Open/Close) TIDAK disimpan — di-derive dari pembayaran (tabel neip):
--       total bayar >= nilai_hutang  → 'close' (sudah lunas)
--       selain itu                   → 'open'  (belum lunas)
--
-- Tabel neip (pembayaran NeiU) dibuat sekarang dengan struktur minimal
-- supaya derivasi status valid. Halaman/route NeiP akan dibangun menyusul.
-- ============================================================

CREATE TABLE IF NOT EXISTS neiu (
  id                  SERIAL PRIMARY KEY,
  kode_used           VARCHAR(20) GENERATED ALWAYS AS ('USED-' || lpad(id::text, 6, '0')) STORED,

  tanggal_menghutang  DATE          NOT NULL,
  nilai_hutang        NUMERIC(15,2) NOT NULL CHECK (nilai_hutang > 0),

  rekening_tujuan_id  INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,
  untuk_bayar_apa     VARCHAR(500)  NOT NULL,

  created_by          INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by          INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS neiu_tanggal_idx ON neiu(tanggal_menghutang DESC);
CREATE INDEX IF NOT EXISTS neiu_kode_idx    ON neiu(kode_used);
CREATE INDEX IF NOT EXISTS neiu_rek_idx     ON neiu(rekening_tujuan_id);

DROP TRIGGER IF EXISTS neiu_set_updated_at ON neiu;
CREATE TRIGGER neiu_set_updated_at
  BEFORE UPDATE ON neiu
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- Tabel pembayaran NeiU (neip). Struktur minimal untuk mendukung
-- derivasi status NeiU. Detail halaman NeiP menyusul; kolom bisa
-- ditambah lewat migrasi berikutnya bila perlu.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS neip (
  id                  SERIAL PRIMARY KEY,
  tanggal_bayar       DATE          NOT NULL,
  nilai_bayar         NUMERIC(15,2) NOT NULL CHECK (nilai_bayar > 0),

  neiu_id             INTEGER       NOT NULL REFERENCES neiu(id) ON DELETE RESTRICT,
  rekening_tujuan_id  INTEGER       NOT NULL REFERENCES rekening(id) ON DELETE RESTRICT,

  created_by          INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by          INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS neip_tanggal_idx ON neip(tanggal_bayar DESC);
CREATE INDEX IF NOT EXISTS neip_neiu_idx    ON neip(neiu_id);

DROP TRIGGER IF EXISTS neip_set_updated_at ON neip;
CREATE TRIGGER neip_set_updated_at
  BEFORE UPDATE ON neip
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
