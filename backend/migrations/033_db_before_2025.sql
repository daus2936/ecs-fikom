-- ============================================================
-- 033_db_before_2025.sql
--
-- Tabel db_before_2025 (halaman "DB Before 2025").
-- Mirip expenses_before_2025, dengan modifikasi:
--   - category1 HANYA boleh 'DB' (CHECK ketat).
--   - TIDAK ada category3 (kolom dihapus, tidak ada di tabel ini).
--   - Nomor PO & Invoice OPSIONAL untuk semua tipe (boleh kosong, boleh >1).
--   - Kode: DB-DDMMYY-NNNN (prefix berbeda agar tidak bentrok antar tabel).
--
-- Tabel terpisah → data independen. Constraint/index prefiks db2025_.
-- ============================================================

CREATE TABLE IF NOT EXISTS db_before_2025 (
  id                SERIAL PRIMARY KEY,
  expense_code      VARCHAR(20),

  occurred_date     DATE          NOT NULL,

  expense_type      VARCHAR(20)   NOT NULL
                    CONSTRAINT db2025_expense_type_check CHECK (expense_type IN ('client', 'non_client')),
  parent_company    VARCHAR(10)   NOT NULL
                    CONSTRAINT db2025_parent_company_check CHECK (parent_company IN ('KBSI', 'SMI')),
  sub_entity        VARCHAR(50)   NOT NULL
                    CONSTRAINT db2025_sub_entity_check CHECK (sub_entity IN (
                      'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS',
                      'INTERNAL_KBSI','INTERNAL_SMI'
                    )),

  -- Kategori 1 hanya 'DB'
  category1         VARCHAR(40)   NOT NULL
                    CONSTRAINT db2025_category1_check CHECK (category1 = 'DB'),

  -- TIDAK ada category3 di tabel ini.

  amount            NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  notes             TEXT,

  created_by        INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by        INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS db2025_code_unique       ON db_before_2025(expense_code);
CREATE INDEX IF NOT EXISTS db2025_occurred_date_idx        ON db_before_2025(occurred_date DESC);
CREATE INDEX IF NOT EXISTS db2025_sub_entity_idx           ON db_before_2025(sub_entity);
CREATE INDEX IF NOT EXISTS db2025_created_by_idx           ON db_before_2025(created_by);

DROP TRIGGER IF EXISTS db2025_set_updated_at ON db_before_2025;
CREATE TRIGGER db2025_set_updated_at
  BEFORE UPDATE ON db_before_2025
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS db2025_purchase_orders (
  db_id              INTEGER NOT NULL REFERENCES db_before_2025(id)  ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (db_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS db2025_po_idx ON db2025_purchase_orders(purchase_order_id);

-- Pivot ke Invoice (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS db2025_invoices (
  db_id       INTEGER NOT NULL REFERENCES db_before_2025(id) ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id)       ON DELETE RESTRICT,
  PRIMARY KEY (db_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS db2025_inv_idx ON db2025_invoices(invoice_id);
