// Native browser implementation of SHA-256
export async function sha256(message) {
  if (!message) return '';
  const msgBuffer = new TextEncoder().encode(message.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Derive a cryptographic key from a passcode string using PBKDF2
async function getKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
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
