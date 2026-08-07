import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';

import { storageDriver } from './lib/storage.js';
import authPlugin from './plugins/auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import invoiceRoutes from './routes/invoices.js';
import purchaseOrderRoutes from './routes/purchase-orders.js';
import expenseRoutes from './routes/expenses.js';
import mgRoutes from './routes/mg.js';
import expensesBefore2025Routes from './routes/expenses-before-2025.js';
import dbBefore2025Routes from './routes/db-before-2025.js';
import dbRoutes from './routes/db.js';
import invoiceCoverBefore2025Routes from './routes/invoice-cover-before-2025.js';
import invoiceDetailRoutes from './routes/invoice-details.js';
import invoiceCoverRoutes from './routes/invoice-covers.js';
import neiRoutes from './routes/nei.js';
import paymentRoutes from './routes/payments.js';
import grossProfit1Routes from './routes/gross-profit-1.js';
import grossProfitBefore2025Routes from './routes/gross-profit-before-2025.js';
import grossProfit2Routes from './routes/gross-profit-2.js';
import rekeningRoutes from './routes/rekening.js';
import hutangRoutes from './routes/hutang.js';
import mRoutes from './routes/m.js';
import neiuRoutes from './routes/neiu.js';
import neipRoutes from './routes/neip.js';
import bayarHutangRoutes from './routes/bayar-hutang.js';
import bmRoutes from './routes/bm.js';
import bayarBungaHutangRoutes from './routes/bayar-bunga-hutang.js';
import bungaHutangRoutes from './routes/bunga-hutang.js';
import saldoBankRoutes from './routes/saldo-bank.js';

const app = Fastify({
  // Matikan log request bawaan Fastify ("incoming request"/"request completed")
  // karena log itu dibuat sebelum JWT diverifikasi, jadi tidak tahu username.
  // Kita ganti dengan log buatan sendiri (di hook bawah) yang menyertakan username.
  disableRequestLogging: true,
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'production'
      ? undefined
      : {
          target: 'pino-pretty',
          options: {
            // 'SYS:' membuat pino-pretty memakai zona waktu SISTEM (bukan UTC).
            // Server di Asia/Jakarta -> log tampil dalam WIB (UTC+7).
            // Format: tanggal + jam, mis. [01-06-2026 12:46:15].
            translateTime: 'SYS:dd-mm-yyyy HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
  },
});

// ---- Plugins ----
await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(',') || true,
  credentials: true,
});
await app.register(sensible);
await app.register(authPlugin);
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max per file
});

// ============================================================
// Request logging dengan username (untuk SEMUA request, termasuk GET)
// ============================================================
// Masalah: log bawaan Fastify dibuat di awal request, SEBELUM verifikasi JWT
// (yang jalan di preHandler tiap route), jadi belum tahu siapa user-nya.
//
// Solusi:
//   1. disableRequestLogging: true  -> matikan log bawaan (biar tidak dobel & tanpa username).
//   2. onRequest: best-effort decode JWT -> isi request.user, lalu log "incoming request".
//   3. onResponse: log "request completed".
//
// Decode JWT di onRequest hanya untuk KEPERLUAN LOG dan TIDAK menggantikan
// keamanan: preHandler `authenticate` di tiap route tetap memverifikasi token
// dan menolak yang invalid. Kalau tidak ada token / token invalid -> dianggap
// 'anonymous' untuk log (mis. POST /auth/login, request file statis).

function actorInfo(u) {
  return u ? { id: u.id, username: u.username, role: u.role } : { username: 'anonymous' };
}
function actorLabel(u) {
  return u ? `${u.username} (${u.role})` : 'anonymous';
}
// Lewati log untuk health check & preflight CORS supaya tidak berisik.
function skipLog(request) {
  return request.url === '/health' || request.method === 'OPTIONS';
}

app.addHook('onRequest', async (request) => {
  // Best-effort: kalau ada token valid, isi request.user agar username
  // tersedia bahkan untuk log "incoming request".
  try {
    await request.jwtVerify();
  } catch {
    /* tanpa/invalid token -> anonymous untuk keperluan log */
  }
  if (skipLog(request)) return;
  const u = request.user;
  request.log.info({
    user: actorInfo(u),
    req: {
      method: request.method,
      url: request.url,
      host: request.headers.host,
      remoteAddress: request.ip,
    },
  }, `incoming request - ${actorLabel(u)} ${request.method} ${request.url}`);
});

app.addHook('onResponse', async (request, reply) => {
  if (skipLog(request)) return;
  const u = request.user;
  const method = request.method;

  // Log umum: SEMUA request (termasuk GET) dengan username.
  request.log.info({
    user: actorInfo(u),
    res: { statusCode: reply.statusCode },
    responseTime: reply.elapsedTime,
  }, `request completed - ${actorLabel(u)} ${method} ${request.url} -> ${reply.statusCode}`);

  // AUDIT khusus untuk perubahan data (POST/PUT/PATCH/DELETE) - baris terpisah
  // bertanda "AUDIT" supaya gampang di-grep (grep AUDIT app.log).
  const isMutation = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (isMutation) {
    request.log.info({
      audit: true,
      actor: actorInfo(u),
      action: `${method} ${request.url}`,
      statusCode: reply.statusCode,
    }, `AUDIT: ${actorLabel(u)} -> ${method} ${request.url} -> ${reply.statusCode}`);
  }
});

// Static: serve uploads/ at /uploads/*
// HANYA untuk STORAGE_DRIVER=local (dev). Di S3 (production), file disajikan
// lewat presigned URL dari route — tidak ada static serving sama sekali.
// Ini sekaligus menutup akses anonim ke foto bukti saldo di produksi.
if (storageDriver === 'local') {
  const uploadsDir = path.resolve(process.cwd(), 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  await app.register(staticPlugin, {
    root: uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
  });
}

// ---- Routes ----
app.get('/health', async () => ({ status: 'ok', app: 'FIKOM API' }));
await app.register(authRoutes,              { prefix: '/auth' });
await app.register(userRoutes,              { prefix: '/users' });
await app.register(invoiceRoutes,           { prefix: '/invoices' });
await app.register(purchaseOrderRoutes,     { prefix: '/purchase-orders' });
await app.register(expenseRoutes,           { prefix: '/expenses' });
await app.register(mgRoutes,                { prefix: '/mg' });
await app.register(expensesBefore2025Routes, { prefix: '/expenses-before-2025' });
await app.register(dbBefore2025Routes,      { prefix: '/db-before-2025' });
await app.register(dbRoutes,                { prefix: '/db' });
await app.register(invoiceCoverBefore2025Routes, { prefix: '/invoice-cover-before-2025' });
await app.register(invoiceDetailRoutes,     { prefix: '/invoice-details' });
await app.register(invoiceCoverRoutes,      { prefix: '/invoice-covers' });
await app.register(neiRoutes,               { prefix: '/nei' });
await app.register(paymentRoutes,           { prefix: '/payments' });
await app.register(grossProfit1Routes,      { prefix: '/gross-profit-1' });
await app.register(grossProfitBefore2025Routes, { prefix: '/gross-profit-before-2025' });
await app.register(grossProfit2Routes,      { prefix: '/gross-profit-2' });
await app.register(rekeningRoutes,          { prefix: '/rekening' });
await app.register(hutangRoutes,            { prefix: '/hutang' });
await app.register(mRoutes,                 { prefix: '/m' });
await app.register(neiuRoutes,              { prefix: '/neiu' });
await app.register(neipRoutes,              { prefix: '/neip' });
await app.register(bayarHutangRoutes,       { prefix: '/bayar-hutang' });
await app.register(bmRoutes,                { prefix: '/bm' });
await app.register(bungaHutangRoutes,       { prefix: '/bunga-hutang' });
await app.register(bayarBungaHutangRoutes,  { prefix: '/bayar-bunga-hutang' });
await app.register(saldoBankRoutes,         { prefix: '/saldo-bank' });

// ---- Error handler global ----
app.setErrorHandler((err, request, reply) => {
  request.log.error(err);
  if (reply.sent) return;
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  reply.code(status).send({
    error: status === 500 ? 'Terjadi kesalahan server.' : err.message,
  });
});

// ---- Start ----
const port = parseInt(process.env.PORT || '4000', 10);
// HOST default 0.0.0.0.
// DI KONTAINER (ECS) HARUS 0.0.0.0 — ini alamat BIND, bukan connect.
// Dengan 127.0.0.1, ALB tidak akan bisa menjangkau container dan
// health check gagal terus. Nilai 127.0.0.1 hanya benar untuk setup
// lama (backend + nginx di satu server).
const host = process.env.HOST || '0.0.0.0';
try {
  await app.listen({ port, host });
  app.log.info(`FIKOM API ready on ${host}:${port} (storage: ${storageDriver})`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
