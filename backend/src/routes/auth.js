import { z } from 'zod';
import { query } from '../config/db.js';
import { verifyPassword, hashPassword } from '../utils/password.js';
import { generateSecret, verifyToken, buildOtpauthUri } from '../utils/totp.js';
import QRCode from 'qrcode';

const loginSchema = z.object({
  username: z.string().trim().min(1, 'Username wajib diisi'),
  password: z.string().min(1, 'Password wajib diisi'),
  // token opsional — diisi pada langkah kedua kalau 2FA aktif
  token:    z.string().trim().optional(),
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Password lama wajib diisi'),
  new_password:     z.string().min(8, 'Password baru minimal 8 karakter').max(128),
});

const enable2faSchema = z.object({
  token: z.string().trim().regex(/^\d{6}$/, 'Kode OTP harus 6 digit'),
});

const disable2faSchema = z.object({
  password: z.string().min(1, 'Password wajib diisi untuk menonaktifkan 2FA'),
});

export default async function authRoutes(fastify) {
  // POST /auth/login
  fastify.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }
    const { username, password, token } = parsed.data;

    const { rows } = await query(
      `SELECT id, full_name, username, password_hash, email, role, is_active,
              twofa_enabled, twofa_secret
       FROM users WHERE username = $1`,
      [username]
    );
    const user = rows[0];

    // Pesan generic supaya tidak bocorin existence username
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'Username atau password salah.' });
    }
    if (!user.is_active) {
      return reply.code(403).send({ error: 'Akun Anda non-aktif. Hubungi admin.' });
    }

    // Kalau 2FA aktif: butuh token TOTP.
    if (user.twofa_enabled && user.twofa_secret) {
      if (!token) {
        // Langkah 1 sukses (password benar), minta token. Belum kasih JWT.
        return reply.code(200).send({ twofa_required: true });
      }
      // Langkah 2: verifikasi token.
      if (!verifyToken(token, user.twofa_secret)) {
        return reply.code(401).send({ error: 'Kode OTP salah atau sudah kedaluwarsa.', twofa_required: true });
      }
    }

    const jwtToken = await reply.jwtSign({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    return {
      token: jwtToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role,
        twofa_enabled: user.twofa_enabled,
      },
    };
  });

  // GET /auth/me  (untuk validasi token + ambil profil)
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      `SELECT id, full_name, username, email, role, is_active, twofa_enabled
       FROM users WHERE id = $1`,
      [request.user.id]
    );
    const me = rows[0];
    if (!me || !me.is_active) {
      return reply.code(401).send({ error: 'Akun tidak ditemukan atau non-aktif.' });
    }
    return { user: me };
  });

  // POST /auth/change-password — self-service ganti password sendiri
  // Berlaku untuk semua user yang sudah login (user/admin/superadmin).
  // Validasi: harus tahu current_password dulu.
  fastify.post('/change-password', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }
    const { current_password, new_password } = parsed.data;

    // Cegah pakai password yang sama persis (sederhana — hindari mengganti dengan yang sama)
    if (current_password === new_password) {
      return reply.code(400).send({ error: 'Password baru tidak boleh sama dengan password lama.' });
    }

    // Ambil hash + status aktif user dari DB (jangan trust JWT untuk is_active)
    const { rows } = await query(
      `SELECT id, password_hash, is_active FROM users WHERE id = $1`,
      [request.user.id]
    );
    const me = rows[0];
    if (!me) {
      return reply.code(401).send({ error: 'Akun tidak ditemukan.' });
    }
    if (!me.is_active) {
      return reply.code(403).send({ error: 'Akun Anda non-aktif. Hubungi admin.' });
    }

    // Verifikasi password lama
    const ok = await verifyPassword(current_password, me.password_hash);
    if (!ok) {
      return reply.code(401).send({ error: 'Password lama tidak benar.' });
    }

    // Hash & simpan password baru
    const newHash = await hashPassword(new_password);
    await query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [newHash, me.id]);

    return { ok: true, message: 'Password berhasil diubah.' };
  });

  // ===========================================================
  // 2FA (TOTP) — self-service aktif/nonaktif
  // ===========================================================

  // POST /auth/2fa/setup — mulai aktivasi: generate secret + QR.
  // Secret disimpan sementara di kolom twofa_secret TAPI twofa_enabled
  // tetap FALSE sampai user verifikasi token via /enable.
  fastify.post('/2fa/setup', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { rows } = await query(
      `SELECT id, username, twofa_enabled FROM users WHERE id = $1`,
      [request.user.id]
    );
    const me = rows[0];
    if (!me) return reply.code(401).send({ error: 'Akun tidak ditemukan.' });
    if (me.twofa_enabled) {
      return reply.code(400).send({ error: '2FA sudah aktif. Nonaktifkan dulu untuk setup ulang.' });
    }

    const secret = generateSecret();
    // Simpan secret (pending). enabled tetap false.
    await query(`UPDATE users SET twofa_secret = $1, twofa_enabled = FALSE WHERE id = $2`, [secret, me.id]);

    const otpauth = buildOtpauthUri(secret, me.username, 'FIKOM');
    let qrDataUrl = null;
    try {
      qrDataUrl = await QRCode.toDataURL(otpauth, { width: 240, margin: 1 });
    } catch {
      qrDataUrl = null; // kalau gagal, frontend tetap bisa pakai manual entry
    }

    return { secret, otpauth, qr: qrDataUrl };
  });

  // POST /auth/2fa/enable — verifikasi token pertama, lalu aktifkan.
  fastify.post('/2fa/enable', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = enable2faSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    const { rows } = await query(
      `SELECT id, twofa_secret, twofa_enabled FROM users WHERE id = $1`,
      [request.user.id]
    );
    const me = rows[0];
    if (!me) return reply.code(401).send({ error: 'Akun tidak ditemukan.' });
    if (me.twofa_enabled) {
      return reply.code(400).send({ error: '2FA sudah aktif.' });
    }
    if (!me.twofa_secret) {
      return reply.code(400).send({ error: 'Belum ada setup 2FA. Mulai dari setup dulu.' });
    }

    if (!verifyToken(parsed.data.token, me.twofa_secret)) {
      return reply.code(401).send({ error: 'Kode OTP salah. Pastikan waktu HP Anda akurat & coba lagi.' });
    }

    await query(`UPDATE users SET twofa_enabled = TRUE WHERE id = $1`, [me.id]);
    return { ok: true, message: '2FA berhasil diaktifkan.' };
  });

  // POST /auth/2fa/disable — nonaktifkan 2FA (butuh password sebagai konfirmasi).
  fastify.post('/2fa/disable', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = disable2faSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.errors[0].message });
    }

    const { rows } = await query(
      `SELECT id, password_hash, twofa_enabled FROM users WHERE id = $1`,
      [request.user.id]
    );
    const me = rows[0];
    if (!me) return reply.code(401).send({ error: 'Akun tidak ditemukan.' });

    // Verifikasi password supaya orang lain yang sempat akses sesi tidak bisa matikan 2FA.
    if (!(await verifyPassword(parsed.data.password, me.password_hash))) {
      return reply.code(401).send({ error: 'Password salah.' });
    }

    await query(`UPDATE users SET twofa_enabled = FALSE, twofa_secret = NULL WHERE id = $1`, [me.id]);
    return { ok: true, message: '2FA berhasil dinonaktifkan.' };
  });
}
