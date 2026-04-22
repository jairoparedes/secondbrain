/**
 * crypto.ts
 *
 * Capa de cifrado zero-knowledge.
 *
 * NADA de lo que se envíe al backend pasa sin pasar por aquí (en Fase 2+).
 *
 * Algoritmos:
 *  - KDF:   PBKDF2-SHA256 (stub) → sustituir por Argon2id vía argon2-browser en Fase 2.
 *  - Cifra: AES-256-GCM (Web Crypto API nativa).
 */

const ITERATIONS = 600_000; // OWASP 2024 PBKDF2-SHA256 recommendation
const KEY_LEN = 32;         // 256 bits
const IV_LEN = 12;          // GCM recomendado

// ---------- Utilidades ----------
export const b64 = {
  encode: (buf: ArrayBuffer | Uint8Array) => {
    const bytes =
      buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    let s = '';
    for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  },
  decode: (str: string) => {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

// ---------- Derivación de clave ----------
export async function deriveMasterKey(
  password: string,
  saltB64: string,
): Promise<CryptoKey> {
  const salt = b64.decode(saltB64);
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LEN * 8 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey'],
  );
}

export async function generateNoteKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ---------- Cifrado simétrico ----------
export async function encrypt(
  plaintext: string,
  key: CryptoKey,
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { ciphertext: b64.encode(ct), iv: b64.encode(iv) };
}

export async function decrypt(
  ciphertextB64: string,
  ivB64: string,
  key: CryptoKey,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64.decode(ivB64) },
    key,
    b64.decode(ciphertextB64),
  );
  return new TextDecoder().decode(pt);
}

// ---------- Wrapping de note_key con master_key ----------
export async function wrapKey(
  noteKey: CryptoKey,
  masterKey: CryptoKey,
): Promise<{ wrapped: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const wrapped = await crypto.subtle.wrapKey(
    'raw',
    noteKey,
    masterKey,
    { name: 'AES-GCM', iv },
  );
  return { wrapped: b64.encode(wrapped), iv: b64.encode(iv) };
}

export async function unwrapKey(
  wrappedB64: string,
  ivB64: string,
  masterKey: CryptoKey,
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    b64.decode(wrappedB64),
    masterKey,
    { name: 'AES-GCM', iv: b64.decode(ivB64) },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------- Blind index (HMAC-SHA256) ----------
export async function blindIndex(
  token: string,
  masterKey: CryptoKey,
): Promise<string> {
  // Export master key bytes to derive HMAC key
  // NOTA: esto requiere que la masterKey sea 'extractable'. En Fase 2 usaremos una
  // clave HMAC derivada separada para no exponer la master.
  const rawMaster = await crypto.subtle.exportKey('raw', masterKey);
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    rawMaster,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    hmacKey,
    new TextEncoder().encode(token.toLowerCase().trim()),
  );
  return b64.encode(sig);
}
