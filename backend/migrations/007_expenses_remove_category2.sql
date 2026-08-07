-- ============================================================
-- 007_expenses_remove_category2.sql
--
-- Perubahan:
--   1. Hapus kolom category2 dari expenses
--      (sebelumnya "Gaji Regular" vs "Gaji Event").
--   2. Hapus CONSTRAINT expenses_cat2_consistency.
--   3. Update expenses_cat3_consistency:
--      category3 sekarang berlaku untuk sub_entity = BIERSDORF
--      (bukan lagi expense_type=client AND parent_company=KBSI,
--       walaupun secara fungsional sama hasilnya).
--
-- Data lama: category2 hilang otomatis karena kolomnya di-drop.
-- ============================================================

ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_cat2_consistency;
ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_cat3_consistency;

ALTER TABLE expenses DROP COLUMN IF EXISTS category2;

ALTER TABLE expenses ADD CONSTRAINT expenses_cat3_consistency CHECK (
  category3 IS NULL OR sub_entity = 'BIERSDORF'
);
