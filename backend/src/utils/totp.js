// ============================================================
// totp.js — implementasi TOTP (RFC 6238) + Base32, pakai crypto bawaan.
//
// Tidak perlu library eksternal. Kompatibel dengan Google Authenticator,
// Authy, Microsoft Authenticator, dll (SHA1, 6 digit, period 30 detik).
// ============================================================
import crypto from 'crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// --- Base32 encode (untuk secret yang ditampilkan ke user) ---
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

// --- Base32 decode (untuk verifikasi token) ---
export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const output = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue; // skip karakter invalid
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

// --- Generate secret baru (20 byte = 160 bit, standar) ---
export function generateSecret() {
  const buf = crypto.randomBytes(20);
  return base32Encode(buf);
}

// --- Hitung TOTP untuk counter tertentu ---
function hotp(secretBuffer, counter) {
  const buf = Buffer.alloc(8);
  // counter sebagai 64-bit big-endian
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuffer).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return (code % 1_000_000).toString().padStart(6, '0');
}

// --- Verifikasi token TOTP ---
// window=1 → toleransi ±1 step (30 detik) untuk kompensasi clock drift.
export function verifyToken(token, secretBase32, window = 1) {
  if (!token || !secretBase32) return false;
  const cleanToken = String(token).replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const secretBuffer = base32Decode(secretBase32);
  const step = 30;
  const counter = Math.floor(Date.now() / 1000 / step);

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const candidate = hotp(secretBuffer, counter + errorWindow);
    // bandingkan secara timing-safe
    if (
      candidate.length === cleanToken.length &&
      crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(cleanToken))
    ) {
      return true;
    }
  }
  return false;
}

// --- Buat otpauth:// URI untuk QR code ---
export function buildOtpauthUri(secretBase32, accountName, issuer = 'FIKOM') {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
