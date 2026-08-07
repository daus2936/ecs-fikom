import { pool } from '../config/db.js';

// ============================================================
// Helper bulk delete (hapus banyak baris sekaligus) dalam 1 transaksi.
//
// makeBulkDeleteHandler({ table, label, fkMessage, beforeDeleteIds })
//   - table   : nama tabel (mis. 'invoices')
//   - label   : label untuk pesan (mis. 'Nomor Invoice')
//   - fkMessage: pesan kalau gagal karena masih dipakai data lain (FK RESTRICT)
//   - beforeDeleteIds(client, ids): opsional, dipanggil DI DALAM transaksi
//       sebelum DELETE (mis. untuk ambil nama file yang perlu dihapus).
//       Boleh mengembalikan nilai yang diteruskan ke afterCommit.
//   - afterCommit(carry): opsional, dipanggil SETELAH commit (mis. hapus file
//       fisik best-effort). Tidak boleh meng-rollback.
//
// Mengembalikan async handler Fastify. Body: { ids: number[] }.
// Sifat transaksional: kalau SATU id gagal (mis. FK RESTRICT), SELURUH
// batch di-rollback dan tidak ada yang terhapus (perilaku dapat diprediksi).
// ============================================================
export function makeBulkDeleteHandler({ table, label, fkMessage, beforeDeleteIds, afterCommit }) {
  return async function bulkDelete(request, reply) {
    const body = request.body || {};
    const rawIds = Array.isArray(body.ids) ? body.ids : [];
    const ids = [...new Set(
      rawIds.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0)
    )];

    if (ids.length === 0) {
      return reply.code(400).send({ error: 'Tidak ada data yang dipilih untuk dihapus.' });
    }
    if (ids.length > 1000) {
      return reply.code(400).send({ error: 'Terlalu banyak data sekaligus (maks 1000).' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let carry;
      if (beforeDeleteIds) carry = await beforeDeleteIds(client, ids);

      const { rowCount } = await client.query(
        `DELETE FROM ${table} WHERE id = ANY($1::int[])`,
        [ids]
      );

      await client.query('COMMIT');

      if (afterCommit) { try { await afterCommit(carry); } catch { /* best-effort */ } }

      return { success: true, deleted: rowCount };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      if (e.code === '23503') {
        return reply.code(400).send({
          error: fkMessage || `Sebagian ${label} masih dipakai data lain — tidak ada yang dihapus.`,
        });
      }
      throw e;
    } finally {
      client.release();
    }
  };
}
