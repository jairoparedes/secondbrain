# Seguridad — Zero-Knowledge

> **Estado:** Fase 2 implementada. Las notas creadas en la app actual se
> cifran extremo a extremo en el navegador. El servidor no puede leerlas
> incluso teniendo acceso completo a la base de datos.

## Modelo de amenazas

Asumimos que el servidor puede ser **totalmente comprometido** (DB leak,
sysadmin malicioso, subpoena). El diseño debe garantizar que un atacante
con acceso completo al backend no puede leer ninguna nota.

**Atacantes que sí cubrimos:**
- Acceso a la base de datos Postgres.
- Acceso a los volúmenes de MinIO.
- Backups robados.
- Sysadmin con shell en el servidor.
- Interceptación TLS (las notas ya van cifradas adentro del túnel).

**Atacantes que NO cubrimos:**
- El propio dispositivo del usuario (si te roban el laptop con la app
  desbloqueada, ven todo).
- JavaScript malicioso servido al usuario (XSS o cadena de suministro
  comprometida en `npm install`).
- Keylogger en el cliente.

## Tres capas de claves

```
password (solo memoria del cliente, nunca se persiste)
   │
   ▼  Argon2id(salt = users.kdf_salt, t=3, m=64 MiB, p=1)
KEK  (256-bit, no extractable, vive dentro de WebCrypto)
   │
   ▼  AES-256-GCM wrap / unwrap
master_key  (256-bit, generada aleatoriamente al registro, nunca cambia)
   │
   ▼  AES-256-GCM wrap / unwrap (una por nota)
note_key  (256-bit, una por nota)
   │
   ▼  AES-256-GCM con IV aleatorio
title_ciphertext  +  content_ciphertext
```

**Por qué tres capas:**
- Rotar password = solo re-envolver la `master_key` con una KEK nueva.
  Las `note_keys` no se tocan, las notas no se re-cifran. Costo O(1).
- Compartir una nota individual = re-envolver su `note_key` con la
  `master_key` del receptor. No le damos acceso al resto. (Fase 6)
- Recuperación de cuenta con palabra semilla = `master_key` también
  se envuelve con una clave derivada de la palabra. (Futuro)

## Qué guarda el servidor

| Campo                    | Contenido                                     |
|--------------------------|-----------------------------------------------|
| `users.password`         | bcrypt(password) — para que Sanctum verifique credenciales |
| `users.kdf_salt`         | Salt público (cliente-generado, 16 B random) para derivar la KEK |
| `users.master_key_wrapped` | `AES-GCM(master_key, KEK)` — `iv \|\| ct+tag` |
| `notes.title_ciphertext` | `AES-GCM(title, note_key)` — `iv \|\| ct+tag` |
| `notes.content_ciphertext` | `AES-GCM(content, note_key)` — `iv \|\| ct+tag` |
| `notes.note_key_wrapped` | `AES-GCM(note_key, master_key)` — `iv \|\| ct+tag` |
| `notes.encryption_version` | `0` legacy plaintext, `1` AES-GCM v1 |
| `notes.iv`               | Reservado, vacío en v1 (cada blob es auto-contenido) |

**Formato del blob:** todos los blobs cifrados son `base64( IV(12B) ||
AES_GCM_output(ciphertext || auth_tag(16B)) )`. Auto-contenidos: el IV
viaja embebido, no se necesita columna separada.

## Qué NO guarda el servidor

- La contraseña en claro.
- La `master_key`.
- Las `note_keys` en claro.
- El contenido o título de las notas en texto plano.
- Ningún metadato derivado del contenido (fechas internas, longitudes
  reales del texto plano, etc. — solo se ve la longitud del ciphertext,
  que delata un rango pero no el contenido).

## Autenticación

- **Password** viaja al servidor en el cuerpo del POST de `/auth/register`
  y `/auth/login` (sobre TLS) **solo para el hash bcrypt**, nunca se usa
  para descifrar nada en el servidor.
- El servidor devuelve `kdf_salt` y `master_key_wrapped` al login; el
  cliente deriva la KEK localmente y desenvuelve la `master_key`.
- **Tokens Sanctum** (Bearer) por dispositivo. Revocables individualmente.
- En `/auth/change-password`, se revocan todos los demás tokens del
  usuario (manteniendo el actual) para forzar re-login en otros
  dispositivos con la nueva password.

### ¿Por qué la password viaja al servidor?

Para que Sanctum funcione necesitamos algún hash que el servidor pueda
verificar. Hay dos opciones:

1. **Lo actual:** mandar la password en claro sobre TLS, server bcrypt.
   Riesgo: si TLS rompe o el server tiene un MitM, la password se filtra.
2. **PAKE (PAKE2/OPAQUE):** la password nunca sale del cliente.
   Complejidad: alta, sin librerías PHP maduras, no hay urgencia.

**Decisión actual:** opción 1 con TLS estricto. Migración a OPAQUE pendiente
si el modelo de amenazas se vuelve más adversarial.

## Búsqueda sobre datos cifrados

Tres estrategias, combinables:

1. **Blind index** (rápido, parcial): el cliente genera
   `HMAC(token, master_key)` por cada palabra y lo envía; el servidor
   guarda el índice HMAC y puede hacer `WHERE blind_index = ?`. Sirve
   para exact match. **Fase 3**.
2. **Índice local** (completo): el cliente mantiene un índice invertido en
   IndexedDB, cifrado en reposo. Full-text real, cero fuga. **Fase 3**.
3. **Semántica cifrada** (futuro): embeddings generados en cliente,
   búsqueda por similitud se hace comparando vectores cifrados con
   técnicas de CKKS o similar. Fase >5.

**MVP de Fase 3:** (1) + (2). Semántica inicial en servidor (Fase 4)
**solo** con opt-in explícito del usuario (sacrifica zero-knowledge por
conveniencia).

## Rotación de claves

| Caso | Acción |
|---|---|
| Cambio de password | Cliente descifra `master_key` con la KEK vieja, deriva una KEK nueva con el `new_kdf_salt` y re-envuelve. Las `note_keys` no cambian. **O(1) en notas**. |
| Compromiso sospechado | Re-cifrar todas las `note_keys` (operación O(n) en el cliente, una vez). Pendiente. |
| Recuperación con palabra semilla | Generar una `recovery_key` desde una palabra semilla y envolver `master_key` también con ella. Pendiente. |

## Transporte (producción)

- **TLS 1.3** obligatorio. Caddy en producción se encarga automáticamente
  con Let's Encrypt; alternativa: certbot + nginx.
- **HSTS** con `max-age=31536000; includeSubDomains; preload`.
- **CSP estricta**:
  ```
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data:;
  connect-src 'self';
  frame-ancestors 'none';
  ```
  El `wasm-unsafe-eval` es necesario para `hash-wasm` (Argon2id WASM).
- **`X-Frame-Options: DENY`**
- **CORS**: whitelist por dominio. En dev `localhost`; en prod solo el
  dominio de la app.
- **Rate limiting** por IP + por usuario (Laravel `RateLimiter` + Redis).
  Fase 1 ya define el rate limiter `api` con 60 req/min/usuario.

## Auditoría (parcialmente implementado)

- Tabla `audit_log` ya creada por migración.
- Pendiente (Fase 2 endgame):
  - Trigger de Postgres que rechace `UPDATE` y `DELETE` (append-only real).
  - Hash en cadena (`prev_hash` + `hash` por fila) para detectar borrado.
  - Logging desde Laravel de eventos sensibles: login, change-password,
    creación de token, soft delete de nota, restore.

## Detalles concretos de la implementación

| Aspecto | Valor |
|---|---|
| KDF | Argon2id (`hash-wasm` v4.11) |
| Argon2id params | t=3, m=65536 (64 MiB), p=1, output 32 B |
| Cifrado simétrico | AES-256-GCM (Web Crypto API nativa) |
| Tamaño de IV | 12 B (recomendación GCM) |
| Tamaño de auth tag | 16 B (default Web Crypto) |
| Tamaño de master_key | 256 bits |
| Tamaño de note_key | 256 bits |
| KEK extractable | `false` (atrapada en WebCrypto) |
| master_key extractable | `true` (necesario para envolver note_keys) |
| note_key extractable | `false` (no hay razón para sacarla) |
| Persistencia de master_key | **Solo en memoria de la pestaña**. Nunca localStorage. |

## Cómo verificarlo

```bash
# Crear cuenta y nota desde la UI, después:
docker compose exec postgres psql -U secondbrain -d secondbrain -c \
  "SELECT email, kdf_salt, LEFT(master_key_wrapped, 30) FROM users;"

docker compose exec postgres psql -U secondbrain -d secondbrain -c \
  "SELECT id, encryption_version, LEFT(title_ciphertext, 30), LEFT(content_ciphertext, 30) FROM notes;"
```

Lo que ves: bytes base64 que no se parecen al texto que escribiste.
