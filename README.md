# FIKOM

Aplikasi finance untuk manajemen invoice, purchase order, & expense.

## Stack
- **Backend:** Fastify + PostgreSQL (`pg`) + JWT + bcrypt
- **Frontend:** React + Vite + TailwindCSS + React Router
- **Database:** PostgreSQL

## Struktur Folder
```
fikom/
├── backend/         # API server (Fastify)
└── frontend/        # React SPA (Vite)
```

## Setup Pertama Kali

### 1. Database
Pastikan PostgreSQL sudah jalan, lalu buat database:
```bash
createdb fikom
```

### 2. Backend
```bash
cd backend
cp .env.example .env
# Edit .env. Bagian utama:
#   DATABASE_HOST=localhost
#   DATABASE_PORT=5432
#   DATABASE_NAME=fikom
#   DATABASE_USERNAME=postgres
#   DATABASE_PASSWORD=postgres
#   JWT_SECRET=...string-acak-panjang...
#   SUPERADMIN_PASSWORD=...

npm install
npm run migrate            # buat semua tabel
npm run seed:superadmin    # buat akun superadmin (1x saja)
npm run dev                # jalan di http://localhost:4000
```

> **PENTING:** Superadmin HANYA bisa dibuat lewat `npm run seed:superadmin`.
> Script ini menolak insert jika sudah ada superadmin di DB.
> Endpoint API tidak pernah bisa membuat role `superadmin`.

> **Tip:** Setelah superadmin dibuat, kosongkan `SUPERADMIN_PASSWORD` di `.env`
> agar kredensial tidak nyangkut di file.

### 3. Frontend
```bash
cd frontend
cp .env.example .env
npm install
npm run dev                # jalan di http://localhost:5173
```

Login pakai username/password superadmin yang sudah diseed.

## Konfigurasi Database

### Untuk PostgreSQL lokal
Pakai field terpisah di `.env`:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=fikom
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_SSL=false
```

### Untuk Cloud Database (Supabase, Neon, AWS RDS, dll)
Set `DATABASE_SSL=true`. Field terpisah tetap sama:
```
DATABASE_HOST=xxx.supabase.co
DATABASE_PORT=5432
DATABASE_NAME=postgres
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=secret
DATABASE_SSL=true
```

### Untuk Heroku / Railway / Render
Platform tersebut inject `DATABASE_URL` otomatis. Kalau `DATABASE_URL`
di-set, field terpisah di atas diabaikan dan URL yang dipakai.

## Role & Permission

| Aksi                                 | Superadmin | Admin | User |
|--------------------------------------|:----------:|:-----:|:----:|
| Login                                | ✅         | ✅    | ✅   |
| Lihat user list                      | ✅         | ✅¹   | ❌   |
| Buat akun role `user`                | ✅         | ✅    | ❌   |
| Buat akun role `admin`               | ✅         | ❌    | ❌   |
| Buat akun role `superadmin`          | ❌²        | ❌    | ❌   |
| Change password user lain            | ✅         | ✅¹   | ❌   |
| Aktif/non-aktifkan akun              | ✅¹        | ✅¹   | ❌   |
| Akun-nya bisa di-deactivate          | ❌         | ✅    | ✅   |
| Akses menu Invoice / PO / Expenses   | ✅         | ✅    | ✅   |
| Tambah/Edit Expense                  | ✅         | ✅    | ✅   |

¹ Admin hanya bisa kelola akun role `user`. Superadmin tidak bisa kelola dirinya sendiri (proteksi self-lockout).
² Hanya bisa via script seed, dijamin maks 1 oleh partial unique index PostgreSQL.

## Modul

- **Akun** — CRUD user dengan role-based access (admin/superadmin only).
- **Invoice** — Input nomor invoice (1 field), dijadikan rujukan untuk expense.
- **Purchase Order** — Input nomor PO (1 field), dijadikan rujukan untuk expense.
- **Expense** — Form lengkap dengan multi-select PO/invoice, cascading dropdown
  client/non-client, dan kategori berjenjang. Semua user bisa lihat & edit.

Semua tanggal dibuat ditampilkan dalam **WIB (UTC+7)**.
