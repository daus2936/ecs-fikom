-- ============================================================
-- 004_expenses.sql
-- Tabel expenses + many-to-many ke PO dan invoice.
--
-- DESAIN:
-- - expense_type:    'client' | 'non_client'
-- - parent_company:  'KBSI' | 'SMI' (selalu di-set; untuk non-client
--                    di-derive dari sub_entity)
-- - sub_entity:      kode entitas paling spesifik (BIERSDORF, WINGS,
--                    TRANSPULMIN, SMD, OCULUS, AML, OTHER_CLIENTS,
--                    INTERNAL_KBSI, INTERNAL_SMI)
-- - category2:       hanya di-set kalau category1 = 'gaji'
-- - category3:       hanya di-set kalau client + KBSI (NMA|BMC|KPL)
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses (
  id                SERIAL PRIMARY KEY,

  occurred_date     DATE          NOT NULL,

  expense_type      VARCHAR(20)   NOT NULL
                    CHECK (expense_type IN ('client', 'non_client')),
  parent_company    VARCHAR(20)   NOT NULL
                    CHECK (parent_company IN ('KBSI', 'SMI')),
  sub_entity        VARCHAR(50)   NOT NULL
                    CHECK (sub_entity IN (
                      'BIERSDORF',
                      'WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS',
                      'INTERNAL_KBSI','INTERNAL_SMI'
                    )),

  category1         VARCHAR(40)   NOT NULL
                    CHECK (category1 IN (
                      'gaji',
                      'bpjs_jkk','bpjs_jkm','bpjs_kesehatan','bpjs_jht',
                      'jaminan_pensiun',
                      'pph_21','pph_23','ppn',
                      'expenses','advance_expenses',
                      'pembelian_produk','produksi'
                    )),
  category2         VARCHAR(20)
                    CHECK (category2 IS NULL OR category2 IN ('regular','event')),
  category3         VARCHAR(10)
                    CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL')),

  amount            NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  notes             TEXT,

  created_by        INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- Aturan konsistensi:
  -- category2 hanya boleh ada kalau category1 = 'gaji', dan wajib ada kalau gaji
  CONSTRAINT expenses_cat2_consistency CHECK (
    (category1 = 'gaji' AND category2 IS NOT NULL)
    OR (category1 <> 'gaji' AND category2 IS NULL)
  ),
  -- category3 hanya boleh ada kalau client + KBSI
  CONSTRAINT expenses_cat3_consistency CHECK (
    category3 IS NULL OR (expense_type = 'client' AND parent_company = 'KBSI')
  ),
  -- sub_entity harus cocok dengan kombinasi expense_type + parent_company
  CONSTRAINT expenses_sub_entity_consistency CHECK (
    (expense_type = 'client' AND parent_company = 'KBSI' AND sub_entity = 'BIERSDORF')
    OR (expense_type = 'client' AND parent_company = 'SMI' AND sub_entity IN
        ('WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS'))
    OR (expense_type = 'non_client' AND parent_company = 'KBSI' AND sub_entity = 'INTERNAL_KBSI')
    OR (expense_type = 'non_client' AND parent_company = 'SMI'  AND sub_entity = 'INTERNAL_SMI')
  )
);

CREATE INDEX IF NOT EXISTS expenses_occurred_date_idx  ON expenses(occurred_date DESC);
CREATE INDEX IF NOT EXISTS expenses_created_at_idx     ON expenses(created_at DESC);
CREATE INDEX IF NOT EXISTS expenses_sub_entity_idx     ON expenses(sub_entity);
CREATE INDEX IF NOT EXISTS expenses_category1_idx      ON expenses(category1);
CREATE INDEX IF NOT EXISTS expenses_created_by_idx     ON expenses(created_by);

DROP TRIGGER IF EXISTS expenses_set_updated_at ON expenses;
CREATE TRIGGER expenses_set_updated_at
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Pivot: Expense ↔ Purchase Order (many-to-many)
--   ON DELETE CASCADE dari sisi expense (delete expense → bersih)
--   ON DELETE RESTRICT dari sisi PO (PO yang terpakai tak bisa dihapus)
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_purchase_orders (
  expense_id         INTEGER NOT NULL REFERENCES expenses(id)        ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (expense_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS epo_po_idx ON expense_purchase_orders(purchase_order_id);

-- ============================================================
-- Pivot: Expense ↔ Invoice (many-to-many, OPSIONAL)
-- ============================================================
CREATE TABLE IF NOT EXISTS expense_invoices (
  expense_id  INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  PRIMARY KEY (expense_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS ei_invoice_idx ON expense_invoices(invoice_id);
