// ============================================================
// Storage abstraction  (FILE BARU)
// ============================================================
// Satu interface untuk simpan/hapus/serve file, dengan 2 driver
// yang dipilih lewat env STORAGE_DRIVER:
//
//   STORAGE_DRIVER=local  → disk lokal (default; dipakai untuk DEV)
//   STORAGE_DRIVER=s3     → Amazon S3 (dipakai untuk PRODUCTION/kontainer)
//
// Tujuannya: route (saldo-bank.js) tidak peduli file disimpan di mana.
// Pindah ke S3 = ganti 1 env var, bukan ubah route.
//
// "key" = path relatif object, mis. "saldo-bank/<uuid>.jpg".
// ============================================================
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl as presign } from '@aws-sdk/s3-request-presigner';

const DRIVER = (process.env.STORAGE_DRIVER || 'local').toLowerCase();

// ------------------------------------------------------------
// Driver: LOCAL (dev)
// File ditulis ke ./uploads/<key> dan disajikan oleh @fastify/static
// di server.js pada prefix /uploads/. URL dibentuk dari PUBLIC_BASE_URL
// supaya bisa diakses lintas origin (frontend :5173 → backend :4000).
// ------------------------------------------------------------
const LOCAL_ROOT = path.resolve(process.cwd(), 'uploads');

const localDriver = {
  async put({ key, body }) {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  },
  async remove(key) {
    // best-effort: tidak melempar kalau file sudah tidak ada
    await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
  },
  async signedUrl(key) {
    const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
    return `${base}/uploads/${key}`;
  },
};

// ------------------------------------------------------------
// Driver: S3 (production)
// Kredensial TIDAK diambil dari kode. SDK otomatis pakai IAM Role
// (ECS task role) di production, atau AWS_ACCESS_KEY_ID/SECRET dari
// environment saat dev lokal.
// signedUrl() = presigned GET URL berbatas waktu → object TIDAK perlu
// public, dan akses tetap terkontrol (link expired setelah TTL).
// ------------------------------------------------------------
const BUCKET = process.env.S3_BUCKET;
const SIGNED_URL_TTL = Number(process.env.S3_SIGNED_URL_TTL || 3600); // detik

let _s3 = null;
function s3() {
  if (!_s3) _s3 = new S3Client({ region: process.env.AWS_REGION });
  return _s3;
}

const s3Driver = {
  async put({ key, body, contentType }) {
    await s3().send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }));
  },
  async remove(key) {
    await s3()
      .send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
      .catch(() => {});
  },
  async signedUrl(key) {
    return presign(
      s3(),
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
      { expiresIn: SIGNED_URL_TTL },
    );
  },
};

const driver = DRIVER === 's3' ? s3Driver : localDriver;

if (DRIVER === 's3' && !BUCKET) {
  throw new Error('STORAGE_DRIVER=s3 tapi S3_BUCKET belum di-set.');
}

// ------------------------------------------------------------
// Public API
// ------------------------------------------------------------
/** Simpan object. args = { key, body, contentType }. */
export function putObject(args)   { return driver.put(args); }
/** Hapus object (best-effort, tidak throw kalau gagal). */
export function deleteObject(key) { return driver.remove(key); }
/** URL untuk menampilkan object. Di S3 = presigned URL (time-limited). */
export function getObjectUrl(key) { return driver.signedUrl(key); }

/** Driver aktif ('local' | 's3'). Dipakai server.js utk static serving. */
export const storageDriver = DRIVER;
