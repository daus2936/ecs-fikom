-- ============================================================
-- 009_invoice_covers.sql
--
-- Tabel invoice_covers (modul Invoice Cover).
-- - Hanya untuk client (tidak ada non_client).
-- - category3 (NMA/BMC/KPL) muncul untuk BIERSDORF.
-- - TIDAK ada category4 (berbeda dengan invoice_details).
-- - 7 field nominal, semua NUMERIC(15,2).
-- - Many-to-many ke purchase_orders & invoices.
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_covers (
  id              SERIAL PRIMARY KEY,

  submit_date     DATE          NOT NULL,

  sub_entity      VARCHAR(50)   NOT NULL
                  CHECK (sub_entity IN (
                    'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS'
                  )),
  category3       VARCHAR(10)
                  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL')),

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
  CONSTRAINT invoice_covers_cat3_consistency CHECK (
    category3 IS NULL OR sub_entity = 'BIERSDORF'
  )
);

CREATE INDEX IF NOT EXISTS invoice_covers_submit_date_idx  ON invoice_covers(submit_date DESC);
CREATE INDEX IF NOT EXISTS invoice_covers_sub_entity_idx   ON invoice_covers(sub_entity);
CREATE INDEX IF NOT EXISTS invoice_covers_created_by_idx   ON invoice_covers(created_by);

DROP TRIGGER IF EXISTS invoice_covers_set_updated_at ON invoice_covers;
CREATE TRIGGER invoice_covers_set_updated_at
  BEFORE UPDATE ON invoice_covers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO
CREATE TABLE IF NOT EXISTS invoice_cover_purchase_orders (
  invoice_cover_id   INTEGER NOT NULL REFERENCES invoice_covers(id)   ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id)  ON DELETE RESTRICT,
  PRIMARY KEY (invoice_cover_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS icpo_po_idx ON invoice_cover_purchase_orders(purchase_order_id);

-- Pivot ke Invoice
CREATE TABLE IF NOT EXISTS invoice_cover_invoices (
  invoice_cover_id  INTEGER NOT NULL REFERENCES invoice_covers(id)   ON DELETE CASCADE,
  invoice_id        INTEGER NOT NULL REFERENCES invoices(id)         ON DELETE RESTRICT,
  PRIMARY KEY (invoice_cover_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS ici_invoice_idx ON invoice_cover_invoices(invoice_id);
