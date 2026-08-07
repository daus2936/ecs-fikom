-- ============================================================
-- 032_invoice_cover_before_2025.sql
--
-- Tabel invoice_cover_before_2025 (halaman "Invoice Cover Before 2025"). Struktur sama persis dengan invoice_covers,
-- tapi TABEL TERPISAH supaya datanya independen (tidak konflik).
-- - Hanya untuk client (tidak ada non_client).
-- - category3 (NMA/BMC/KPL/OTHERS) muncul untuk BIERSDORF.
-- - TIDAK ada category4.
-- - 7 field nominal, semua NUMERIC(15,2).
-- - nomor_faktur_pajak (sudah inklusif sejak awal).
-- - Many-to-many ke purchase_orders & invoices (pivot sendiri).
--
-- Catatan: semua nama constraint/index/trigger dibuat UNIK (prefiks icb2025_)
-- supaya tidak bentrok dengan objek milik invoice_covers.
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_cover_before_2025 (
  id              SERIAL PRIMARY KEY,

  submit_date     DATE          NOT NULL,

  sub_entity      VARCHAR(50)   NOT NULL
                  CONSTRAINT icb2025_sub_entity_allowed CHECK (sub_entity IN (
                    'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS'
                  )),
  category3       VARCHAR(10)
                  CONSTRAINT icb2025_category3_allowed
                  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS')),

  nomor_faktur_pajak VARCHAR(50) NOT NULL DEFAULT '',

  -- 7 nominal fields
  total_biaya     NUMERIC(15,2) NOT NULL CHECK (total_biaya >= 0),
  fee             NUMERIC(15,2) NOT NULL CHECK (fee         >= 0),
  sub_total_1     NUMERIC(15,2) NOT NULL CHECK (sub_total_1 >= 0),
  ppn             NUMERIC(15,2) NOT NULL CHECK (ppn         >= 0),
  sub_total_2     NUMERIC(15,2) NOT NULL CHECK (sub_total_2 >= 0),
  pph_23_2_persen NUMERIC(15,2) NOT NULL CHECK (pph_23_2_persen >= 0),
  total           NUMERIC(15,2) NOT NULL CHECK (total       >= 0),

  created_by      INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- cat3 hanya boleh utk BIERSDORF
  CONSTRAINT icb2025_cat3_consistency CHECK (
    category3 IS NULL OR sub_entity = 'BIERSDORF'
  )
);

CREATE INDEX IF NOT EXISTS icb2025_submit_date_idx        ON invoice_cover_before_2025(submit_date DESC);
CREATE INDEX IF NOT EXISTS icb2025_sub_entity_idx         ON invoice_cover_before_2025(sub_entity);
CREATE INDEX IF NOT EXISTS icb2025_created_by_idx         ON invoice_cover_before_2025(created_by);
CREATE INDEX IF NOT EXISTS icb2025_updated_by_idx         ON invoice_cover_before_2025(updated_by);
CREATE INDEX IF NOT EXISTS icb2025_nomor_faktur_pajak_idx ON invoice_cover_before_2025(nomor_faktur_pajak);

DROP TRIGGER IF EXISTS icb2025_set_updated_at ON invoice_cover_before_2025;
CREATE TRIGGER icb2025_set_updated_at
  BEFORE UPDATE ON invoice_cover_before_2025
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO
CREATE TABLE IF NOT EXISTS icb2025_purchase_orders (
  icb_id             INTEGER NOT NULL REFERENCES invoice_cover_before_2025(id)              ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (icb_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS icb2025_po_idx ON icb2025_purchase_orders(purchase_order_id);

-- Pivot ke Invoice
CREATE TABLE IF NOT EXISTS icb2025_invoices (
  icb_id      INTEGER NOT NULL REFERENCES invoice_cover_before_2025(id)       ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id)  ON DELETE RESTRICT,
  PRIMARY KEY (icb_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS icb2025_inv_idx ON icb2025_invoices(invoice_id);
