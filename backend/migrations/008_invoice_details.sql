-- ============================================================
-- 008_invoice_details.sql
--
-- Tabel invoice_details (modul Invoice Detail).
-- - Hanya untuk client (tidak ada non_client).
-- - sub_entity terbatas pada 7 client yg ada di expenses.
-- - category3 (NMA/BMC/KPL) muncul untuk BIERSDORF.
-- - category4 (NMA/TL) muncul kalau category3 = NMA (Biersdorf only).
-- - 8 field nominal, semua NUMERIC(15,2).
-- - Many-to-many ke purchase_orders & invoices (sama pola dgn expenses).
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_details (
  id              SERIAL PRIMARY KEY,

  submit_date     DATE          NOT NULL,

  sub_entity      VARCHAR(50)   NOT NULL
                  CHECK (sub_entity IN (
                    'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS'
                  )),
  category3       VARCHAR(10)
                  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL')),
  category4       VARCHAR(10)
                  CHECK (category4 IS NULL OR category4 IN ('NMA','TL')),

  -- 8 nominal fields
  bpjs_kesehatan_perusahaan      NUMERIC(15,2) NOT NULL CHECK (bpjs_kesehatan_perusahaan      >= 0),
  bpjs_jht_perusahaan            NUMERIC(15,2) NOT NULL CHECK (bpjs_jht_perusahaan            >= 0),
  jaminan_pensiun_perusahaan     NUMERIC(15,2) NOT NULL CHECK (jaminan_pensiun_perusahaan     >= 0),
  gross_3                        NUMERIC(15,2) NOT NULL CHECK (gross_3                        >= 0),
  pph_21_sebulan                 NUMERIC(15,2) NOT NULL CHECK (pph_21_sebulan                 >= 0),
  bpjs_ketenagakerjaan_karyawan  NUMERIC(15,2) NOT NULL CHECK (bpjs_ketenagakerjaan_karyawan  >= 0),
  bpjs_kesehatan_karyawan        NUMERIC(15,2) NOT NULL CHECK (bpjs_kesehatan_karyawan        >= 0),
  dana_pensiun_karyawan          NUMERIC(15,2) NOT NULL CHECK (dana_pensiun_karyawan          >= 0),

  created_by      INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Consistency: cat3 hanya boleh utk BIERSDORF
  CONSTRAINT invoice_details_cat3_consistency CHECK (
    category3 IS NULL OR sub_entity = 'BIERSDORF'
  ),
  -- cat4 hanya boleh kalau cat3 = NMA (otomatis berarti Biersdorf juga)
  CONSTRAINT invoice_details_cat4_consistency CHECK (
    category4 IS NULL OR category3 = 'NMA'
  )
);

CREATE INDEX IF NOT EXISTS invoice_details_submit_date_idx  ON invoice_details(submit_date DESC);
CREATE INDEX IF NOT EXISTS invoice_details_sub_entity_idx   ON invoice_details(sub_entity);
CREATE INDEX IF NOT EXISTS invoice_details_created_by_idx   ON invoice_details(created_by);

DROP TRIGGER IF EXISTS invoice_details_set_updated_at ON invoice_details;
CREATE TRIGGER invoice_details_set_updated_at
  BEFORE UPDATE ON invoice_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Pivot: invoice_detail ↔ Purchase Order
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_detail_purchase_orders (
  invoice_detail_id  INTEGER NOT NULL REFERENCES invoice_details(id)  ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id)  ON DELETE RESTRICT,
  PRIMARY KEY (invoice_detail_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS idpo_po_idx ON invoice_detail_purchase_orders(purchase_order_id);

-- ============================================================
-- Pivot: invoice_detail ↔ Invoice
-- ============================================================
CREATE TABLE IF NOT EXISTS invoice_detail_invoices (
  invoice_detail_id  INTEGER NOT NULL REFERENCES invoice_details(id)  ON DELETE CASCADE,
  invoice_id         INTEGER NOT NULL REFERENCES invoices(id)         ON DELETE RESTRICT,
  PRIMARY KEY (invoice_detail_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS idi_invoice_idx ON invoice_detail_invoices(invoice_id);
