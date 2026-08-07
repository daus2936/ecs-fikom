// ============================================================
// Pagination.jsx — kontrol pagination reusable (client-side).
//
// Pakai:
//   const { pageItems, page, setPage, totalPages, total } = usePagination(items, 10);
//   ... render pageItems ...
//   <Pagination page={page} totalPages={totalPages} total={total} onChange={setPage} />
// ============================================================
import { useState, useEffect, useMemo } from 'react';

const PAGE_SIZE_DEFAULT = 10;

// Hook: potong array jadi halaman. Auto-reset ke halaman 1 kalau
// jumlah item berubah (mis. setelah filter/search).
export function usePagination(items, pageSize = PAGE_SIZE_DEFAULT) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Kalau data berubah & halaman sekarang di luar range, balik ke range valid.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { pageItems, page, setPage, totalPages, total, pageSize };
}

// Komponen kontrol pagination. Sembunyi otomatis kalau cuma 1 halaman & data sedikit.
export default function Pagination({ page, totalPages, total, pageSize = PAGE_SIZE_DEFAULT, onChange }) {
  if (total === 0) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Bangun daftar nomor halaman dengan ellipsis (maks ~7 tombol).
  const pages = buildPageList(page, totalPages);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50 text-sm">
      <div className="text-slate-500">
        Menampilkan <span className="font-medium text-slate-700">{start}</span>–
        <span className="font-medium text-slate-700">{end}</span> dari{' '}
        <span className="font-medium text-slate-700">{total}</span> data
      </div>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e${i}`} className="px-2 text-slate-400">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={`min-w-[32px] px-2.5 py-1 rounded-md border text-center ${
                p === page
                  ? 'border-brand-600 bg-brand-600 text-white font-medium'
                  : 'border-slate-300 text-slate-600 hover:bg-white'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="px-2.5 py-1 rounded-md border border-slate-300 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ›
        </button>
      </div>
    </div>
  );
}

// Hasilkan daftar nomor halaman dengan ellipsis.
// Contoh: page=5, total=10 → [1, '...', 4, 5, 6, '...', 10]
function buildPageList(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push('...');
  for (let p = left; p <= right; p++) pages.push(p);
  if (right < total - 1) pages.push('...');
  pages.push(total);

  return pages;
}
