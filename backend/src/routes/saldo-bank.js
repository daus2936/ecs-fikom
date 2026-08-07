import { z } from 'zod';
import path from 'node:path';
import crypto from 'node:crypto';
import { query, pool } from '../config/db.js';
import { putObject, deleteObject, getObjectUrl } from '../lib/storage.js';

// ============================================================
// Upload setup
// ============================================================
// File foto disimpan lewat storage abstraction (src/lib/storage.js):
//   STORAGE_DRIVER=local → disk lokal + @fastify/static (dev)
//   STORAGE_DRIVER=s3    → Amazon S3 + presigned URL (production)
//
// DB tetap menyimpan HANYA nama file di kolom foto_filename (sama seperti
// versi lama), jadi row lama tetap kompatibel. "Object key" dibentuk
// di sini sebagai "<subdir>/<filename>".
const UPLOAD_SUBDIR = 'saldo-bank';
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const ALLOWED_EXT  = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const MAX_SIZE     = 5 * 1024 * 1024; // 5MB

const baseSchema = z.object({
  tanggal_sisa_saldo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tanggal tidak valid'),
  nominal:            z.union([z.number(), z.string()])
                       .transform((v) => (typeof v === 'string' ? Number(v) : v))
                       .refine((v) => Number.isFinite(v) && v >= 0, 'Nominal harus >= 0'),
});

// Object key = "<subdir>/<filename>". Berlaku untuk driver local maupun S3.
const objectKey = (filename) => `${UPLOAD_SUBDIR}/${filename}`;

function safeExt(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return ALLOWED_EXT.has(ext) ? ext : '.jpg';
}

const LIST_SELECT = `
  SELECT sb.id, sb.tanggal_sisa_saldo, sb.nominal,
         sb.foto_filename, sb.foto_original_name, sb.foto_mimetype,
         sb.created_at, sb.updated_at,
         c.username AS created_by_username, c.full_name AS created_by_name,
         u.username AS updated_by_username, u.full_name AS updated_by_name
  FROM saldo_bank sb
  LEFT JOIN users c ON c.id = sb.created_by
  LEFT JOIN users u ON u.id = sb.updated_by
`;

// Tambahkan field foto_url (presigned/served URL) ke tiap row yg punya foto.
// getObjectUrl() async; presign S3 = operasi lokal (tanpa network call).
async function withPhotoUrls(rows) {
  return Promise.all(rows.map(async (r) => ({
    ...r,
    foto_url: r.foto_filename ? await getObjectUrl(objectKey(r.foto_filename)) : null,
  })));
}

// Parse multipart yg punya 1 file + beberapa text field
async function parseMultipart(req) {
  const fields = {};
  let fileInfo = null;
  const parts = req.parts();
  for await (const part of parts) {
    if (part.type === 'file') {
      if (!ALLOWED_MIME.has(part.mimetype)) {
        throw Object.assign(new Error('Format foto tidak didukung. Pakai JPG/PNG/WEBP.'), { statusCode: 400 });
      }
      const buffer = await part.toBuffer();
      if (buffer.length > MAX_SIZE) {
        throw Object.assign(new Error('Ukuran foto melebihi 5MB.'), { statusCode: 400 });
      }
      fileInfo = {
        buffer,
        original: part.filename || 'upload',
        mimetype: part.mimetype,
        size: buffer.length,
      };
    } else {
      fields[part.fieldname] = part.value;
    }
  }
  return { fields, fileInfo };
}

export default async function saldoBankRoutes(fastify) {
  const authOnly  = { preHandler: [fastify.authenticate] };
  const adminOnly = { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] };
    const canViewPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('saldo-bank', 'view')] };
const canCreate = { preHandler: [fastify.authenticate, fastify.requirePermission('saldo-bank', 'create')] };
  const canEditPerm = { preHandler: [fastify.authenticate, fastify.requirePermission('saldo-bank', 'edit')] };
  const canDeletePerm = { preHandler: [fastify.authenticate, fastify.requirePermission('saldo-bank', 'delete')] };

  // ----- GET /saldo-bank ------------------------------------
  fastify.get('/', canViewPerm, async (request) => {
    const isExport = (request.query?.export === '1' || request.query?.export === 'true')
      && (request.user?.role === 'admin' || request.user?.role === 'superadmin');
    const sql = LIST_SELECT + ' ORDER BY sb.tanggal_sisa_saldo DESC, sb.id DESC' + (isExport ? '' : ' LIMIT 10000');
    const { rows } = await query(sql);
    return { saldo_bank: await withPhotoUrls(rows) };
  });

  // ----- POST /saldo-bank (multipart) -----------------------
  fastify.post('/', canCreate, async (request, reply) => {
    if (!request.isMultipart()) {
      return reply.code(400).send({ error: 'Harus pakai multipart/form-data.' });
    }

    let parsed;
    try {
      parsed = await parseMultipart(request);
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.message });
    }

    const validation = baseSchema.safeParse(parsed.fields);
    if (!validation.success) return reply.code(400).send({ error: validation.error.errors[0].message });

    const d = validation.data;

    // Foto OPSIONAL. Kalau ada → simpan file; kalau tidak → kolom foto NULL.
    let newFilename = null;
    let fotoOriginal = null;
    let fotoMimetype = null;
    if (parsed.fileInfo) {
      newFilename = crypto.randomUUID() + safeExt(parsed.fileInfo.original);
      await putObject({
        key: objectKey(newFilename),
        body: parsed.fileInfo.buffer,
        contentType: parsed.fileInfo.mimetype,
      });
      fotoOriginal = parsed.fileInfo.original;
      fotoMimetype = parsed.fileInfo.mimetype;
    }

    const { rows } = await query(
      `INSERT INTO saldo_bank
        (tanggal_sisa_saldo, nominal, foto_filename, foto_original_name, foto_mimetype, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING id`,
      [d.tanggal_sisa_saldo, d.nominal, newFilename, fotoOriginal, fotoMimetype, request.user.id]
    );
    reply.code(201).send({ id: rows[0].id });
  });

  // ----- PUT /saldo-bank/:id (multipart, foto opsional) -----
  // Kalau ada foto baru → replace + delete file lama.
  // Kalau tidak → keep foto lama.
  fastify.put('/:id', canEditPerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    if (!request.isMultipart()) return reply.code(400).send({ error: 'Harus pakai multipart/form-data.' });

    let parsed;
    try {
      parsed = await parseMultipart(request);
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.message });
    }
    const validation = baseSchema.safeParse(parsed.fields);
    if (!validation.success) return reply.code(400).send({ error: validation.error.errors[0].message });

    const { rows: existing } = await query(`SELECT foto_filename FROM saldo_bank WHERE id=$1`, [id]);
    if (existing.length === 0) return reply.code(404).send({ error: 'Saldo Bank tidak ditemukan.' });
    const oldFilename = existing[0].foto_filename;

    const d = validation.data;
    let newFilename = oldFilename;
    let newOriginal = null, newMime = null;
    let writtenKey = null; // object yang sudah ditulis → utk rollback kalau UPDATE gagal

    if (parsed.fileInfo) {
      newFilename = crypto.randomUUID() + safeExt(parsed.fileInfo.original);
      writtenKey = objectKey(newFilename);
      await putObject({
        key: writtenKey,
        body: parsed.fileInfo.buffer,
        contentType: parsed.fileInfo.mimetype,
      });
      newOriginal = parsed.fileInfo.original;
      newMime     = parsed.fileInfo.mimetype;
    }

    try {
      if (parsed.fileInfo) {
        await query(
          `UPDATE saldo_bank SET tanggal_sisa_saldo=$1, nominal=$2,
             foto_filename=$3, foto_original_name=$4, foto_mimetype=$5, updated_by=$6
           WHERE id=$7`,
          [d.tanggal_sisa_saldo, d.nominal, newFilename, newOriginal, newMime, request.user.id, id]
        );
        // Hapus object lama hanya setelah UPDATE sukses
        if (oldFilename && oldFilename !== newFilename) {
          await deleteObject(objectKey(oldFilename));
        }
      } else {
        await query(
          `UPDATE saldo_bank SET tanggal_sisa_saldo=$1, nominal=$2, updated_by=$3 WHERE id=$4`,
          [d.tanggal_sisa_saldo, d.nominal, request.user.id, id]
        );
      }
      return { id };
    } catch (e) {
      // Rollback object yang sudah disimpan kalau UPDATE gagal
      if (writtenKey) await deleteObject(writtenKey);
      throw e;
    }
  });

  // ----- POST /bulk-delete (hapus banyak) — admin/superadmin only -----
  // Hapus banyak saldo bank + file foto-nya (best-effort, setelah commit).
  fastify.post('/bulk-delete',
    { preHandler: [fastify.authenticate, fastify.authorize(['admin', 'superadmin'])] },
    async (request, reply) => {
      const rawIds = Array.isArray(request.body?.ids) ? request.body.ids : [];
      const ids = [...new Set(rawIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (ids.length === 0) return reply.code(400).send({ error: 'Tidak ada data yang dipilih untuk dihapus.' });
      if (ids.length > 1000) return reply.code(400).send({ error: 'Terlalu banyak data sekaligus (maks 1000).' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `SELECT foto_filename FROM saldo_bank WHERE id = ANY($1::int[]) AND foto_filename IS NOT NULL`,
          [ids]
        );
        const { rowCount } = await client.query(`DELETE FROM saldo_bank WHERE id = ANY($1::int[])`, [ids]);
        await client.query('COMMIT');
        // Best-effort hapus object foto setelah commit.
        for (const r of rows) {
          await deleteObject(objectKey(r.foto_filename));
        }
        return { success: true, deleted: rowCount };
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
  );

  // ----- DELETE /saldo-bank/:id -----------------------------
  fastify.delete('/:id', canDeletePerm, async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isInteger(id) || id <= 0) return reply.code(400).send({ error: 'ID tidak valid.' });
    const { rows } = await query(`SELECT foto_filename FROM saldo_bank WHERE id=$1`, [id]);
    if (rows.length === 0) return reply.code(404).send({ error: 'Saldo Bank tidak ditemukan.' });
    await query(`DELETE FROM saldo_bank WHERE id=$1`, [id]);
    // Best-effort delete object
    if (rows[0].foto_filename) {
      await deleteObject(objectKey(rows[0].foto_filename));
    }
    return { success: true };
  });
}
