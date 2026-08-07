-- ============================================================
-- 001_init.sql
-- Inisialisasi tabel users dengan constraint:
--   - username UNIQUE
--   - email UNIQUE (NULL diperbolehkan ganda krn PostgreSQL treat NULL != NULL)
--   - role hanya: superadmin | admin | user
--   - HANYA boleh ada 1 superadmin (partial unique index)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  full_name     VARCHAR(255) NOT NULL,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  email         VARCHAR(255) UNIQUE,
  role          VARCHAR(20)  NOT NULL CHECK (role IN ('superadmin', 'admin', 'user')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL
);

-- Garansi DB-level: maks 1 superadmin
CREATE UNIQUE INDEX IF NOT EXISTS users_one_superadmin_idx
  ON users ((role)) WHERE role = 'superadmin';

CREATE INDEX IF NOT EXISTS users_role_idx       ON users(role);
CREATE INDEX IF NOT EXISTS users_is_active_idx  ON users(is_active);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
