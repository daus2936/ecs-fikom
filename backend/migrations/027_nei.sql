-- ============================================================
-- 027_nei.sql
--
-- Tabel nei (modul Nei). Struktur sama persis dengan invoice_covers,
-- tapi TABEL TERPISAH supaya datanya independen (tidak konflik).
-- - Hanya untuk client (tidak ada non_client).
-- - category3 (NMA/BMC/KPL/OTHERS) muncul untuk BIERSDORF.
-- - TIDAK ada category4.
-- - 7 field nominal, semua NUMERIC(15,2).
-- - nomor_faktur_pajak (sudah inklusif sejak awal).
-- - Many-to-many ke purchase_orders & invoices (pivot sendiri).
--
-- Catatan: semua nama constraint/index/trigger dibuat UNIK (prefiks nei_)
-- supaya tidak bentrok dengan objek milik invoice_covers.
-- ============================================================

CREATE TABLE IF NOT EXISTS nei (
  id              SERIAL PRIMARY KEY,

  submit_date     DATE          NOT NULL,

  sub_entity      VARCHAR(50)   NOT NULL
                  CONSTRAINT nei_sub_entity_allowed CHECK (sub_entity IN (
                    'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS'
                  )),
  category3       VARCHAR(10)
                  CONSTRAINT nei_category3_allowed
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
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- cat3 hanya boleh utk BIERSDORF
  CONSTRAINT nei_cat3_consistency CHECK (
    category3 IS NULL OR sub_entity = 'BIERSDORF'
  )
);

CREATE INDEX IF NOT EXISTS nei_submit_date_idx        ON nei(submit_date DESC);
CREATE INDEX IF NOT EXISTS nei_sub_entity_idx         ON nei(sub_entity);
CREATE INDEX IF NOT EXISTS nei_created_by_idx         ON nei(created_by);
CREATE INDEX IF NOT EXISTS nei_nomor_faktur_pajak_idx ON nei(nomor_faktur_pajak);

DROP TRIGGER IF EXISTS nei_set_updated_at ON nei;
CREATE TRIGGER nei_set_updated_at
  BEFORE UPDATE ON nei
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO
CREATE TABLE IF NOT EXISTS nei_purchase_orders (
  nei_id             INTEGER NOT NULL REFERENCES nei(id)              ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (nei_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS nei_po_idx ON nei_purchase_orders(purchase_order_id);

-- Pivot ke Invoice
CREATE TABLE IF NOT EXISTS nei_invoices (
  nei_id      INTEGER NOT NULL REFERENCES nei(id)       ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id)  ON DELETE RESTRICT,
  PRIMARY KEY (nei_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS nei_inv_idx ON nei_invoices(invoice_id);
