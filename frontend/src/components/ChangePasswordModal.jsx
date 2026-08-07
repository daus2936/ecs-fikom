import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import Modal from './Modal.jsx';

export default function ChangePasswordModal({ open, onClose }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showOld, setShowOld]     = useState(false);
  const [showNew, setShowNew]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state setiap kali modal dibuka
  useEffect(() => {
    if (open) {
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setShowOld(false); setShowNew(false);
      setError(''); setSuccess('');
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (newPw.length < 8) {
      return setError('Password baru minimal 8 karakter.');
    }
    if (newPw !== confirmPw) {
      return setError('Konfirmasi password baru tidak cocok.');
    }
    if (newPw === currentPw) {
      return setError('Password baru tidak boleh sama dengan password lama.');
    }

    setSubmitting(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPw,
        new_password:     newPw,
      });
      setSuccess('Password berhasil diubah. Gunakan password baru saat login berikutnya.');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Ubah Password" maxWidth="max-w-md">
      <form onSubmit={submit} className="space-y-4">
        {/* Password lama */}
        <div>
          <label className="label">Password Lama <span className="text-red-500">*</span></label>
          <div className="relative">
            <input
              type={showOld ? 'text' : 'password'}
              required
              autoComplete="current-password"
              className="input pr-20"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowOld((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
              tabIndex={-1}
            >
              {showOld ? 'Sembunyi' : 'Lihat'}
            </button>
          </div>
        </div>

        {/* Password baru */}
        <div>
          <label className="label">Password Baru <span className="text-red-500">*</span></label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="new-password"
              className="input pr-20"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 px-2 py-1"
              tabIndex={-1}
            >
              {showNew ? 'Sembunyi' : 'Lihat'}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">Minimal 8 karakter.</p>
        </div>

        {/* Konfirmasi password baru */}
        <div>
          <label className="label">Konfirmasi Password Baru <span className="text-red-500">*</span></label>
          <input
            type={showNew ? 'text' : 'password'}
            required
            minLength={8}
            autoComplete="new-password"
            className="input"
            value={confirmPw}
            onChange={(e) => setConfirmPw(e.target.value)}
          />
          {confirmPw && newPw && confirmPw !== newPw && (
            <p className="text-xs text-amber-700 mt-1">Belum cocok dengan password baru.</p>
          )}
        </div>

        {/* Error / success message */}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {success}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button type="button" onClick={onClose} className="btn-secondary">
            {success ? 'Tutup' : 'Batal'}
          </button>
          {!success && (
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? 'Menyimpan…' : 'Simpan Password Baru'}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
