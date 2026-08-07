import { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { getErrorMessage } from '../lib/api.js';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [twofaStep, setTwofaStep] = useState(false); // true setelah password benar tapi 2FA aktif
  const [otp, setOtp] = useState('');

  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(form.username.trim(), form.password, twofaStep ? otp.trim() : undefined);
      if (result?.twofa_required) {
        // Password benar, butuh OTP. Pindah ke langkah 2.
        setTwofaStep(true);
        setError('');
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const resetToLogin = () => {
    setTwofaStep(false);
    setOtp('');
    setError('');
    setSubmitting(false);
    setForm((f) => ({ ...f, password: '' })); // kosongkan password, user isi ulang
  };

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-sky-500 grid place-items-center font-bold text-white text-xl shadow-lg shadow-sky-500/30">M</div>
          <div>
            <div className="font-bold text-2xl tracking-tight text-slate-900">FIKOM</div>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {!twofaStep ? (
            <>
              <h1 className="text-lg font-semibold text-slate-900 mb-1">Masuk ke akun</h1>
              <p className="text-sm text-slate-500 mb-6">Gunakan kredensial yang diberikan administrator.</p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label">Username</label>
                  <input
                    type="text"
                    autoComplete="username"
                    className="input"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    className="input"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting} className="btn-primary w-full">
                  {submitting ? 'Memproses…' : 'Masuk'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-slate-900 mb-1">Verifikasi 2 Langkah</h1>
              <p className="text-sm text-slate-500 mb-6">
                Masukkan kode 6 digit dari aplikasi authenticator Anda (Google Authenticator, Authy, dll).
              </p>

              <form onSubmit={onSubmit} className="space-y-4">
                <div>
                  <label className="label">Kode OTP</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    pattern="\d{6}"
                    className="input text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="••••••"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    required
                    autoFocus
                  />
                </div>

                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting || otp.length !== 6} className="btn-primary w-full">
                  {submitting ? 'Memverifikasi…' : 'Verifikasi & Masuk'}
                </button>
              </form>
              <button
                type="button"
                onClick={resetToLogin}
                className="btn-secondary w-full mt-4"
              >
                Kembali
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
