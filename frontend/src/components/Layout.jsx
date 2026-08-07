import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import ChangePasswordModal from './ChangePasswordModal.jsx';
import TwoFactorModal from './TwoFactorModal.jsx';
import { canView, PAGES, ROLE_LABELS } from '../lib/permissions.js';

export default function Layout() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [showChangePw, setShowChangePw] = useState(false);
  const [show2fa, setShow2fa] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const role = user?.role;
  const show = (page) => role && canView(role, page);

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-sky-500 grid place-items-center font-bold text-white">M</div>
            <div>
              <div className="font-bold text-lg tracking-tight">FIKOM</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {show(PAGES.DASHBOARD)       && <NavItem to="/" label="Dashboard" />}
          {show(PAGES.INVOICES)        && <NavItem to="/invoices" label="Nomor Invoice" />}
          {show(PAGES.PURCHASE_ORDERS) && <NavItem to="/purchase-orders" label="Nomor Purchase Order (PO)" />}
          {show(PAGES.EXPENSES)        && <NavItem to="/expenses" label="Expenses" />}
          {show(PAGES.EXPENSES_BEFORE_2025) && <NavItem to="/expenses-before-2025" label="Expenses Before 2025" />}
          {show(PAGES.DB_BEFORE_2025) && <NavItem to="/db-before-2025" label="DB Before 2025" />}
          {show(PAGES.DB) && <NavItem to="/db" label="DB" />}
          {show(PAGES.INVOICE_DETAILS) && <NavItem to="/invoice-details" label="Invoice Detail" />}
          {show(PAGES.NOMINAL_INVOICE_DETAIL) && <NavItem to="/nominal-invoice-detail" label="Nominal Invoice Detail" />}
          {show(PAGES.INVOICE_COVERS)  && <NavItem to="/invoice-covers" label="Invoice Cover" />}
          {show(PAGES.INVOICE_COVER_BEFORE_2025) && <NavItem to="/invoice-cover-before-2025" label="Invoice Cover Before 2025" />}
          {show(PAGES.PAYMENTS)        && <NavItem to="/payments" label="Payment" />}
          {show(PAGES.GROSS_PROFIT_1)  && <NavItem to="/gross-profit-1" label="Gross Profit 1" />}
          {show(PAGES.GROSS_PROFIT_2)  && <NavItem to="/gross-profit-2" label="Gross Profit 2" />}
          {show(PAGES.GROSS_PROFIT_BEFORE_2025) && <NavItem to="/gross-profit-before-2025" label="Gross Profit Before 2025" />}
          {show(PAGES.REKENING)        && <NavItem to="/rekening"           label="Rekening" />}
          {show(PAGES.HUTANG)          && <NavItem to="/hutang"             label="Hutang" />}
          {show(PAGES.M)               && <NavItem to="/m"                  label="M" />}
          {show(PAGES.BUNGA_HUTANG)    && <NavItem to="/bunga-hutang"       label="Bunga Hutang" />}
          {show(PAGES.BAYAR_HUTANG)    && <NavItem to="/bayar-hutang"       label="Bayar Hutang" />}
          {show(PAGES.BM)              && <NavItem to="/bm"                 label="BM" />}
          {show(PAGES.BAYAR_BUNGA)     && <NavItem to="/bayar-bunga-hutang" label="Bayar Bunga Hutang" />}
          {show(PAGES.MG)              && <NavItem to="/mg" label="Mg" />}
          {show(PAGES.NEI)             && <NavItem to="/nei" label="Nei" />}
          {show(PAGES.NEIU)            && <NavItem to="/neiu" label="NeiU" />}
          {show(PAGES.NEIP)            && <NavItem to="/neip" label="NeiP" />}
          {show(PAGES.SALDO_BANK)      && <NavItem to="/saldo-bank"         label="Saldo Bank" />}
          {show(PAGES.USERS)           && <NavItem to="/users" label="Akun" />}
        </nav>

        <div className="px-4 py-3 border-t border-slate-800">
          <div className="text-xs text-slate-400">Masuk sebagai</div>
          <div className="text-sm font-medium truncate">{user?.full_name}</div>
          <div className="text-xs text-slate-400 mb-3">{ROLE_LABELS[user?.role] || user?.role}</div>
          <button
            onClick={() => setShowChangePw(true)}
            className="btn-secondary w-full !bg-slate-800 !text-slate-100 !border-slate-700 hover:!bg-slate-700 mb-2"
          >
            Ubah Password
          </button>
          <button
            onClick={() => setShow2fa(true)}
            className="btn-secondary w-full !bg-slate-800 !text-slate-100 !border-slate-700 hover:!bg-slate-700 mb-2"
          >
            Autentikasi 2 Langkah
            {user?.twofa_enabled && <span className="ml-1.5 text-emerald-400 text-xs">●</span>}
          </button>
          <button onClick={handleLogout} className="btn-secondary w-full !bg-slate-800 !text-slate-100 !border-slate-700 hover:!bg-slate-700">
            Keluar
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Self-service change password */}
      <ChangePasswordModal
        open={showChangePw}
        onClose={() => setShowChangePw(false)}
      />

      {/* Self-service 2FA */}
      <TwoFactorModal
        open={show2fa}
        onClose={() => setShow2fa(false)}
        enabled={!!user?.twofa_enabled}
        onChanged={refreshUser}
      />
    </div>
  );
}

function NavItem({ to, label }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? 'bg-brand-700 text-white'
            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      {label}
    </NavLink>
  );
}
