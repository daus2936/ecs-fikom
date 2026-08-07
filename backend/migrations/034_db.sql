-- ============================================================
-- 034_db.sql
--
-- Tabel db (halaman "DB" — versi live/berjalan).
-- Sama persis seperti db_before_2025:
--   - category1 HANYA boleh 'DB'.
--   - TIDAK ada category3.
--   - Nomor PO & Invoice OPSIONAL untuk semua tipe (boleh kosong, boleh >1).
--   - Kode: DB-DDMMYY-NNNN.
--
-- Tabel terpisah → data independen dari db_before_2025.
-- Constraint/index prefiks db_.
-- ============================================================

CREATE TABLE IF NOT EXISTS db (
  id                SERIAL PRIMARY KEY,
  expense_code      VARCHAR(20),

  occurred_date     DATE          NOT NULL,

  expense_type      VARCHAR(20)   NOT NULL
                    CONSTRAINT db_expense_type_check CHECK (expense_type IN ('client', 'non_client')),
  parent_company    VARCHAR(10)   NOT NULL
                    CONSTRAINT db_parent_company_check CHECK (parent_company IN ('KBSI', 'SMI')),
  sub_entity        VARCHAR(50)   NOT NULL
                    CONSTRAINT db_sub_entity_check CHECK (sub_entity IN (
                      'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS',
                      'INTERNAL_KBSI','INTERNAL_SMI'
                    )),

  -- Kategori 1 hanya 'DB'
  category1         VARCHAR(40)   NOT NULL
                    CONSTRAINT db_category1_check CHECK (category1 = 'DB'),

  -- TIDAK ada category3 di tabel ini.

  amount            NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  notes             TEXT,

  created_by        INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by        INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS db_code_unique       ON db(expense_code);
CREATE INDEX IF NOT EXISTS db_occurred_date_idx        ON db(occurred_date DESC);
CREATE INDEX IF NOT EXISTS db_sub_entity_idx           ON db(sub_entity);
CREATE INDEX IF NOT EXISTS db_created_by_idx           ON db(created_by);

DROP TRIGGER IF EXISTS db_set_updated_at ON db;
CREATE TRIGGER db_set_updated_at
  BEFORE UPDATE ON db
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS db_purchase_orders (
  dbm_id             INTEGER NOT NULL REFERENCES db(id)               ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id)  ON DELETE RESTRICT,
  PRIMARY KEY (dbm_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS db_po_idx ON db_purchase_orders(purchase_order_id);

-- Pivot ke Invoice (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS db_invoices (
  dbm_id      INTEGER NOT NULL REFERENCES db(id)        ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id)  ON DELETE RESTRICT,
  PRIMARY KEY (dbm_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS db_inv_idx ON db_invoices(invoice_id);
