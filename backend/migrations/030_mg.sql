-- ============================================================
-- 030_mg.sql
--
-- Tabel mg (halaman Mg) — mirip expenses, dengan modifikasi:
--   - Tambah kolom untuk_siapa (Pm / Put / Led / Others).
--   - Kode: Mg-DDMMYY-NNNN (di-generate aplikasi).
--   - Nomor PO & Invoice OPSIONAL (boleh kosong, boleh >1) — tidak ada
--     aturan "client wajib PO" seperti expenses.
--   - Sisanya identik expenses: expense_type, parent_company, sub_entity,
--     category1, category3 (termasuk OTHERS), amount, notes, updated_by.
--
-- Tabel terpisah → data independen dari expenses. Semua constraint/index
-- diberi nama unik (prefiks mg_).
-- ============================================================

CREATE TABLE IF NOT EXISTS mg (
  id                SERIAL PRIMARY KEY,
  mg_code           VARCHAR(20),

  occurred_date     DATE          NOT NULL,

  -- Tambahan khusus Mg
  untuk_siapa       VARCHAR(10)   NOT NULL
                    CONSTRAINT mg_untuk_siapa_allowed CHECK (untuk_siapa IN ('Pm','Put','Led','Others')),

  expense_type      VARCHAR(20)   NOT NULL
                    CONSTRAINT mg_expense_type_check CHECK (expense_type IN ('client', 'non_client')),
  parent_company    VARCHAR(10)   NOT NULL
                    CONSTRAINT mg_parent_company_check CHECK (parent_company IN ('KBSI', 'SMI')),
  sub_entity        VARCHAR(50)   NOT NULL
                    CONSTRAINT mg_sub_entity_check CHECK (sub_entity IN (
                      'BIERSDORF','WINGS','TRANSPULMIN','SMD','OCULUS','AML','OTHER_CLIENTS',
                      'INTERNAL_KBSI','INTERNAL_SMI'
                    )),

  category1         VARCHAR(40)   NOT NULL
                    CONSTRAINT mg_category1_check CHECK (category1 IN (
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
                    CONSTRAINT mg_category3_allowed
                    CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS')),

  amount            NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
  notes             TEXT,

  created_by        INTEGER       NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by        INTEGER                REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  -- category3 hanya boleh ada kalau client + KBSI (Biersdorf)
  CONSTRAINT mg_cat3_consistency CHECK (
    category3 IS NULL OR (expense_type = 'client' AND parent_company = 'KBSI')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mg_code_unique        ON mg(mg_code);
CREATE INDEX IF NOT EXISTS mg_occurred_date_idx         ON mg(occurred_date DESC);
CREATE INDEX IF NOT EXISTS mg_sub_entity_idx            ON mg(sub_entity);
CREATE INDEX IF NOT EXISTS mg_category1_idx             ON mg(category1);
CREATE INDEX IF NOT EXISTS mg_untuk_siapa_idx           ON mg(untuk_siapa);
CREATE INDEX IF NOT EXISTS mg_created_by_idx            ON mg(created_by);

DROP TRIGGER IF EXISTS mg_set_updated_at ON mg;
CREATE TRIGGER mg_set_updated_at
  BEFORE UPDATE ON mg
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Pivot ke PO (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS mg_purchase_orders (
  mg_id              INTEGER NOT NULL REFERENCES mg(id)               ON DELETE CASCADE,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (mg_id, purchase_order_id)
);
CREATE INDEX IF NOT EXISTS mg_po_idx ON mg_purchase_orders(purchase_order_id);

-- Pivot ke Invoice (opsional, many-to-many)
CREATE TABLE IF NOT EXISTS mg_invoices (
  mg_id       INTEGER NOT NULL REFERENCES mg(id)       ON DELETE CASCADE,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  PRIMARY KEY (mg_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS mg_inv_idx ON mg_invoices(invoice_id);
