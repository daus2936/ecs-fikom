import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import { canView, firstAccessiblePath, PAGES } from './lib/permissions.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Invoices from './pages/Invoices.jsx';
import PurchaseOrders from './pages/PurchaseOrders.jsx';
import Expenses from './pages/Expenses.jsx';
import ExpensesBefore2025 from './pages/ExpensesBefore2025.jsx';
import DBBefore2025 from './pages/DBBefore2025.jsx';
import DB from './pages/DB.jsx';
import Mg from './pages/Mg.jsx';
import InvoiceDetails from './pages/InvoiceDetails.jsx';
import NominalInvoiceDetail from './pages/NominalInvoiceDetail.jsx';
import InvoiceCovers from './pages/InvoiceCovers.jsx';
import InvoiceCoverBefore2025 from './pages/InvoiceCoverBefore2025.jsx';
import Nei from './pages/Nei.jsx';
import Payments from './pages/Payments.jsx';
import GrossProfit1 from './pages/GrossProfit1.jsx';
import GrossProfit2 from './pages/GrossProfit2.jsx';
import GrossProfitBefore2025 from './pages/GrossProfitBefore2025.jsx';
import Rekening from './pages/Rekening.jsx';
import Hutang from './pages/Hutang.jsx';
import M from './pages/M.jsx';
import NeiU from './pages/NeiU.jsx';
import NeiP from './pages/NeiP.jsx';
import BungaHutang from './pages/BungaHutang.jsx';
import BayarHutang from './pages/BayarHutang.jsx';
import BM from './pages/BM.jsx';
import BayarBungaHutang from './pages/BayarBungaHutang.jsx';
import SaldoBank from './pages/SaldoBank.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardOrRedirect />} />

        {/* Setiap halaman di-guard berdasarkan matrix permission (canView).
            Role yang tidak punya view → redirect ke Dashboard. */}
        <Route path="invoices"        element={<ProtectedRoute page="invoices"><Invoices /></ProtectedRoute>} />
        <Route path="purchase-orders" element={<ProtectedRoute page="purchase-orders"><PurchaseOrders /></ProtectedRoute>} />
        <Route path="expenses"        element={<ProtectedRoute page="expenses"><Expenses /></ProtectedRoute>} />
        <Route path="expenses-before-2025" element={<ProtectedRoute page="expenses-before-2025"><ExpensesBefore2025 /></ProtectedRoute>} />
        <Route path="db-before-2025" element={<ProtectedRoute page="db-before-2025"><DBBefore2025 /></ProtectedRoute>} />
        <Route path="db" element={<ProtectedRoute page="db"><DB /></ProtectedRoute>} />
        <Route path="mg"              element={<ProtectedRoute page="mg"><Mg /></ProtectedRoute>} />
        <Route path="invoice-details" element={<ProtectedRoute page="invoice-details"><InvoiceDetails /></ProtectedRoute>} />
        <Route path="nominal-invoice-detail" element={<ProtectedRoute page="nominal-invoice-detail"><NominalInvoiceDetail /></ProtectedRoute>} />
        <Route path="invoice-covers"  element={<ProtectedRoute page="invoice-covers"><InvoiceCovers /></ProtectedRoute>} />
        <Route path="invoice-cover-before-2025" element={<ProtectedRoute page="invoice-cover-before-2025"><InvoiceCoverBefore2025 /></ProtectedRoute>} />
        <Route path="nei"             element={<ProtectedRoute page="nei"><Nei /></ProtectedRoute>} />
        <Route path="payments"        element={<ProtectedRoute page="payments"><Payments /></ProtectedRoute>} />
        <Route path="gross-profit-1"  element={<ProtectedRoute page="gross-profit-1"><GrossProfit1 /></ProtectedRoute>} />
        <Route path="gross-profit-2"  element={<ProtectedRoute page="gross-profit-2"><GrossProfit2 /></ProtectedRoute>} />
        <Route path="gross-profit-before-2025" element={<ProtectedRoute page="gross-profit-before-2025"><GrossProfitBefore2025 /></ProtectedRoute>} />
        <Route path="rekening"           element={<ProtectedRoute page="rekening"><Rekening /></ProtectedRoute>} />
        <Route path="hutang"             element={<ProtectedRoute page="hutang"><Hutang /></ProtectedRoute>} />
        <Route path="m"                  element={<ProtectedRoute page="m"><M /></ProtectedRoute>} />
        <Route path="neiu"               element={<ProtectedRoute page="neiu"><NeiU /></ProtectedRoute>} />
        <Route path="neip"               element={<ProtectedRoute page="neip"><NeiP /></ProtectedRoute>} />
        <Route path="bunga-hutang"       element={<ProtectedRoute page="bunga-hutang"><BungaHutang /></ProtectedRoute>} />
        <Route path="bayar-hutang"       element={<ProtectedRoute page="bayar-hutang"><BayarHutang /></ProtectedRoute>} />
        <Route path="bm"                 element={<ProtectedRoute page="bm"><BM /></ProtectedRoute>} />
        <Route path="bayar-bunga-hutang" element={<ProtectedRoute page="bayar-bunga-hutang"><BayarBungaHutang /></ProtectedRoute>} />
        <Route path="saldo-bank"         element={<ProtectedRoute page="saldo-bank"><SaldoBank /></ProtectedRoute>} />

        {/* Akun: hanya admin & superadmin */}
        <Route
          path="users"
          element={
            <ProtectedRoute roles={['admin', 'superadmin']}>
              <Users />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Index route: kalau role boleh lihat Dashboard → tampilkan Dashboard.
// Kalau tidak (mis. EXP-INV) → arahkan ke halaman pertama yang bisa diakses,
// supaya tidak terjebak di halaman yang tak berhak dilihat.
function DashboardOrRedirect() {
  const { user } = useAuth();
  if (user && !canView(user.role, PAGES.DASHBOARD)) {
    const dest = firstAccessiblePath(user.role);
    if (dest !== '/') return <Navigate to={dest} replace />;
  }
  return <Dashboard />;
}
