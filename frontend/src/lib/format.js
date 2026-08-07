// ============================================================
// Formatter utilities
// ============================================================
// - Date/time: selalu UTC+7 (Asia/Jakarta) untuk konsistensi
// - IDR: format rupiah dengan thousand separator
// ============================================================

const TZ = 'Asia/Jakarta';

/** Contoh output: "21 Mei 2026, 09:35" */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('id-ID', {
    timeZone: TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Contoh output: "21 Mei 2026" — utk timestamp ISO atau Date object */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', {
    timeZone: TZ,
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * Format tanggal "YYYY-MM-DD" (string DATE dari DB, bukan timestamp).
 * Tidak pakai timezone karena DATE pure tanpa offset.
 * Contoh output: "21 Mei 2026"
 */
export function formatDateOnly(ymd) {
  if (!ymd) return '—';
  const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return ymd;
  const [, y, mo, d] = m;
  // Bangun Date sebagai UTC midnight untuk hindari geseran timezone
  const date = new Date(Date.UTC(+y, +mo - 1, +d));
  return date.toLocaleDateString('id-ID', {
    timeZone: 'UTC',
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Rp 1.500.000 (tanpa desimal — IDR biasanya bulat) */
export function formatIDR(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/** "1.500.000" — utk display di input field */
export function formatNumberID(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num === 0) return '';
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(num);
}

/** Parse "1.500.000" atau "1500000" atau "Rp 1.500.000" → 1500000 */
export function parseAmount(str) {
  if (str === null || str === undefined) return 0;
  const digits = String(str).replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
