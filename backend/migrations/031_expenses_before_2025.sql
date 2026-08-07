-- ============================================================
-- 031_expenses_before_2025.sql
--
-- Tabel expenses_before_2025 (halaman "Expenses Before 2025").
-- Klon penuh struktur expenses (semua kategori & constraint final,
-- termasuk category3 OTHERS + updated_by), dengan modifikasi:
--   - Nomor PO & Invoice OPSIONAL untuk semua tipe (boleh kosong, boleh >1).
--     Tidak ada aturan "client wajib PO".
--   - Kode: EXPB-DDMMYY-NNNN (prefix berbeda dari Expenses agar tidak
--     bentrok string kode antar tabel).
--
-- Tabel terpisah → data independen dari expenses. Constraint/index
-- diberi nama unik (prefiks eb2025_).
-- ============================================================

CREATE TABLE IF NOT EXISTS expenses_before_2025 (
  id                SERIAL PRIMARY KEY,
  expense_code      VARCHAR(20),

  occurred_date     DATE          NOT NULL,

  expense_type      VARCHAR(20)   NOT NULL
                    CONSTRAINT eb2025_expense_type_check CHECK (expense_type IN ('client', 'non_client')),
  parent_company    VARCHAR(10)   NOT NULL
                    CONSTRAINT eb2025_parent_company_check CHECK (parent_company IN ('KBSI', 'SMI')),
  sub_entity        VARCHAR(50)   NOT NULL
                    CONSTRAINT eb2025_sub_entity_check CHECK (sub_entity IN (
                      'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS',
                      'INTERNAL_KBSI','INTERNAL_SMI'
                    )),

  category1         VARCHAR(40)   NOT NULL
                    CONSTRAINT eb2025_category1_check CHECK (category1 IN (
                      'gaji',
                      'bpjs_jkk','bpjs_jkm','bpjs_kesehatan','bpjs_jht',
                      'jaminan_pensiun',
                      'pph_21','pph_23','ppn',
                      'expenses','advance_expenses','pembelian_produk','produksi',
                      'pph_1_persen','listrik','air_pam','paper','tinta_printer',
                      'delivery','meeting','meals','ipl','server_ekn',
                      'sewa_kantor','bayar_bunga_hutang','others'
                    )),
  category3         VARCHAR(10)
                    CONSTRAINT eb2025_category3_allowed
                    CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS')),

  amount            NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  notes             TEXT,

  created_by        INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by        INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- category3 hanya boleh ada kalau client + KBSI (Biersdorf)
  CONSTRAINT eb2025_cat3_consistency CHECK (
    category3 IS NULL OR (expense_type = 'client' AND parent_company = 'KBSI')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS eb2025_code_unique       ON expenses_before_2025(expense_code);
CREATE INDEX IF NOT EXISTS eb2025_occurred_date_idx        ON expenses_before_2025(occurred_date DESC);
CREATE INDEX IF NOT EXISTS eb2025_sub_entity_idx           ON expenses_before_2025(sub_entity);
CREATE INDEX IF NOT EXISTS eb2025_category1_idx            ON expenses_before_2025(category1);
CREATE INDEX IF NOT EXISTS eb2025_created_by_idx           ON expenses_before_2025(created_by);

DROP TRIGGER IF EXISTS eb2025_set_updated_at ON expenses_before_2025;
CREATE TRIGGER eb2025_set_updated_at
  BEFORE UPDATE ON expenses_before_2025
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS eb2025_purchase_orders (
  eb_id              INTEGER NOT NULL REFERENCES expenses_before_2025(id) ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id)      ON DELETE RESTRICT,
  PRIMARY KEY (eb_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS eb2025_po_idx ON eb2025_purchase_orders(purchase_order_id);

-- Pivot ke Invoice (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS eb2025_invoices (
  eb_id       INTEGER NOT NULL REFERENCES expenses_before_2025(id) ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id)             ON DELETE RESTRICT,
  PRIMARY KEY (eb_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS eb2025_inv_idx ON eb2025_invoices(invoice_id);
