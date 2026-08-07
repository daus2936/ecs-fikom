import { useState, useRef, useEffect } from 'react';

/**
 * SearchSelect — pilihan tunggal dengan input search.
 * Props:
 *   options:      [{ value, label }]
 *   selected:     value yang dipilih (number/string/null)
 *   onChange:     (value | null) => void
 *   placeholder, emptyMessage, disabled
 */
export default function SearchSelect({
  options = [],
  selected = null,
  onChange,
  placeholder = 'Cari…',
  emptyMessage = 'Tidak ada hasil.',
  disabled = false,
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectedOption = options.find((o) => o.value === selected);
  const filtered = query.trim() === ''
    ? options
    : options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()));

  const displayValue = open ? query : (selectedOption?.label || '');

  return (
    <div className="relative" ref={wrapRef}>
      <div className="relative">
        <input
          type="text"
          disabled={disabled}
          className="input pr-8"
          placeholder={placeholder}
          value={displayValue}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => { setOpen(true); setQuery(''); }}
        />
        {selectedOption && !open && !disabled && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-lg leading-none"
            aria-label="Clear"
            tabIndex={-1}
          >×</button>
        )}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-slate-400">{emptyMessage}</div>
          ) : filtered.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); setQuery(''); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${
                opt.value === selected ? 'bg-brand-50 text-brand-900' : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
