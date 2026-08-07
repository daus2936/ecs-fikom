import { useState, useRef, useEffect, useMemo } from 'react';

/**
 * Searchable multi-select.
 *
 * Props:
 * - options:    array of { value, label }
 * - selected:   array of value (controlled)
 * - onChange:   (newSelected) => void
 * - placeholder
 * - emptyMessage
 */
export default function MultiSearchSelect({
  options,
  selected,
  onChange,
  placeholder = 'Cari & pilih…',
  emptyMessage = 'Tidak ada hasil.',
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const inputRef = useRef(null);

  // Map untuk lookup label cepat dari value
  const labelByValue = useMemo(() => {
    const map = new Map();
    options.forEach((o) => map.set(o.value, o.label));
    return map;
  }, [options]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  // Filter options: exclude yg sudah dipilih, lalu match query
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return options
      .filter((o) => !selectedSet.has(o.value))
      .filter((o) => !q || o.label.toLowerCase().includes(q))
      .slice(0, 50); // limit dropdown utk performa
  }, [options, selectedSet, search]);

  const addItem = (value) => {
    if (selectedSet.has(value)) return;
    onChange([...selected, value]);
    setSearch('');
    inputRef.current?.focus();
  };
  const removeItem = (value) => {
    onChange(selected.filter((v) => v !== value));
  };

  const onKeyDown = (e) => {
    // Backspace di input kosong → hapus chip terakhir
    if (e.key === 'Backspace' && search === '' && selected.length > 0) {
      removeItem(selected[selected.length - 1]);
    }
    // Enter → pilih item pertama yg ter-filter
    if (e.key === 'Enter' && filtered.length > 0) {
      e.preventDefault();
      addItem(filtered[0].value);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      {/* Container chips + input */}
      <div
        className={`min-h-[42px] w-full px-2 py-1.5 rounded-lg border bg-white text-sm
                    flex flex-wrap gap-1.5 cursor-text transition-colors
                    ${open ? 'border-brand-500 ring-2 ring-brand-500/20' : 'border-slate-300 hover:border-slate-400'}`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {selected.map((value) => (
          <Chip
            key={value}
            label={labelByValue.get(value) || value}
            onRemove={() => removeItem(value)}
          />
        ))}
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={selected.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent py-1 placeholder:text-slate-400"
        />
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-slate-400">
              {search ? emptyMessage : 'Mulai ketik untuk mencari…'}
            </div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => addItem(o.value)}
                className="w-full text-left px-3 py-2 text-sm font-mono hover:bg-brand-50 hover:text-brand-800"
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 text-xs font-mono px-2 py-1 rounded">
      {label}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="text-brand-700 hover:text-brand-900 text-sm leading-none"
        aria-label={`Hapus ${label}`}
      >×</button>
    </span>
  );
}
