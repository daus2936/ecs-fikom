// ============================================================
// permissions.js (frontend) — MIRROR dari backend/src/lib/permissions.js
//
// Dipakai untuk UX: sembunyikan menu/tombol sesuai role.
// Enforcement sesungguhnya tetap di backend.
// Kalau mengubah matrix, ubah DUA file ini bersamaan.
// ============================================================

export const ROLE_LABELS = {
  superadmin:          'Super Admin',
  admin:               'Administrator',
  user:                'User',
  'All-EX-GP-ED-INV':  'All kecuali GP & Edit Invoice',
  'EXP-INV':           'Expense & Invoice',
  'All-View':          'Viewer (semua, read-only)',
};

// Role yang bisa dipilih saat create user (superadmin tidak termasuk)
export const ASSIGNABLE_ROLES = [
  'admin',
  'user',
  'All-EX-GP-ED-INV',
  'EXP-INV',
  'All-View',
];

export const PAGES = {
  DASHBOARD:        'dashboard',
  INVOICES:         'invoices',
  PURCHASE_ORDERS:  'purchase-orders',
  EXPENSES:         'expenses',
  INVOICE_DETAILS:  'invoice-details',
  NOMINAL_INVOICE_DETAIL: 'nominal-invoice-detail',
  INVOICE_COVERS:   'invoice-covers',
  NEI:              'nei',
  NEIU:             'neiu',
  NEIP:             'neip',
  MG:               'mg',
  EXPENSES_BEFORE_2025: 'expenses-before-2025',
  DB_BEFORE_2025: 'db-before-2025',
  DB: 'db',
  INVOICE_COVER_BEFORE_2025: 'invoice-cover-before-2025',
  PAYMENTS:         'payments',
  GROSS_PROFIT_1:   'gross-profit-1',
  GROSS_PROFIT_BEFORE_2025: 'gross-profit-before-2025',
  GROSS_PROFIT_2:   'gross-profit-2',
  REKENING:         'rekening',
  HUTANG:           'hutang',
  M:                'm',
  BM:               'bm',
  BUNGA_HUTANG:     'bunga-hutang',
  BAYAR_HUTANG:     'bayar-hutang',
  BAYAR_BUNGA:      'bayar-bunga-hutang',
  SALDO_BANK:       'saldo-bank',
  USERS:            'users',
};

const GENERAL_TXN_PAGES = [
  PAGES.PURCHASE_ORDERS, PAGES.EXPENSES, PAGES.PAYMENTS,
  PAGES.REKENING, PAGES.HUTANG, PAGES.BUNGA_HUTANG, PAGES.BAYAR_HUTANG,
  PAGES.BAYAR_BUNGA, PAGES.SALDO_BANK,
  PAGES.M, PAGES.BM,
];
const INVOICE_PAGES = [PAGES.INVOICES, PAGES.INVOICE_DETAILS, PAGES.INVOICE_COVERS];
const GP_PAGES = [PAGES.GROSS_PROFIT_1, PAGES.GROSS_PROFIT_2];
// Halaman yang HANYA boleh diakses admin/superadmin.
const ADMIN_ONLY_PAGES = [PAGES.NEI, PAGES.NEIU, PAGES.NEIP, PAGES.MG, PAGES.EXPENSES_BEFORE_2025, PAGES.INVOICE_COVER_BEFORE_2025, PAGES.GROSS_PROFIT_BEFORE_2025, PAGES.DB_BEFORE_2025, PAGES.DB];

export function can(role, page, capability) {
  if (role === 'superadmin' || role === 'admin') return true;
  // Halaman admin-only (mis. Nei): selain admin/superadmin → tolak total.
  if (ADMIN_ONLY_PAGES.includes(page)) return false;

  // Halaman "Nominal Invoice Detail" (read-only): view mengikuti invoice-details.
  if (page === PAGES.NOMINAL_INVOICE_DETAIL) {
    if (capability !== 'view') return false;
    page = PAGES.INVOICE_DETAILS; // delegasikan ke aturan invoice-details di bawah
    capability = 'view';
  }

  switch (role) {
    case 'user': {
      if (page === PAGES.USERS) return false;
      if (GP_PAGES.includes(page)) return false;
      if (page === PAGES.DASHBOARD) return capability === 'view';
      if (INVOICE_PAGES.includes(page)) return capability === 'view' || capability === 'create';
      if (GENERAL_TXN_PAGES.includes(page)) return ['view', 'create', 'edit'].includes(capability);
      return false;
    }
    case 'All-EX-GP-ED-INV': {
      if (page === PAGES.USERS) return false;
      if (GP_PAGES.includes(page)) return false;
      if (page === PAGES.DASHBOARD) return capability === 'view';
      const EDITABLE = [
        PAGES.EXPENSES, PAGES.INVOICES, PAGES.PURCHASE_ORDERS,
        PAGES.INVOICE_DETAILS, PAGES.INVOICE_COVERS,
      ];
      if (capability === 'view' || capability === 'create') return true;
      if (capability === 'edit') return EDITABLE.includes(page);
      return false;
    }
    case 'EXP-INV': {
      if (page === PAGES.DASHBOARD) return capability === 'view';
      const ALLOWED = [
        PAGES.EXPENSES, PAGES.PURCHASE_ORDERS, PAGES.INVOICES,
        PAGES.INVOICE_DETAILS, PAGES.INVOICE_COVERS,
      ];
      if (ALLOWED.includes(page)) return ['view', 'create', 'edit'].includes(capability);
      return false;
    }
    case 'All-View': {
      if (page === PAGES.USERS) return false;
      if (GP_PAGES.includes(page)) return false;
      return capability === 'view';
    }
    default:
      return false;
  }
}

export const canView   = (role, page) => can(role, page, 'view');
export const canCreate = (role, page) => can(role, page, 'create');
export const canEdit   = (role, page) => can(role, page, 'edit');
export const canDelete = (role, page) => can(role, page, 'delete');

// Hanya admin/superadmin. Dipakai mis. untuk fitur Export Excel.
export const isAdmin = (role) => role === 'admin' || role === 'superadmin';

// Urutan halaman (samakan dengan urutan menu di Layout) → dipakai untuk
// menentukan landing page bila role tidak bisa melihat Dashboard.
const PAGE_PATHS = [
  [PAGES.INVOICES, '/invoices'],
  [PAGES.PURCHASE_ORDERS, '/purchase-orders'],
  [PAGES.EXPENSES, '/expenses'],
  [PAGES.INVOICE_DETAILS, '/invoice-details'],
  [PAGES.NOMINAL_INVOICE_DETAIL, '/nominal-invoice-detail'],
  [PAGES.INVOICE_COVERS, '/invoice-covers'],
  [PAGES.NEI, '/nei'],
  [PAGES.NEIU, '/neiu'],
  [PAGES.NEIP, '/neip'],
  [PAGES.MG, '/mg'],
  [PAGES.EXPENSES_BEFORE_2025, '/expenses-before-2025'],
  [PAGES.DB_BEFORE_2025, '/db-before-2025'],
  [PAGES.DB, '/db'],
  [PAGES.INVOICE_COVER_BEFORE_2025, '/invoice-cover-before-2025'],
  [PAGES.GROSS_PROFIT_BEFORE_2025, '/gross-profit-before-2025'],
  [PAGES.PAYMENTS, '/payments'],
  [PAGES.GROSS_PROFIT_1, '/gross-profit-1'],
  [PAGES.GROSS_PROFIT_2, '/gross-profit-2'],
  [PAGES.REKENING, '/rekening'],
  [PAGES.HUTANG, '/hutang'],
  [PAGES.M, '/m'],
  [PAGES.BUNGA_HUTANG, '/bunga-hutang'],
  [PAGES.BAYAR_HUTANG, '/bayar-hutang'],
  [PAGES.BM, '/bm'],
  [PAGES.BAYAR_BUNGA, '/bayar-bunga-hutang'],
  [PAGES.SALDO_BANK, '/saldo-bank'],
  [PAGES.USERS, '/users'],
];

// Path halaman pertama yang bisa diakses role. Dashboard diutamakan kalau boleh.
export function firstAccessiblePath(role) {
  if (canView(role, PAGES.DASHBOARD)) return '/';
  for (const [page, path] of PAGE_PATHS) {
    if (canView(role, page)) return path;
  }
  return '/'; // fallback
}
