import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../lib/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('fikom_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  // Verify token saat reload
  useEffect(() => {
    const token = localStorage.getItem('fikom_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('fikom_user', JSON.stringify(data.user));
      })
      .catch(() => {
        localStorage.removeItem('fikom_token');
        localStorage.removeItem('fikom_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username, password, token) => {
    const payload = { username, password };
    if (token) payload.token = token;
    const { data } = await api.post('/auth/login', payload);

    // Kalau backend minta 2FA, belum ada token JWT — kembalikan flag.
    if (data.twofa_required) {
      return { twofa_required: true };
    }

    localStorage.setItem('fikom_token', data.token);
    localStorage.setItem('fikom_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('fikom_token');
    localStorage.removeItem('fikom_user');
    setUser(null);
  }, []);

  // Ambil ulang profil dari server (mis. setelah 2FA berubah).
  const refreshUser = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data.user);
      localStorage.setItem('fikom_user', JSON.stringify(data.user));
      return data.user;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus dipakai di dalam <AuthProvider>');
  return ctx;
}
