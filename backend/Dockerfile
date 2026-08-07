# ============================================================
# FIKOM backend — Dockerfile  (FILE BARU, taruh di backend/)
# ============================================================
# Versi untuk ECS: memakai CMD, BUKAN entrypoint migrasi.
# Di ECS, migrasi dijalankan sebagai one-off task terpisah supaya
# beberapa replica tidak balapan menjalankan migrasi bersamaan.
# ============================================================

# ---- Stage 1: install production deps ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# npm ci kalau ada lockfile (reproducible); fallback ke install kalau belum.
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000

# Zona waktu Jakarta supaya timestamp log = WIB.
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Jakarta /etc/localtime && \
    echo "Asia/Jakarta" > /etc/timezone
ENV TZ=Asia/Jakarta

# Jalankan sebagai non-root (keamanan).
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

USER app
EXPOSE 4000

# Catatan: ECS MENGABAIKAN HEALTHCHECK Dockerfile — health check untuk ECS
# dideklarasikan di task definition. Baris ini berguna untuk docker/compose lokal.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
