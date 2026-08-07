-- ============================================================
-- 026_category3_add_others.sql
--
-- Tambah nilai "OTHERS" ke Kategori 3 (sebelumnya: NMA, BMC, KPL).
-- Berlaku untuk 4 tabel yang punya kolom category3:
--   expenses, invoice_details, invoice_covers, payments.
--
-- Postgres menamai inline column CHECK secara otomatis sebagai
-- "{table}_category3_check". Kita drop yang lama (IF EXISTS, agar
-- idempotent & aman bila namanya beda) lalu tambah CHECK baru
-- dengan nama eksplisit yang menyertakan OTHERS.
-- ============================================================

-- expenses
ALTER TABLE expenses        DROP CONSTRAINT IF EXISTS expenses_category3_check;
ALTER TABLE expenses        DROP CONSTRAINT IF EXISTS expenses_category3_allowed;
ALTER TABLE expenses        ADD  CONSTRAINT expenses_category3_allowed
  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS'));

-- invoice_details
ALTER TABLE invoice_details DROP CONSTRAINT IF EXISTS invoice_details_category3_check;
ALTER TABLE invoice_details DROP CONSTRAINT IF EXISTS invoice_details_category3_allowed;
ALTER TABLE invoice_details ADD  CONSTRAINT invoice_details_category3_allowed
  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS'));

-- invoice_covers
ALTER TABLE invoice_covers  DROP CONSTRAINT IF EXISTS invoice_covers_category3_check;
ALTER TABLE invoice_covers  DROP CONSTRAINT IF EXISTS invoice_covers_category3_allowed;
ALTER TABLE invoice_covers  ADD  CONSTRAINT invoice_covers_category3_allowed
  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS'));

-- payments
ALTER TABLE payments        DROP CONSTRAINT IF EXISTS payments_category3_check;
ALTER TABLE payments        DROP CONSTRAINT IF EXISTS payments_category3_allowed;
ALTER TABLE payments        ADD  CONSTRAINT payments_category3_allowed
  CHECK (category3 IS NULL OR category3 IN ('NMA','BMC','KPL','OTHERS'));
