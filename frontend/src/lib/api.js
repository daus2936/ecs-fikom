import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000',
});

// Attach token otomatis dari localStorage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('fikom_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout kalau token expired / invalid
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && localStorage.getItem('fikom_token')) {
      localStorage.removeItem('fikom_token');
      localStorage.removeItem('fikom_user');
      // Hindari loop kalau sudah di /login
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

/** Ambil pesan error yang friendly dari response */
export function getErrorMessage(err) {
  return err.response?.data?.error || err.message || 'Terjadi kesalahan.';
}

export default api;
