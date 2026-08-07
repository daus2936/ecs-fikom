// ============================================================
// permissions.js — matrix izin terpusat untuk semua role.
//
// Dipakai oleh route guards (lewat helper requirePermission) dan
// juga di-mirror di frontend (src/lib/permissions.js) untuk
// menampilkan/menyembunyikan tombol & menu.
//
// PENTING: frontend cuma untuk UX (sembunyikan tombol). Enforcement
// sesungguhnya ada di backend lewat modul ini.
// ============================================================

export const ROLES = [
  'superadmin',
  'admin',
  'user',
  'All-EX-GP-ED-INV',
  'EXP-INV',
  'All-View',
];

// Role yang boleh dibuat/di-assign dari dashboard (superadmin TIDAK termasuk).
export const ASSIGNABLE_ROLES = [
  'admin',
  'user',
  'All-EX-GP-ED-INV',
  'EXP-INV',
  'All-View',
];

// Label tampilan
export const ROLE_LABELS = {
  superadmin:          'Super Admin',
  admin:               'Administrator',
  user:                'User',
  'All-EX-GP-ED-INV':  'All kecuali GP & Edit Invoice',
  'EXP-INV':           'Expense & Invoice',
  'All-View':          'Viewer (semua, read-only)',
};

// ------------------------------------------------------------
// Daftar "page key" — identitas modul. Dipakai sebagai kunci matrix.
// ------------------------------------------------------------
export const PAGES = {
  DASHBOARD:        'dashboard',
  INVOICES:         'invoices',          // Nomor Invoice
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

// Capability: 'view' | 'create' | 'edit' | 'delete'

// Halaman "transaksi umum" (bukan invoice, bukan GP, bukan users).
const GENERAL_TXN_PAGES = [
  PAGES.PURCHASE_ORDERS, PAGES.EXPENSES, PAGES.PAYMENTS,
  PAGES.REKENING, PAGES.HUTANG, PAGES.BUNGA_HUTANG, PAGES.BAYAR_HUTANG,
  PAGES.BAYAR_BUNGA, PAGES.SALDO_BANK,
  PAGES.M, PAGES.BM,
];
const INVOICE_PAGES = [PAGES.INVOICES, PAGES.INVOICE_DETAILS, PAGES.INVOICE_COVERS];
const GP_PAGES = [PAGES.GROSS_PROFIT_1, PAGES.GROSS_PROFIT_2];
// Halaman yang HANYA boleh diakses admin/superadmin (selain mereka: ditolak total).
const ADMIN_ONLY_PAGES = [PAGES.NEI, PAGES.NEIU, PAGES.NEIP, PAGES.MG, PAGES.EXPENSES_BEFORE_2025, PAGES.INVOICE_COVER_BEFORE_2025, PAGES.GROSS_PROFIT_BEFORE_2025, PAGES.DB_BEFORE_2025, PAGES.DB];

// ------------------------------------------------------------
// can(role, page, capability) → boolean
// ------------------------------------------------------------
export function can(role, page, capability) {
  // Superadmin & admin: full akses ke semua halaman.
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
    // --------------------------------------------------------
    // user (existing): input semua halaman (kecuali users & GP),
    // edit di transaksi umum + payment; TIDAK edit/delete invoice pages;
    // TIDAK akses GP & users. Delete: admin-only (false di sini).
    // --------------------------------------------------------
    case 'user': {
      if (page === PAGES.USERS) return false;
      if (GP_PAGES.includes(page)) return false;
      if (page === PAGES.DASHBOARD) return capability === 'view';
      if (INVOICE_PAGES.includes(page)) {
        return capability === 'view' || capability === 'create';
      }
      if (GENERAL_TXN_PAGES.includes(page)) {
        return capability === 'view' || capability === 'create' || capability === 'edit';
      }
      return false;
    }

    // --------------------------------------------------------
    // All-EX-GP-ED-INV ("All kecuali GP & Edit Invoice"):
    //   - Akses semua halaman KECUALI Gross Profit 1/2 & Users.
    //   - view + create di semua halaman yang boleh diakses.
    //   - edit HANYA di: Expenses, Invoices, Purchase Orders,
    //     Invoice Details, Invoice Covers.
    //   - delete: admin-only.
    // --------------------------------------------------------
    case 'All-EX-GP-ED-INV': {
      if (page === PAGES.USERS) return false;
      if (GP_PAGES.includes(page)) return false;
      if (page === PAGES.DASHBOARD) return capability === 'view';

      // Halaman yang boleh di-edit oleh role ini.
      const EDITABLE = [
        PAGES.EXPENSES, PAGES.INVOICES, PAGES.PURCHASE_ORDERS,
        PAGES.INVOICE_DETAILS, PAGES.INVOICE_COVERS,
      ];
      if (capability === 'view' || capability === 'create') return true;
      if (capability === 'edit') return EDITABLE.includes(page);
      return false; // delete → admin-only
    }

    // --------------------------------------------------------
    // EXP-INV ("Expense & Invoice"):
    //   - Akses: Dashboard (view saja), serta Expenses, Purchase Orders,
    //     Invoices, Invoice Details, Invoice Covers.
    //   - view + create + edit di kelima halaman transaksi itu.
    //   - delete: admin-only.
    //   - Halaman lain: tidak akses.
    // --------------------------------------------------------
    case 'EXP-INV': {
      if (page === PAGES.DASHBOARD) return capability === 'view';
      const ALLOWED = [
        PAGES.EXPENSES, PAGES.PURCHASE_ORDERS, PAGES.INVOICES,
        PAGES.INVOICE_DETAILS, PAGES.INVOICE_COVERS,
      ];
      if (ALLOWED.includes(page)) {
        return capability === 'view' || capability === 'create' || capability === 'edit';
      }
      return false; // semua halaman lain ditolak
    }

    // --------------------------------------------------------
    // All-View: viewer semua halaman KECUALI GP & Users.
    // Tidak ada create/edit/delete.
    // --------------------------------------------------------
    case 'All-View': {
      if (page === PAGES.USERS) return false;
      if (GP_PAGES.includes(page)) return false;
      return capability === 'view';
    }

    default:
      return false;
  }
}

// Shortcut helpers
export const canView   = (role, page) => can(role, page, 'view');
export const canCreate = (role, page) => can(role, page, 'create');
export const canEdit   = (role, page) => can(role, page, 'edit');
export const canDelete = (role, page) => can(role, page, 'delete');
