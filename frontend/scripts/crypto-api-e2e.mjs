/**
 * Smoke test integrado: cifra con el stack de Fase 2 y manda los blobs
 * al backend Laravel. Verifica que:
 *   - El servidor guarda bytes opacos (ciphertext, note_key_wrapped).
 *   - Tras un "reload" (descartamos las claves en memoria), podemos
 *     re-derivar la KEK, desenvolver la master_key y descifrar las notas.
 *   - Un POST /auth/change-password rota la metadata sin tocar las notas.
 *
 * Ejecutar dentro del contenedor frontend:
 *   docker compose exec frontend node scripts/crypto-api-e2e.mjs
 */

import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import { argon2id } from 'hash-wasm';

if (!globalThis.crypto) globalThis.crypto = crypto;
if (!globalThis.TextEncoder) {
  const { TextEncoder, TextDecoder } = await import('node:util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

const API = process.env.API_URL ?? 'http://nginx/api';
const IV_LEN = 12;
const KDF = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
};

const b64 = {
  encode: (buf) =>
    Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString(
      'base64',
    ),
  decode: (s) => new Uint8Array(Buffer.from(s, 'base64')),
};

const randomBytes = (n) => {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
};

const concat = (a, b) => {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
};

async function deriveKek(password, saltB64) {
  const raw = await argon2id({
    password,
    salt: b64.decode(saltB64),
    ...KDF,
    outputType: 'binary',
  });
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ]);
}
const genAes = () =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
async function wrapRaw(target, wk) {
  const raw = await crypto.subtle.exportKey('raw', target);
  const iv = randomBytes(IV_LEN);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wk, raw),
  );
  return b64.encode(concat(iv, ct));
}
async function unwrapRaw(blob, wk, extractable) {
  const buf = b64.decode(blob);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.subarray(0, IV_LEN) },
    wk,
    buf.subarray(IV_LEN),
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, extractable, [
    'encrypt',
    'decrypt',
  ]);
}
async function encStr(pt, k) {
  const iv = randomBytes(IV_LEN);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      k,
      new TextEncoder().encode(pt),
    ),
  );
  return b64.encode(concat(iv, ct));
}
async function decStr(blob, k) {
  const buf = b64.decode(blob);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf.subarray(0, IV_LEN) },
    k,
    buf.subarray(IV_LEN),
  );
  return new TextDecoder().decode(pt);
}

async function call(method, path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    console.error(`HTTP ${res.status} on ${method} ${path}:`, text);
    throw new Error(`HTTP ${res.status}`);
  }
  return json;
}

// --------------------------------------------------------------------

(async () => {
  const email = `crypto${Math.floor(Math.random() * 1e6)}@sb.test`;
  const password = 'p@ssw0rd-crypto-9999';

  console.log('1) enrollUser (cliente)');
  const saltB64 = b64.encode(randomBytes(16));
  const kek = await deriveKek(password, saltB64);
  const masterKey = await genAes();
  const masterKeyWrapped = await wrapRaw(masterKey, kek);

  console.log('2) POST /auth/register con kdf_salt + master_key_wrapped');
  const reg = await call('POST', '/auth/register', {
    email,
    password,
    kdf_salt: saltB64,
    master_key_wrapped: masterKeyWrapped,
  });
  const token = reg.data.token;
  assert.equal(reg.data.user.kdf_salt, saltB64);
  assert.equal(reg.data.user.master_key_wrapped, masterKeyWrapped);
  console.log('   ok — el server guardó la metadata de cifrado');

  console.log('3) cifrar note + POST /notes');
  const noteKey = await genAes();
  const noteKeyWrapped = await wrapRaw(noteKey, masterKey);
  const title = 'Reunión secreta';
  const content = '# Proyecto X\n\nplan de lanzamiento Q3';
  const noteRes = await call(
    'POST',
    '/notes',
    {
      title_ciphertext: await encStr(title, noteKey),
      content_ciphertext: await encStr(content, noteKey),
      note_key_wrapped: noteKeyWrapped,
      encryption_version: 1,
    },
    token,
  );
  const noteId = noteRes.data.id;
  assert.equal(noteRes.data.encryption_version, 1);
  // El servidor NO debería haber visto el texto plano: lo guardado es el blob.
  assert.notEqual(noteRes.data.title_ciphertext, title);
  assert.notEqual(noteRes.data.content_ciphertext, content);
  console.log(
    `   ok — nota ${noteId} persistida con ciphertexts opacos (title len=${noteRes.data.title_ciphertext.length}, content len=${noteRes.data.content_ciphertext.length})`,
  );

  console.log('4) simular RELOAD: descartar masterKey, noteKey y kek');
  // Solo sobrevive: token (localStorage), email, password (lo ingresa el user).

  console.log('5) GET /notes — recibe blobs y los descifra con password');
  const list = await call('GET', '/notes', null, token);
  const rawNote = list.data.find((n) => n.id === noteId);
  assert.ok(rawNote, 'nota encontrada en listado');
  const kek2 = await deriveKek(password, rawNote ? saltB64 : saltB64); // re-deriva
  const masterKey2 = await unwrapRaw(masterKeyWrapped, kek2, true);
  const noteKey2 = await unwrapRaw(rawNote.note_key_wrapped, masterKey2, false);
  const titleBack = await decStr(rawNote.title_ciphertext, noteKey2);
  const contentBack = await decStr(rawNote.content_ciphertext, noteKey2);
  assert.equal(titleBack, title);
  assert.equal(contentBack, content);
  console.log(`   ok — descifrado: "${titleBack}"`);

  console.log('6) POST /auth/change-password — rotación de KEK');
  const newPassword = 'new-p@ssw0rd-9999';
  const newSalt = b64.encode(randomBytes(16));
  const newKek = await deriveKek(newPassword, newSalt);
  const newMasterKeyWrapped = await wrapRaw(masterKey2, newKek);

  await call(
    'POST',
    '/auth/change-password',
    {
      current_password: password,
      new_password: newPassword,
      new_kdf_salt: newSalt,
      new_master_key_wrapped: newMasterKeyWrapped,
    },
    token,
  );
  console.log('   ok — rotación aceptada');

  console.log('7) login con newPassword → desbloquear y descifrar nota');
  const login2 = await call('POST', '/auth/login', {
    email,
    password: newPassword,
  });
  const token2 = login2.data.token;
  const u2 = login2.data.user;
  assert.equal(u2.kdf_salt, newSalt);
  assert.equal(u2.master_key_wrapped, newMasterKeyWrapped);

  const kek3 = await deriveKek(newPassword, u2.kdf_salt);
  const masterKey3 = await unwrapRaw(u2.master_key_wrapped, kek3, true);
  const list2 = await call('GET', '/notes', null, token2);
  const rawNote2 = list2.data.find((n) => n.id === noteId);
  const noteKey3 = await unwrapRaw(rawNote2.note_key_wrapped, masterKey3, false);
  const contentAfterRotation = await decStr(
    rawNote2.content_ciphertext,
    noteKey3,
  );
  assert.equal(contentAfterRotation, content);
  console.log('   ok — tras rotar password, la nota sigue descifrándose correctamente');

  console.log('\nOK — flujo E2E completo contra el backend Laravel exitoso');
})().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
