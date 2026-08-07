-- ============================================================
-- 011_payments.sql
--
-- Tabel payments.
-- - Hanya untuk client (tidak ada non_client).
-- - category3 (NMA/BMC/KPL) WAJIB kalau sub_entity = BIERSDORF.
-- - Tidak ada PO — hanya invoice (opsional).
-- - 1 field nominal: amount.
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,

  payment_date    DATE          NOT NULL,

  sub_entity      VARCHAR(50)   NOT NULL
                  CHECK (sub_entity IN (
                    'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS'
                  )),
  category3       VARCHAR(10)
                  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL')),

  amount          NUMERIC(15,2) NOT NULL CHECK (amount >= 0),

  created_by      INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by      INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- cat3 hanya boleh utk BIERSDORF (frontend & backend enforce 'wajib' juga)
  CONSTRAINT payments_cat3_consistency CHECK (
    category3 IS NULL OR sub_entity = 'BIERSDORF'
  )
);

CREATE INDEX IF NOT EXISTS payments_payment_date_idx ON payments(payment_date DESC);
CREATE INDEX IF NOT EXISTS payments_sub_entity_idx   ON payments(sub_entity);
CREATE INDEX IF NOT EXISTS payments_created_by_idx   ON payments(created_by);

DROP TRIGGER IF EXISTS payments_set_updated_at ON payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke Invoice (opsional, multi-invoice)
CREATE TABLE IF NOT EXISTS payment_invoices (
  payment_id  INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  PRIMARY KEY (payment_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS pi_invoice_idx ON payment_invoices(invoice_id);
