-- ============================================================
-- 003_purchase_orders.sql
-- Tabel Purchase Order. Nomor PO unik, akan dijadikan rujukan
-- oleh tabel-tabel lain berikutnya.
--   - po_number UNIQUE       → konsistensi referensi
--   - created_by RESTRICT    → user pemilik PO tidak bisa di-delete
-- ============================================================

CREATE TABLE IF NOT EXISTS purchase_orders (
  id          SERIAL PRIMARY KEY,
  po_number   VARCHAR(100) NOT NULL UNIQUE,
  created_by  INTEGER      NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS purchase_orders_created_by_idx ON purchase_orders(created_by);
CREATE INDEX IF NOT EXISTS purchase_orders_created_at_idx ON purchase_orders(created_at DESC);

DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON purchase_orders;
CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
