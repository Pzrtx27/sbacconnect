/* ============================================================
   SHA-256
   หมายเหตุสำคัญ: crypto.subtle มีให้ใช้เฉพาะใน "secure context"
   คือ https:// หรือ http://localhost เท่านั้น
   ตอนเทสจากมือถือผ่าน LAN (เช่น http://192.168.1.5:5173) crypto.subtle
   จะเป็น undefined -> โยน TypeError -> ถูก catch ใน login() กลืนไป
   แล้วขึ้นข้อความ "ไม่สามารถเชื่อมต่อระบบได้" ทั้งที่รหัสถูกต้อง
   จึงใส่ fallback เป็น SHA-256 แบบ pure JS ไว้ให้เทสได้ตามปกติ
   ============================================================ */

/** true เมื่อเบราว์เซอร์ให้ใช้ Web Crypto ได้ (https หรือ localhost) */
export function hasWebCrypto() {
  return typeof globalThis.crypto !== 'undefined' && !!globalThis.crypto.subtle;
}

/* ---------- SHA-256 แบบ pure JS (ใช้เมื่อไม่มี crypto.subtle) ---------- */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function sha256Fallback(bytes) {
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bitLen = bytes.length * 8;
  const withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) << 6);
  withPad.set(bytes);
  withPad[bytes.length] = 0x80;
  const dv = new DataView(withPad.buffer);
  dv.setUint32(withPad.length - 4, bitLen >>> 0, false);
  dv.setUint32(withPad.length - 8, Math.floor(bitLen / 4294967296), false);

  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  for (let off = 0; off < withPad.length; off += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e;
      e = (d + t1) >>> 0;
      d = c; c = b; b = a;
      a = (t1 + t2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

// Native browser implementation of SHA-256 (พร้อม fallback สำหรับ http:// LAN)
export async function sha256(message) {
  if (!message) return '';
  const bytes = new TextEncoder().encode(String(message).trim());

  if (hasWebCrypto()) {
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  console.warn(
    '[crypto] ไม่มี crypto.subtle (หน้านี้ไม่ใช่ secure context) ' +
      'กำลังใช้ SHA-256 แบบ JS แทน — ใช้ได้สำหรับการทดสอบผ่าน LAN ' +
      'แต่ควรเปิดผ่าน https:// หรือ localhost เมื่อใช้งานจริง'
  );
  return sha256Fallback(bytes);
}

// Derive a cryptographic key from a passcode string using PBKDF2
async function getKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return globalThis.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: enc.encode("sbac-salt-secure-99"),
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// AES-256 Symmetric Encryption in browser (returns Base64 string)
export async function encryptAES(text, secret) {
  if (!text) return '';
  if (!secret) throw new Error("Passphrase is required for encryption");
  try {
    const key = await getKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(String(text).trim());
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoded
    );
    const encryptedArr = new Uint8Array(encrypted);
    const buf = new Uint8Array(iv.length + encryptedArr.length);
    buf.set(iv);
    buf.set(encryptedArr, iv.length);
    return btoa(String.fromCharCode(...buf));
  } catch (e) {
    console.error("Encryption failed:", e);
    return null;
  }
}

// AES-256 Symmetric Decryption (takes Base64 string and secret)
export async function decryptAES(ciphertext, secret) {
  if (!ciphertext) return '';
  if (!secret) throw new Error("Passphrase is required for decryption");
  try {
    const key = await getKey(secret);
    const binary = atob(ciphertext);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      buf[i] = binary.charCodeAt(i);
    }
    const iv = buf.slice(0, 12);
    const data = buf.slice(12);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      data
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error("Decryption failed:", e);
    return null;
  }
}
