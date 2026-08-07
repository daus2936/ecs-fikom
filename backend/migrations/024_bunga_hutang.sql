-- ============================================================
-- 024_bunga_hutang.sql
--
-- Revisi sistem Hutang:
-- 1. Tabel baru `bunga_hutang` — mewakili kewajiban bunga atas suatu hutang.
--    - kode_bunga_hutang : BNG-DDMMYY-NNNN (di-generate aplikasi, per hari)
--    - nilai_bunga_hutang: nominal bunga yang harus dibayar
--    - hutang_id         : 1 bunga hutang merujuk TEPAT 1 hutang
--    Status (computed, tidak disimpan): 'lunas' jika
--      SUM(bayar_bunga_hutang.nilai_bayar untuk bunga ini) >= nilai_bunga_hutang.
--
-- 2. `bayar_bunga_hutang`: sekarang merujuk ke bunga_hutang (bukan hutang).
--    Belum ada data → aman ganti kolom hutang_id → bunga_hutang_id.
--
-- 3. Status Hutang (computed) menjadi 'lunas' jika:
--      (a) SUM(bayar_hutang.nilai_bayar untuk hutang ini) >= nilai_hutang, DAN
--      (b) ada bunga_hutang yang merujuk hutang ini & statusnya 'lunas'.
--    Logika ini ada di query route (tidak perlu kolom).
-- ============================================================

-- 1. Tabel bunga_hutang
CREATE TABLE IF NOT EXISTS bunga_hutang (
  id                   SERIAL PRIMARY KEY,
  kode_bunga_hutang    VARCHAR(20) NOT NULL,

  tanggal              DATE          NOT NULL,
  nilai_bunga_hutang   NUMERIC(15,2) NOT NULL CHECK (nilai_bunga_hutang > 0),

  hutang_id            INTEGER       NOT NULL REFERENCES hutang(id) ON DELETE RESTRICT,

  created_by           INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by           INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS bunga_hutang_kode_unique ON bunga_hutang(kode_bunga_hutang);
CREATE INDEX IF NOT EXISTS bunga_hutang_hutang_idx ON bunga_hutang(hutang_id);
CREATE INDEX IF NOT EXISTS bunga_hutang_tanggal_idx ON bunga_hutang(tanggal DESC);

DROP TRIGGER IF EXISTS bunga_hutang_set_updated_at ON bunga_hutang;
CREATE TRIGGER bunga_hutang_set_updated_at
  BEFORE UPDATE ON bunga_hutang
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. bayar_bunga_hutang: ganti referensi hutang_id → bunga_hutang_id.
--    Belum ada data (dikonfirmasi), jadi drop kolom lama + tambah baru.
ALTER TABLE bayar_bunga_hutang DROP COLUMN IF EXISTS hutang_id;
ALTER TABLE bayar_bunga_hutang
  ADD COLUMN IF NOT EXISTS bunga_hutang_id INTEGER REFERENCES bunga_hutang(id) ON DELETE RESTRICT;

-- Set NOT NULL hanya kalau tabel kosong (aman karena belum ada data).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bayar_bunga_hutang LIMIT 1) THEN
    ALTER TABLE bayar_bunga_hutang ALTER COLUMN bunga_hutang_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bayar_bunga_bunga_idx ON bayar_bunga_hutang(bunga_hutang_id);
