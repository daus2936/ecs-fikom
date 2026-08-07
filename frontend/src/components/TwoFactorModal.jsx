import { useState, useEffect } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import Modal from './Modal.jsx';

// Modal kelola 2FA mandiri.
// Props:
//   open, onClose
//   enabled  : status 2FA user saat ini
//   onChanged: callback setelah status berubah (untuk refresh profil)
export default function TwoFactorModal({ open, onClose, enabled, onChanged }) {
  const [phase, setPhase] = useState('idle'); // idle | setup | disabling
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // setup data
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [otp, setOtp] = useState('');

  // disable
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) {
      setPhase('idle'); setError(''); setSuccess('');
      setSecret(''); setQr(''); setOtp(''); setPassword('');
    }
  }, [open]);

  // Mulai setup → minta secret + QR dari backend
  const startSetup = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const { data } = await api.post('/auth/2fa/setup');
      setSecret(data.secret);
      setQr(data.qr || '');
      setPhase('setup');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Verifikasi token pertama → aktifkan
  const confirmEnable = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/auth/2fa/enable', { token: otp.trim() });
      setSuccess('2FA berhasil diaktifkan. Mulai login berikutnya Anda akan diminta kode OTP.');
      setPhase('idle');
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Nonaktifkan (butuh password)
  const confirmDisable = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/auth/2fa/disable', { password });
      setSuccess('2FA berhasil dinonaktifkan.');
      setPhase('idle');
      onChanged?.();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Autentikasi 2 Langkah (2FA)" maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Status banner */}
        <div className={`text-sm rounded-lg px-3 py-2 border ${
          enabled
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-slate-50 border-slate-200 text-slate-600'
        }`}>
          Status: <span className="font-semibold">{enabled ? 'AKTIF' : 'Tidak aktif'}</span>
        </div>

        {success && (
          <div className="text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
            {success}
          </div>
        )}
        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* ===== IDLE: tombol aktif / nonaktif ===== */}
        {phase === 'idle' && !success && (
          <>
            {!enabled ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Tambahkan lapisan keamanan ekstra. Setelah aktif, Anda perlu memasukkan kode dari
                  aplikasi authenticator (Google Authenticator, Authy, Microsoft Authenticator)
                  setiap kali login.
                </p>
                <button onClick={startSetup} disabled={loading} className="btn-primary w-full">
                  {loading ? 'Memuat…' : 'Aktifkan 2FA'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  2FA sedang aktif di akun Anda. Untuk menonaktifkan, konfirmasi dengan password.
                </p>
                <button onClick={() => { setPhase('disabling'); setError(''); }} className="btn-secondary w-full !text-red-700 !border-red-200 hover:!bg-red-50">
                  Nonaktifkan 2FA
                </button>
              </div>
            )}
          </>
        )}

        {/* ===== SETUP: tampilkan QR + secret + input OTP ===== */}
        {phase === 'setup' && (
          <form onSubmit={confirmEnable} className="space-y-4">
            <div>
              <p className="text-sm text-slate-600 mb-3">
                1. Scan QR code ini di aplikasi authenticator Anda:
              </p>
              {qr ? (
                <div className="flex justify-center">
                  <img src={qr} alt="QR Code 2FA" className="w-48 h-48 border border-slate-200 rounded-lg" />
                </div>
              ) : (
                <p className="text-xs text-amber-700">QR gagal dimuat — gunakan kode manual di bawah.</p>
              )}
            </div>

            <div>
              <p className="text-sm text-slate-600 mb-1">
                Atau masukkan kode ini manual:
              </p>
              <code className="block bg-slate-100 rounded-lg px-3 py-2 text-sm font-mono break-all select-all text-slate-800">
                {secret}
              </code>
            </div>

            <div>
              <label className="label">2. Masukkan kode 6 digit untuk konfirmasi</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                pattern="\d{6}"
                className="input text-center text-xl tracking-[0.4em] font-mono"
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPhase('idle')} className="btn-secondary">Batal</button>
              <button type="submit" disabled={loading || otp.length !== 6} className="btn-primary">
                {loading ? 'Memverifikasi…' : 'Aktifkan'}
              </button>
            </div>
          </form>
        )}

        {/* ===== DISABLING: konfirmasi password ===== */}
        {phase === 'disabling' && (
          <form onSubmit={confirmDisable} className="space-y-4">
            <div>
              <label className="label">Konfirmasi Password</label>
              <input
                type="password"
                autoComplete="current-password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1">Untuk keamanan, masukkan password Anda untuk menonaktifkan 2FA.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPhase('idle')} className="btn-secondary">Batal</button>
              <button type="submit" disabled={loading || !password} className="btn-primary !bg-red-600 hover:!bg-red-700">
                {loading ? 'Memproses…' : 'Nonaktifkan 2FA'}
              </button>
            </div>
          </form>
        )}

        {phase === 'idle' && (
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button onClick={onClose} className="btn-secondary">Tutup</button>
          </div>
        )}
      </div>
    </Modal>
  );
}
