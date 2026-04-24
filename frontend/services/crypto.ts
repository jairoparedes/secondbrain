/**
 * crypto.ts — Capa de cifrado zero-knowledge del cliente (Fase 2).
 *
 * Arquitectura de claves (ver docs/SECURITY.md):
 *
 *    password (solo en RAM del cliente)
 *       │
 *       ▼  Argon2id(password, kdf_salt)   [hash-wasm, WASM]
 *    KEK (Key Encryption Key)  ─┐
 *                               │ wrap / unwrap
 *    master_key (32 B random) ──┘   ← una por usuario
 *       │
 *       ▼  wrap con master_key
 *    note_key (32 B random)         ← una por nota
 *       │
 *       ▼  encrypt AES-256-GCM
 *    ciphertext(title) + ciphertext(content)
 *
 * Formato de cada blob que viaja al servidor:
 *   base64( IV(12B) || AES-GCM_output(ciphertext || auth_tag(16B)) )
 * El blob es auto-contenido: no requiere un campo iv separado en la tabla.
 */

import { argon2id } from 'hash-wasm';

export const ENC_VERSION = 1;
const IV_LEN = 12;             // GCM recomendado
const KEY_LEN_BITS = 256;
const VERIFIER_MAGIC = 'sb-v1';

// Parámetros Argon2id para la derivación de la KEK.
// Siguen OWASP 2024 para apps web (~500ms en CPU de escritorio).
export const KDF_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536, // 64 MiB
  hashLength: 32,
} as const;

// ---------- Utilidades base ----------

export const b64 = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes =
      buf instanceof Uint8Array ? buf : new Uint8Array(buf as ArrayBuffer);
    let s = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.byteLength; i += chunk) {
      s += String.fromCharCode.apply(
        null,
        Array.from(bytes.subarray(i, i + chunk)),
      );
    }
    return btoa(s);
  },
  decode(str: string): Uint8Array {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

// ---------- Argon2id: deriva la KEK desde password + salt ----------

/**
 * Deriva la Key Encryption Key (KEK) a partir de la password y un salt
 * público por usuario. La KEK nunca sale del proceso: se usa solo para
 * wrap/unwrap de la master_key del usuario.
 */
export async function deriveKek(
  password: string,
  kdfSaltB64: string,
): Promise<CryptoKey> {
  const salt = b64.decode(kdfSaltB64);
  const raw = await argon2id({
    password,
    salt,
    ...KDF_PARAMS,
    outputType: 'binary',
  });

  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    false, // no extractable: la KEK vive solo dentro de WebCrypto
    ['encrypt', 'decrypt'],
  );
}

// ---------- Generación de claves ----------

/**
 * Genera una clave AES-256-GCM aleatoria (usada como master_key o note_key).
 * Es extractable=true para poder exportarla y envolverla con otra clave.
 */
export async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
}

// ---------- Wrap / unwrap de claves ----------

/**
 * Envuelve una clave AES (exportable) usando otra clave AES-GCM como
 * wrapping key. El formato devuelto es un blob base64 auto-contenido
 * (iv || ciphertext+tag) con la clave raw dentro.
 */
async function wrapRawKey(
  target: CryptoKey,
  wrappingKey: CryptoKey,
): Promise<string> {
  const raw = await crypto.subtle.exportKey('raw', target);
  const iv = randomBytes(IV_LEN);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, raw),
  );
  return b64.encode(concat(iv, ct));
}

/**
 * Desenvuelve un blob producido por wrapRawKey y devuelve la clave
 * importada como CryptoKey AES-GCM. `extractable` controla si la clave
 * resultante puede a su vez ser exportada (necesario para la master_key,
 * que tiene que poder envolver note_keys; no necesario para una note_key).
 */
async function unwrapRawKey(
  blobB64: string,
  wrappingKey: CryptoKey,
  extractable: boolean,
): Promise<CryptoKey> {
  const blob = b64.decode(blobB64);
  if (blob.length < IV_LEN + 1) {
    throw new Error('Blob cifrado demasiado corto.');
  }
  const iv = blob.subarray(0, IV_LEN);
  const ct = blob.subarray(IV_LEN);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    ct,
  );
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    extractable,
    ['encrypt', 'decrypt'],
  );
}

export function wrapMasterKey(master: CryptoKey, kek: CryptoKey) {
  return wrapRawKey(master, kek);
}
export function unwrapMasterKey(blobB64: string, kek: CryptoKey) {
  return unwrapRawKey(blobB64, kek, /* extractable */ true);
}
export function wrapNoteKey(note: CryptoKey, master: CryptoKey) {
  return wrapRawKey(note, master);
}
export function unwrapNoteKey(blobB64: string, master: CryptoKey) {
  return unwrapRawKey(blobB64, master, /* extractable */ false);
}

// ---------- Cifrado/descifrado de strings ----------

export async function encryptString(
  plaintext: string,
  key: CryptoKey,
): Promise<string> {
  const iv = randomBytes(IV_LEN);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  return b64.encode(concat(iv, ct));
}

export async function decryptString(
  blobB64: string,
  key: CryptoKey,
): Promise<string> {
  const blob = b64.decode(blobB64);
  if (blob.length < IV_LEN + 1) {
    throw new Error('Blob cifrado demasiado corto.');
  }
  const iv = blob.subarray(0, IV_LEN);
  const ct = blob.subarray(IV_LEN);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// ---------- Bootstrap de un nuevo usuario ----------

export type EnrollmentBundle = {
  kdf_salt: string;          // base64, 16 bytes random
  master_key_wrapped: string; // base64 blob (iv || ct) con la master_key dentro
};

/**
 * Crea la material criptográfica inicial para un registro nuevo.
 * Devuelve la master_key lista en memoria y los campos que debemos
 * enviar al servidor.
 */
export async function enrollUser(
  password: string,
): Promise<{ masterKey: CryptoKey; bundle: EnrollmentBundle }> {
  const saltBytes = randomBytes(16);
  const kdfSaltB64 = b64.encode(saltBytes);

  const kek = await deriveKek(password, kdfSaltB64);
  const masterKey = await generateAesKey();
  const masterKeyWrapped = await wrapMasterKey(masterKey, kek);

  return {
    masterKey,
    bundle: {
      kdf_salt: kdfSaltB64,
      master_key_wrapped: masterKeyWrapped,
    },
  };
}

/**
 * Dado lo que devolvió el servidor en /auth/login (kdf_salt y
 * master_key_wrapped), deriva la KEK y desenvuelve la master_key.
 * Si la password es incorrecta, unwrap lanza y debemos mostrar error.
 */
export async function unlockMasterKey(
  password: string,
  kdfSaltB64: string,
  masterKeyWrappedB64: string,
): Promise<CryptoKey> {
  const kek = await deriveKek(password, kdfSaltB64);
  try {
    return await unwrapMasterKey(masterKeyWrappedB64, kek);
  } catch {
    // GCM tag inválido ⇒ password errónea.
    throw new Error('No se pudo descifrar la clave maestra con esa contraseña.');
  }
}

// ---------- API alto nivel para notas ----------

export type EncryptedNotePayload = {
  title_ciphertext: string | null;
  content_ciphertext: string;
  note_key_wrapped: string;
  iv: string; // reservado; el IV real va dentro de cada blob
  encryption_version: number;
};

/**
 * Cifra un par (title, content) para una nota nueva. Genera una note_key
 * aleatoria y la envuelve con la master_key.
 */
export async function encryptNote(
  title: string,
  content: string,
  masterKey: CryptoKey,
): Promise<EncryptedNotePayload> {
  const noteKey = await generateAesKey();
  const [titleCt, contentCt, wrapped] = await Promise.all([
    title ? encryptString(title, noteKey) : Promise.resolve(null),
    encryptString(content, noteKey),
    wrapNoteKey(noteKey, masterKey),
  ]);

  return {
    title_ciphertext: titleCt,
    content_ciphertext: contentCt,
    note_key_wrapped: wrapped,
    iv: '',
    encryption_version: ENC_VERSION,
  };
}

/**
 * Re-cifra una nota existente reutilizando su note_key si se puede
 * desenvolver, o generando una nueva si no (equivalente a "rotar la
 * note_key"). En Fase 2 solemos reusar la note_key para no invalidar
 * históricos de auditoría ligados a su id.
 */
export async function reencryptNote(
  title: string,
  content: string,
  existingWrappedNoteKey: string,
  masterKey: CryptoKey,
): Promise<EncryptedNotePayload> {
  let noteKey: CryptoKey;
  try {
    noteKey = await unwrapNoteKey(existingWrappedNoteKey, masterKey);
  } catch {
    noteKey = await generateAesKey();
  }

  const [titleCt, contentCt] = await Promise.all([
    title ? encryptString(title, noteKey) : Promise.resolve(null),
    encryptString(content, noteKey),
  ]);

  return {
    title_ciphertext: titleCt,
    content_ciphertext: contentCt,
    note_key_wrapped: existingWrappedNoteKey,
    iv: '',
    encryption_version: ENC_VERSION,
  };
}

export type DecryptedNote = {
  title: string | null;
  content: string;
};

/**
 * Descifra una nota ya cifrada. Si no se puede (p. ej. porque viene de
 * Fase 1 con texto plano y version=0), el caller tiene que mirar
 * encryption_version antes y usar el texto como plano.
 */
export async function decryptNote(
  titleCtB64: string | null,
  contentCtB64: string,
  wrappedNoteKey: string,
  masterKey: CryptoKey,
): Promise<DecryptedNote> {
  const noteKey = await unwrapNoteKey(wrappedNoteKey, masterKey);
  const [title, content] = await Promise.all([
    titleCtB64 ? decryptString(titleCtB64, noteKey) : Promise.resolve(null),
    decryptString(contentCtB64, noteKey),
  ]);
  return { title, content };
}

// ---------- Rotación de password ----------

/**
 * Calcula lo que hay que enviar a /auth/change-password para rotar la
 * KEK sin tocar la master_key (y por tanto sin re-cifrar notas).
 */
export async function rotatePassword(
  newPassword: string,
  currentMasterKey: CryptoKey,
): Promise<{ new_kdf_salt: string; new_master_key_wrapped: string }> {
  const saltBytes = randomBytes(16);
  const newSaltB64 = b64.encode(saltBytes);
  const newKek = await deriveKek(newPassword, newSaltB64);
  const wrapped = await wrapMasterKey(currentMasterKey, newKek);
  return {
    new_kdf_salt: newSaltB64,
    new_master_key_wrapped: wrapped,
  };
}

// ---------- Verifier auxiliar (futuro: chequeo de integridad) ----------

/**
 * Cifra un pequeño magic string con la master_key para poder verificar
 * rápidamente que el unwrap fue correcto sin depender del auth tag del
 * master_key_wrapped (útil si algún día usamos otra wrappingKey externa).
 * No se usa por ahora — lo dejamos listo para cuando haya recovery keys.
 */
export async function buildVerifier(masterKey: CryptoKey): Promise<string> {
  return encryptString(VERIFIER_MAGIC, masterKey);
}

export async function checkVerifier(
  verifierB64: string,
  masterKey: CryptoKey,
): Promise<boolean> {
  try {
    const pt = await decryptString(verifierB64, masterKey);
    return pt === VERIFIER_MAGIC;
  } catch {
    return false;
  }
}
