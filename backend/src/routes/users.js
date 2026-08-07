import { z } from 'zod';
import { query } from '../config/db.js';
import { hashPassword } from '../utils/password.js';
import { ASSIGNABLE_ROLES } from '../lib/permissions.js';

// ============================================================
// Schemas
// ============================================================
const createUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Nama Lengkap wajib diisi').max(255),
  username: z.string().trim().min(3, 'Username minimal 3 karakter').max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username hanya boleh huruf, angka, titik, dash, underscore'),
  password: z.string().min(8, 'Password minimal 8 karakter').max(128),
  email: z.union([z.string().email('Format email tidak valid'), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim().toLowerCase() : null)),
  // role: opsional, default 'user'. Boleh salah satu dari ASSIGNABLE_ROLES.
  role: z.enum(ASSIGNABLE_ROLES).optional(),
});

const changePasswordSchema = z.object({
  password: z.string().min(8, 'Password minimal 8 karakter').max(128),
});

const toggleStatusSchema = z.object({
  is_active: z.boolean(),
});

const editUserSchema = z.object({
  full_name: z.string().trim().min(1, 'Nama Lengkap wajib diisi').max(255),
  username: z.string().trim().min(3, 'Username minimal 3 karakter').max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username hanya boleh huruf, angka, titik, dash, underscore'),
  email: z.union([z.string().email('Format email tidak valid'), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v && v.trim() !== '' ? v.trim().toLowerCase() : null)),
});

// ============================================================
// Helpers
// ============================================================

/** Apakah `actor` boleh "mengelola" `target` (edit password / toggle aktif)? */
function canManage(actor, target) {
  // Tidak ada yang boleh mengelola superadmin lewat API (termasuk superadmin sendiri)
  if (target.role === 'superadmin') return false;
  if (actor.role === 'superadmin') {
    // Superadmin boleh kelola admin & user; tidak boleh kelola dirinya sendiri (proteksi self-lockout)
    return actor.id !== target.id;
  }
  if (actor.role === 'admin') {
    // Admin boleh kelola semua role NON-superadmin (user, admin, dan role custom).
    // Tetap blokir self-management.
    if (actor.id === target.id) return false;
    return target.role !== 'superadmin';
  }
  return false;
}

// ============================================================
// Routes
// ============================================================
export default async function userRoutes(fastify) {
  // Semua endpoint butuh auth + role admin/superadmin
  const adminOnly = {
    preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])],
  };

  // ----- GET /users -----------------------------------------
  // Admin lihat role 'admin' & 'user' (sesama admin & user di bawahnya).
  // Superadmin lihat 'admin' & 'user' (superadmin sendiri disembunyikan dari list).
  fastify.get('/', adminOnly, async (request) => {
    const actor = request.user;
    const visibleRoles = ['admin', 'user', 'All-EX-GP-ED-INV', 'EXP-INV', 'All-View'];

    const { rows } = await query(
      `SELECT u.id, u.full_name, u.username, u.email, u.role, u.is_active,
              u.twofa_enabled,
              u.created_at, u.updated_at,
              c.username AS created_by_username
       FROM users u
       LEFT JOIN users c ON c.id = u.created_by
       WHERE u.role = ANY($1)
       ORDER BY u.created_at DESC`,
      [visibleRoles]
    );
    return { users: rows };
  });

  // ----- POST /users ----------------------------------------
  fastify.post('/', adminOnly, async (request, reply) => {
    const parsed = createUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }
    const { full_name, username, password, email } = parsed.data;
    let role = parsed.data.role ?? 'user';

    const actor = request.user;
    // Role 'superadmin' selalu di-block. Selain itu boleh salah satu ASSIGNABLE_ROLES.
    if (role === 'superadmin') {
      return reply.code(403).send({ error: 'Role superadmin tidak bisa dibuat dari dashboard.' });
    }
    if (!ASSIGNABLE_ROLES.includes(role)) {
      return reply.code(400).send({ error: 'Role tidak valid.' });
    }

    try {
      const passwordHash = await hashPassword(password);
      const { rows } = await query(
        `INSERT INTO users (full_name, username, password_hash, email, role, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, full_name, username, email, role, is_active, created_at`,
        [full_name, username, passwordHash, email, role, actor.id]
      );
      return reply.code(201).send({ user: rows[0] });
    } catch (err) {
      if (err.code === '23505') {
        // unique violation
        if (err.constraint?.includes('username')) {
          return reply.code(409).send({ error: 'Username sudah digunakan.' });
        }
        if (err.constraint?.includes('email')) {
          return reply.code(409).send({ error: 'Email sudah digunakan.' });
        }
        return reply.code(409).send({ error: 'Data sudah ada (unique constraint).' });
      }
      throw err;
    }
  });

  // ----- PATCH /users/:id (edit nama/username/email) --------
  fastify.patch('/:id', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const parsed = editUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }
    const { full_name, username, email } = parsed.data;

    const { rows: targetRows } = await query(
      `SELECT id, role FROM users WHERE id = $1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) return reply.code(404).send({ error: 'User tidak ditemukan.' });
    if (!canManage(request.user, target)) {
      return reply.code(403).send({ error: 'Anda tidak punya akses ke user ini.' });
    }

    try {
      const { rows } = await query(
        `UPDATE users SET full_name = $1, username = $2, email = $3
         WHERE id = $4
         RETURNING id, full_name, username, email, role, is_active`,
        [full_name, username, email, id]
      );
      return { user: rows[0] };
    } catch (err) {
      if (err.code === '23505') {
        if (err.constraint?.includes('username')) {
          return reply.code(409).send({ error: 'Username sudah digunakan.' });
        }
        if (err.constraint?.includes('email')) {
          return reply.code(409).send({ error: 'Email sudah digunakan.' });
        }
        return reply.code(409).send({ error: 'Data sudah ada (unique constraint).' });
      }
      throw err;
    }
  });

  // ----- PATCH /users/:id/password --------------------------
  fastify.patch('/:id/password', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    const { rows: targetRows } = await query(
      `SELECT id, role FROM users WHERE id = $1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) return reply.code(404).send({ error: 'User tidak ditemukan.' });
    if (!canManage(request.user, target)) {
      return reply.code(403).send({ error: 'Anda tidak punya akses ke user ini.' });
    }

    const passwordHash = await hashPassword(parsed.data.password);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [passwordHash, id]);
    return { success: true };
  });

  // ----- PATCH /users/:id/status (aktif / non-aktif) --------
  fastify.patch('/:id/status', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const parsed = toggleStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    const { rows: targetRows } = await query(
      `SELECT id, role FROM users WHERE id = $1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) return reply.code(404).send({ error: 'User tidak ditemukan.' });
    if (!canManage(request.user, target)) {
      return reply.code(403).send({ error: 'Anda tidak punya akses ke user ini.' });
    }

    const { rows } = await query(
      `UPDATE users SET is_active = $1 WHERE id = $2
       RETURNING id, full_name, username, email, role, is_active`,
      [parsed.data.is_active, id]
    );
    return { user: rows[0] };
  });

  // ----- PATCH /users/:id/reset-2fa --------------------------
  // Admin reset (matikan) 2FA milik user lain. Berguna kalau user
  // kehilangan akses ke authenticator app-nya.
  fastify.patch('/:id/reset-2fa', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const { rows: targetRows } = await query(
      `SELECT id, role, twofa_enabled FROM users WHERE id = $1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) return reply.code(404).send({ error: 'User tidak ditemukan.' });
    if (!canManage(request.user, target)) {
      return reply.code(403).send({ error: 'Anda tidak punya akses ke user ini.' });
    }

    await query(
      `UPDATE users SET twofa_enabled = FALSE, twofa_secret = NULL WHERE id = $1`,
      [id]
    );
    return { ok: true, message: '2FA user berhasil di-reset (dinonaktifkan).' };
  });

  // ----- DELETE /users/:id -----------------------------------
  // Hapus akun. Hanya admin/superadmin (adminOnly), dan dibatasi canManage:
  //   - tidak bisa hapus diri sendiri
  //   - tidak bisa hapus superadmin
  //
  // Banyak tabel data (invoices, expenses, dll) punya FK created_by dengan
  // ON DELETE RESTRICT. Kalau user pernah membuat data, DELETE akan ditolak
  // DB (error 23503). Dalam kasus itu, kembalikan pesan jelas + sarankan
  // nonaktifkan akun, supaya audit trail (siapa membuat data) tetap utuh.
  fastify.delete('/:id', adminOnly, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'ID tidak valid.' });
    }

    const { rows: targetRows } = await query(
      `SELECT id, role, username FROM users WHERE id = $1`,
      [id]
    );
    const target = targetRows[0];
    if (!target) return reply.code(404).send({ error: 'User tidak ditemukan.' });
    if (!canManage(request.user, target)) {
      return reply.code(403).send({ error: 'Anda tidak punya akses untuk menghapus user ini.' });
    }

    try {
      await query(`DELETE FROM users WHERE id = $1`, [id]);
      return { ok: true, message: `Akun "${target.username}" berhasil dihapus.` };
    } catch (err) {
      // 23503 = foreign_key_violation (user masih dirujuk data lain via ON DELETE RESTRICT)
      if (err.code === '23503') {
        return reply.code(409).send({
          error: 'Akun ini tidak bisa dihapus karena sudah pernah membuat data (invoice, expense, PO, dll). ' +
                 'Untuk menjaga riwayat data, nonaktifkan akun ini saja daripada menghapusnya.',
        });
      }
      throw err;
    }
  });
}
