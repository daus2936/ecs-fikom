import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { canView } from '../lib/permissions.js';

/**
 * Bungkus rute yang butuh login.
 * - roles=['admin','superadmin'] : pembatasan berdasarkan daftar role (legacy)
 * - page='gross-profit-1'        : pembatasan berdasarkan matrix permission (view)
 */
export default function ProtectedRoute({ children, roles, page }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-slate-500 text-sm">
        Memuat…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  if (page && !canView(user.role, page)) {
    return <Navigate to="/" replace />;
  }
  return children;
}
