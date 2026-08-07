import { useEffect, useState, useCallback } from 'react';
import api, { getErrorMessage } from '../lib/api.js';
import { useAuth } from '../contexts/AuthContext.jsx';
import Modal from '../components/Modal.jsx';
import { ROLE_LABELS, ASSIGNABLE_ROLES } from '../lib/permissions.js';

const roleLabel = ROLE_LABELS;
const roleBadge = {
  superadmin:          'bg-purple-100 text-purple-700',
  admin:               'bg-blue-100 text-blue-700',
  user:                'bg-slate-100 text-slate-700',
  'All-EX-GP-ED-INV':  'bg-amber-100 text-amber-700',
  'EXP-INV':           'bg-teal-100 text-teal-700',
  'All-View':          'bg-slate-100 text-slate-500',
};

// Penjelasan singkat tiap role untuk membantu admin memilih.
const ROLE_DESCRIPTIONS = {
  admin:               'Akses penuh semua halaman (kecuali kelola superadmin).',
  user:               'Input semua halaman; tidak bisa edit/hapus Invoice/Detail/Cover; tidak akses Gross Profit.',
  'All-EX-GP-ED-INV':  'Input & edit semua halaman KECUALI tidak bisa edit Invoice/Detail/Cover & tidak akses Gross Profit.',
  'EXP-INV':           'Hanya akses Expenses + Invoice/Detail/Cover. Edit cuma di Expenses.',
  'All-View':          'Viewer semua halaman (kecuali Gross Profit). Tidak bisa input/edit/hapus.',
};

export default function Users() {
  const { user: me } = useAuth();
  const isSuperadmin = me?.role === 'superadmin';
  // Admin & superadmin sama-sama bisa pilih role saat create (admin/user).
  // Hanya superadmin yang punya superpower lain (kelola sesama admin tanpa batas).
  const canChooseRole = me?.role === 'admin' || me?.role === 'superadmin';

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState(null); // user yg sedang di-edit profil-nya
  const [pwUser, setPwUser] = useState(null); // user yg sedang di-edit password-nya

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/users');
      setUsers(data.users);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleToggleStatus = async (u) => {
    const action = u.is_active ? 'non-aktifkan' : 'aktifkan';
    if (!confirm(`Yakin ingin ${action} akun "${u.username}"?`)) return;
    try {
      const { data } = await api.patch(`/users/${u.id}/status`, { is_active: !u.is_active });
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, ...data.user } : x)));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleReset2fa = async (u) => {
    if (!confirm(`Reset (matikan) 2FA untuk akun "${u.username}"?\n\nUser harus mengaktifkan ulang 2FA sendiri kalau mau memakainya lagi. Berguna jika user kehilangan akses ke aplikasi authenticator.`)) return;
    try {
      await api.patch(`/users/${u.id}/reset-2fa`);
      setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, twofa_enabled: false } : x)));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  const handleDelete = async (u) => {
    if (!confirm(`Yakin ingin MENGHAPUS akun "${u.username}" (${u.full_name})?\n\nTindakan ini permanen dan tidak bisa dibatalkan.\n\nCatatan: kalau akun ini sudah pernah membuat data (invoice, expense, dll), penghapusan akan ditolak demi menjaga riwayat. Dalam kasus itu, nonaktifkan saja akunnya.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (err) {
      alert(getErrorMessage(err));
    }
  };

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Akun</h1>
          <p className="text-slate-500 mt-1 text-sm">
            Kelola akun pengguna admin dan user di sistem.
          </p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          + Tambah Akun
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nama Lengkap</th>
              <th className="text-left px-4 py-3 font-medium">Username</th>
              <th className="text-left px-4 py-3 font-medium">Email</th>
              <th className="text-left px-4 py-3 font-medium">Role</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-left px-4 py-3 font-medium">2FA</th>
              <th className="text-right px-4 py-3 font-medium">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Memuat…</td></tr>
            )}
            {!loading && users.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Belum ada akun.</td></tr>
            )}
            {!loading && users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.full_name}</td>
                <td className="px-4 py-3 text-slate-700">{u.username}</td>
                <td className="px-4 py-3 text-slate-500">{u.email || <span className="text-slate-300">—</span>}</td>
                <td className="px-4 py-3">
                  <span className={`badge ${roleBadge[u.role]}`}>{roleLabel[u.role]}</span>
                </td>
                <td className="px-4 py-3">
                  {u.is_active
                    ? <span className="badge bg-emerald-100 text-emerald-700">Aktif</span>
                    : <span className="badge bg-slate-200 text-slate-600">Non-aktif</span>}
                </td>
                <td className="px-4 py-3">
                  {u.twofa_enabled
                    ? <span className="badge bg-emerald-100 text-emerald-700">Aktif</span>
                    : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => setEditUser(u)} className="text-brand-700 hover:text-brand-800 font-medium mr-3">
                    Edit
                  </button>
                  <button onClick={() => setPwUser(u)} className="text-brand-700 hover:text-brand-800 font-medium mr-3">
                    Ubah Password
                  </button>
                  {u.twofa_enabled && (
                    <button onClick={() => handleReset2fa(u)} className="text-amber-700 hover:text-amber-800 font-medium mr-3">
                      Reset 2FA
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleStatus(u)}
                    className={u.is_active ? 'text-red-600 hover:text-red-700 font-medium' : 'text-emerald-700 hover:text-emerald-800 font-medium'}
                  >
                    {u.is_active ? 'Non-aktifkan' : 'Aktifkan'}
                  </button>
                  {u.id !== me?.id && u.role !== 'superadmin' && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-red-600 hover:text-red-700 font-medium ml-3"
                    >
                      Hapus
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CreateUserModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { setCreateOpen(false); loadUsers(); }}
        canChooseRole={canChooseRole}
      />
      <EditUserModal
        user={editUser}
        onClose={() => setEditUser(null)}
        onSaved={(updated) => {
          setUsers((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)));
          setEditUser(null);
        }}
      />
      <ChangePasswordModal
        user={pwUser}
        onClose={() => setPwUser(null)}
        onDone={() => setPwUser(null)}
      />
    </div>
  );
}

// =====================================================
// Modal: Create User
// =====================================================
function CreateUserModal({ open, onClose, onCreated, canChooseRole }) {
  const empty = { full_name: '', username: '', password: '', email: '', role: 'user' };
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setForm(empty); setError(''); } /* eslint-disable-line */ }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        password: form.password,
        email: form.email.trim() || undefined,
      };
      if (canChooseRole) payload.role = form.role;
      await api.post('/users', payload);
      onCreated();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Tambah Akun Baru">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Nama Lengkap <span className="text-red-500">*</span></label>
          <input type="text" required className="input"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div>
          <label className="label">Username <span className="text-red-500">*</span></label>
          <input type="text" required minLength={3} className="input"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })} />
          <p className="text-xs text-slate-500 mt-1">Min. 3 karakter. Huruf, angka, titik, dash, underscore.</p>
        </div>
        <div>
          <label className="label">Password <span className="text-red-500">*</span></label>
          <input type="password" required minLength={8} className="input"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p className="text-xs text-slate-500 mt-1">Min. 8 karakter.</p>
        </div>
        <div>
          <label className="label">Email <span className="text-slate-400 font-normal">(opsional)</span></label>
          <input type="email" className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>

        {canChooseRole && (
          <div>
            <label className="label">Role</label>
            <select className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">{ROLE_DESCRIPTIONS[form.role] || ''}</p>
          </div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// Modal: Edit User (nama lengkap, username, email)
// =====================================================
function EditUserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState({ full_name: '', username: '', email: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        full_name: user.full_name || '',
        username: user.username || '',
        email: user.email || '',
      });
      setError('');
    }
  }, [user]);

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        username: form.username.trim(),
        email: form.email.trim() || undefined,
      };
      const { data } = await api.patch(`/users/${user.id}`, payload);
      onSaved(data.user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title={`Edit Akun — ${user.username}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Nama Lengkap <span className="text-red-500">*</span></label>
          <input
            type="text"
            required
            className="input"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Username <span className="text-red-500">*</span></label>
          <input
            type="text"
            required
            minLength={3}
            className="input"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
          <p className="text-xs text-slate-500 mt-1">Min. 3 karakter. Huruf, angka, titik, dash, underscore.</p>
        </div>
        <div>
          <label className="label">Email <span className="text-slate-400 font-normal">(opsional)</span></label>
          <input
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Untuk ubah password gunakan tombol <span className="font-medium">Ubah Password</span>.
          Untuk aktif/non-aktifkan akun gunakan tombol di kolom Status.
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// =====================================================
// Modal: Change Password
// =====================================================
function ChangePasswordModal({ user, onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (user) { setPw(''); setError(''); } }, [user]);

  if (!user) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.patch(`/users/${user.id}/password`, { password: pw });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={!!user} onClose={onClose} title={`Ubah Password — ${user.username}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Password Baru</label>
          <input type="password" required minLength={8} className="input"
            value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <p className="text-xs text-slate-500 mt-1">Min. 8 karakter.</p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
