/**
 * Smoke test del stack de cifrado en Node. Replica el flujo que ejecuta el
 * navegador: enroll → wrap → encrypt note → decrypt → reload simulado → unlock.
 *
 * Se ejecuta dentro del contenedor frontend donde hash-wasm está instalado:
 *    docker compose exec frontend node scripts/crypto-e2e.mjs
 *
 * NOTA: usamos la versión compilada por Next o reimplementamos la lógica
 * aquí mismo importando hash-wasm directamente; así no dependemos de ts-node.
 */

import assert from 'node:assert/strict';
import { webcrypto as crypto } from 'node:crypto';
import { argon2id } from 'hash-wasm';

// Polyfill global si hiciera falta.
if (!globalThis.crypto) globalThis.crypto = crypto;
if (!globalThis.TextEncoder) {
  const { TextEncoder, TextDecoder } = await import('node:util');
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

const IV_LEN = 12;
const KEY_LEN_BITS = 256;
const KDF_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65536,
  hashLength: 32,
};

const b64 = {
  encode(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return Buffer.from(bytes).toString('base64');
  },
  decode(s) {
    return new Uint8Array(Buffer.from(s, 'base64'));
  },
};

function randomBytes(n) {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function concat(a, b) {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

async function deriveKek(password, saltB64) {
  const raw = await argon2id({
    password,
    salt: b64.decode(saltB64),
    ...KDF_PARAMS,
    outputType: 'binary',
  });
  return crypto.subtle.importKey(
    'raw',
    raw,
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function generateAesKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: KEY_LEN_BITS },
    true,
    ['encrypt', 'decrypt'],
  );
}

async function wrapRawKey(target, wrappingKey) {
  const raw = await crypto.subtle.exportKey('raw', target);
  const iv = randomBytes(IV_LEN);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, raw),
  );
  return b64.encode(concat(iv, ct));
}

async function unwrapRawKey(blobB64, wrappingKey, extractable) {
  const blob = b64.decode(blobB64);
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

async function encryptString(plaintext, key) {
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

async function decryptString(blobB64, key) {
  const blob = b64.decode(blobB64);
  const iv = blob.subarray(0, IV_LEN);
  const ct = blob.subarray(IV_LEN);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return new TextDecoder().decode(pt);
}

// -----------------------------------------------------------------------

(async () => {
  console.log('1) enrollUser — derivar KEK, generar master_key y envolverla');
  const password = 'super-secret-password-123';
  const saltB64 = b64.encode(randomBytes(16));
  const kek = await deriveKek(password, saltB64);
  const masterKey = await generateAesKey();
  const masterKeyWrapped = await wrapRawKey(masterKey, kek);
  console.log('   kdf_salt length (bytes):', b64.decode(saltB64).length);
  console.log(
    '   master_key_wrapped length (bytes):',
    b64.decode(masterKeyWrapped).length,
  );

  console.log('2) encryptNote — crear note_key, cifrar title y content');
  const noteKey = await generateAesKey();
  const noteKeyWrapped = await wrapRawKey(noteKey, masterKey);
  const titleCt = await encryptString('Reunión de arquitectura', noteKey);
  const contentCt = await encryptString(
    '# Agenda\n\n- revisar Fase 3\n- blind indexes\n- sync offline',
    noteKey,
  );
  console.log('   title_ciphertext (primeros 32 chars):', titleCt.slice(0, 32), '…');

  console.log('3) reload simulado — descartamos masterKey y kek');
  // Solo queda en "memoria del servidor": saltB64 y masterKeyWrapped.
  // Y en "memoria del cliente" antes del reload: titleCt, contentCt, noteKeyWrapped.

  console.log('4) unlockMasterKey — derivar KEK de nuevo y desenvolver');
  const kek2 = await deriveKek(password, saltB64);
  const masterKey2 = await unwrapRawKey(masterKeyWrapped, kek2, true);

  console.log('5) decryptNote — desenvolver note_key con master_key y descifrar');
  const noteKey2 = await unwrapRawKey(noteKeyWrapped, masterKey2, false);
  const title = await decryptString(titleCt, noteKey2);
  const content = await decryptString(contentCt, noteKey2);
  console.log('   title:', title);
  console.log('   content[0..40]:', content.slice(0, 40), '…');
  assert.equal(title, 'Reunión de arquitectura');
  assert.ok(content.includes('blind indexes'));

  console.log('6) password incorrecta → debe fallar la apertura');
  let failed = false;
  try {
    const badKek = await deriveKek('other-password', saltB64);
    await unwrapRawKey(masterKeyWrapped, badKek, true);
  } catch {
    failed = true;
  }
  assert.ok(failed, 'Una password errónea no debería abrir la bóveda');

  console.log('7) reencryptNote simulado — reutilizar noteKey al editar');
  const noteKeyReuse = await unwrapRawKey(noteKeyWrapped, masterKey2, false);
  const newContentCt = await encryptString(
    content + '\n- item agregado',
    noteKeyReuse,
  );
  const decoded = await decryptString(newContentCt, noteKeyReuse);
  assert.ok(decoded.includes('item agregado'));
  console.log('   ok — la note_key wrappeada no cambia entre versiones');

  console.log('\nOK — round-trip completo de cifrado E2E exitoso');
})().catch((err) => {
  console.error('FALLÓ:', err);
  process.exit(1);
});
