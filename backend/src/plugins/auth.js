import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { can } from '../lib/permissions.js';

/**
 * Plugin: registrasi JWT + decorators
 *   - request.user        : payload JWT (id, username, role)
 *   - fastify.authenticate: preHandler untuk verifikasi token
 *   - fastify.authorize(['admin','superadmin']): preHandler role check sederhana
 *   - fastify.requirePermission(page, capability): preHandler cek matrix izin
 */
async function authPlugin(fastify) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET belum di-set di .env');
  }

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET,
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '12h' },
  });

  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      return reply.code(401).send({ error: 'Token tidak valid atau sudah expired.' });
    }
  });

  fastify.decorate('authorize', (allowedRoles) => async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Tidak terautentikasi.' });
    }
    if (!allowedRoles.includes(request.user.role)) {
      return reply.code(403).send({ error: 'Akses ditolak untuk role ini.' });
    }
  });

  // Guard berbasis matrix permission. Contoh:
  //   preHandler: [fastify.authenticate, fastify.requirePermission('expenses', 'edit')]
  fastify.decorate('requirePermission', (page, capability) => async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: 'Tidak terautentikasi.' });
    }
    if (!can(request.user.role, page, capability)) {
      return reply.code(403).send({ error: 'Akses ditolak untuk role ini.' });
    }
  });
}

export default fp(authPlugin);
